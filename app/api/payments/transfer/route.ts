import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";
import { recalculateBookingTotal } from "../../../lib/server/booking-pricing";
import { getBankTransferConfig } from "../../../lib/payment-config";
import { commitMemberCredit, reserveMemberCredit } from "../../../lib/server/member-credit";
import { ensureBookingQrToken } from "../../../lib/domain/checkin-token";

const allowedTypes = new Set(["image/jpeg", "image/png", "application/pdf"]);

export async function POST(request: Request) {
  if (!(await getBankTransferConfig()))
    return Response.json(
      { error: "Las transferencias no están configuradas." },
      { status: 503 },
    );
  const form = await request.formData();
  const bookingId = form.get("bookingId");
  const receipt = form.get("receipt");
  const useCredit = form.get("useCredit") !== "false";
  if (typeof bookingId !== "string")
    return Response.json(
      { error: "Reservación inválida." },
      { status: 400 },
    );
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return Response.json({ error: "Tu sesión expiró." }, { status: 401 });
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, booking_number, profile_id, total_cents, currency, status, hike:hikes(name), booking_participants(id), booking_product_selections(product_id,variant,quantity,unit_price_cents,product:products(name))",
    )
    .eq("id", bookingId)
    .single();
  if (!booking || booking.status === "CANCELLED")
    return Response.json(
      { error: "Reservación no disponible." },
      { status: 404 },
    );
  const { count: signedCount } = await supabase
    .from("signed_waivers")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", booking.id);
  if ((signedCount ?? 0) < booking.booking_participants.length)
    return Response.json(
      { error: "Falta firmar la responsiva." },
      { status: 409 },
    );
  const service = createSupabaseServiceClient();
  let hikeSubtotal = 0;
  try {
    const pricing = await recalculateBookingTotal({
        bookingId: booking.id,
        profileId: booking.profile_id,
      });
    booking.total_cents = pricing.totalCents;
    hikeSubtotal = pricing.hikeSubtotal;
  } catch (pricingError) {
    return Response.json(
      {
        error:
          pricingError instanceof Error
            ? pricingError.message
            : "No pudimos verificar el total.",
      },
      { status: 409 },
    );
  }
  let creditApplied = 0;
  try {
    creditApplied = await reserveMemberCredit({
      bookingId: booking.id,
      profileId: booking.profile_id,
      maximumCents: hikeSubtotal,
      enabled: useCredit,
    });
  } catch (creditError) {
    return Response.json(
      { error: creditError instanceof Error ? creditError.message : "No pudimos aplicar tu crédito." },
      { status: 409 },
    );
  }
  const amountDue = Math.max(0, booking.total_cents - creditApplied);
  if (
    amountDue > 0 &&
    (!(receipt instanceof File) ||
      !allowedTypes.has(receipt.type) ||
      receipt.size > 10 * 1024 * 1024)
  )
    return Response.json(
      { error: "Usa una imagen o PDF de máximo 10 MB." },
      { status: 400 },
    );
  const hike = Array.isArray(booking.hike) ? booking.hike[0] : booking.hike;
  let { data: order } = await service
    .from("orders")
    .select("id")
    .eq("booking_id", booking.id)
    .is("fulfillment_mode", null)
    .limit(1)
    .maybeSingle();
  if (!order) {
    const result = await service
      .from("orders")
      .insert({
        order_number: `ORD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        profile_id: booking.profile_id,
        booking_id: booking.id,
        status: "PENDING",
        total_cents: booking.total_cents,
        currency: booking.currency,
      })
      .select("id")
      .single();
    if (result.error || !result.data)
      return Response.json(
        { error: "No pudimos crear la orden." },
        { status: 500 },
      );
    order = result.data;
  }
  const productSubtotal = booking.booking_product_selections.reduce(
    (sum, item) => sum + item.quantity * item.unit_price_cents,
    0,
  );
  const items = [
    {
      order_id: order.id,
      item_type: "HIKE",
      reference_id: booking.id,
      description: hike?.name ?? "Aventura The Doggy Gang",
      quantity: 1,
      unit_price_cents: booking.total_cents - productSubtotal,
    },
    ...booking.booking_product_selections.map((item) => {
      const product = Array.isArray(item.product)
        ? item.product[0]
        : item.product;
      return {
        order_id: order.id,
        item_type: "PRODUCT",
        reference_id: item.product_id,
        description: `${product?.name ?? "Producto"}${item.variant ? ` · ${item.variant}` : ""}`,
        quantity: item.quantity,
        unit_price_cents: item.unit_price_cents,
      };
    }),
  ];
  await service
    .from("orders")
    .update({ total_cents: booking.total_cents })
    .eq("id", order.id);
  await service.from("order_items").delete().eq("order_id", order.id);
  const { error: itemError } = await service.from("order_items").insert(items);
  if (itemError)
    return Response.json(
      { error: "No pudimos actualizar el detalle de la orden." },
      { status: 500 },
    );
  if (amountDue === 0) {
    const now = new Date().toISOString();
    const { error: inventoryError } = await service.rpc("commit_product_inventory", { p_order_id: order.id });
    if (inventoryError)
      return Response.json({ error: "No pudimos confirmar los productos de la orden." }, { status: 500 });
    await commitMemberCredit(booking.id);
    await service.from("orders").update({ status: "PAID" }).eq("id", order.id);
    await service.from("bookings").update({ status: "CONFIRMED", confirmed_at: now, expires_at: null }).eq("id", booking.id);
    await ensureBookingQrToken(booking.id);
    return Response.json({ ok: true, confirmed: true, creditAppliedCents: creditApplied });
  }
  if (!(receipt instanceof File))
    return Response.json({ error: "Sube tu comprobante." }, { status: 400 });
  const extension =
    receipt.type === "application/pdf"
      ? "pdf"
      : receipt.type === "image/png"
        ? "png"
        : "jpg";
  const storagePath = `${booking.profile_id}/${booking.id}/${crypto.randomUUID()}.${extension}`;
  const upload = await service.storage
    .from("payment-receipts")
    .upload(storagePath, await receipt.arrayBuffer(), {
      contentType: receipt.type,
      upsert: false,
    });
  if (upload.error)
    return Response.json(
      { error: "No pudimos guardar el comprobante." },
      { status: 500 },
    );
  const payment = await service
    .from("payments")
    .insert({
      order_id: order.id,
      provider: "bank_transfer",
      provider_payment_id: `transfer:${crypto.randomUUID()}`,
      method: "TRANSFER",
      status: "UNDER_REVIEW",
      amount_cents: amountDue,
    })
    .select("id")
    .single();
  if (payment.error || !payment.data)
    return Response.json(
      { error: "No pudimos registrar el pago." },
      { status: 500 },
    );
  await service
    .from("payment_receipts")
    .insert({
      payment_id: payment.data.id,
      uploaded_by: booking.profile_id,
      storage_path: storagePath,
    });
  await service
    .from("orders")
    .update({ status: "UNDER_REVIEW" })
    .eq("id", order.id);
  await service
    .from("bookings")
    .update({ status: "PENDING_PAYMENT" })
    .eq("id", booking.id);
  await service
    .from("audit_logs")
    .insert({
      actor_profile_id: booking.profile_id,
      action: "PAYMENT_RECEIPT_UPLOADED",
      entity_type: "booking",
      entity_id: booking.id,
      metadata: { storage_path: storagePath },
    });
  return Response.json({ ok: true });
}

import { z } from "zod";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../../../lib/supabase/service";
import { getStripeSecretKey } from "../../../../../lib/payment-config";

const schema = z.object({
  action: z.enum([
    "CANCEL",
    "COMPLETE",
    "REOPEN",
    "REJECT_CANCELLATION",
    "REFUND",
  ]),
  reason: z.string().trim().min(3).max(1200),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Reservación inválida." }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Selecciona una acción e indica el motivo." },
      { status: 400 },
    );
  const userClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });
  const { data: admin } = await userClient
    .from("profiles")
    .select("id,role,active")
    .eq("auth_user_id", user.id)
    .single();
  if (!admin?.active || admin.role !== "ADMIN")
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const service = createSupabaseServiceClient();
  const { data: booking } = await service
    .from("bookings")
    .select(
      "id,status,orders(id,status,payments(id,provider,provider_payment_id,status,amount_cents))",
    )
    .eq("id", id)
    .single();
  if (!booking)
    return Response.json(
      { error: "No encontramos la reservación." },
      { status: 404 },
    );
  const now = new Date().toISOString();
  if (parsed.data.action === "REFUND") {
    const payment = (booking.orders ?? [])
      .flatMap((order) => order.payments ?? [])
      .find((item) => item.status === "PAID");
    if (!payment)
      return Response.json(
        { error: "No existe un pago confirmado para reembolsar." },
        { status: 409 },
      );
    if (payment.provider === "stripe") {
      const key = await getStripeSecretKey();
      if (!key)
        return Response.json(
          { error: "Stripe no está configurado." },
          { status: 503 },
        );
      const sessionResponse = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(payment.provider_payment_id ?? "")}?expand[]=payment_intent`,
        { headers: { authorization: `Bearer ${key}` } },
      );
      const session = (await sessionResponse.json()) as {
        payment_intent?: string | { id?: string };
        error?: { message?: string };
      };
      const intent =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      if (!sessionResponse.ok || !intent)
        return Response.json(
          {
            error:
              session.error?.message ?? "Stripe no devolvió el pago original.",
          },
          { status: 502 },
        );
      const refundResponse = await fetch("https://api.stripe.com/v1/refunds", {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          payment_intent: intent,
          reason: "requested_by_customer",
          "metadata[booking_id]": booking.id,
        }),
      });
      const refund = (await refundResponse.json()) as {
        id?: string;
        error?: { message?: string };
      };
      if (!refundResponse.ok)
        return Response.json(
          { error: refund.error?.message ?? "Stripe rechazó el reembolso." },
          { status: 502 },
        );
    }
    await service
      .from("payments")
      .update({
        status: "REFUNDED",
        raw_status: `REFUNDED: ${parsed.data.reason}`,
      })
      .eq("id", payment.id);
    for (const order of booking.orders ?? [])
      await service.rpc("restore_product_inventory", { p_order_id: order.id });
    await service
      .from("orders")
      .update({ status: "REFUNDED" })
      .in(
        "id",
        (booking.orders ?? []).map((order) => order.id),
      );
    await service
      .from("bookings")
      .update({ status: "CANCELLED", cancelled_at: now })
      .eq("id", booking.id);
    await service
      .from("booking_cancellation_requests")
      .update({
        status: "REFUNDED",
        resolved_by: admin.id,
        resolution_note: parsed.data.reason,
        resolved_at: now,
      })
      .eq("booking_id", booking.id)
      .eq("status", "REQUESTED");
  } else if (parsed.data.action === "REJECT_CANCELLATION") {
    await service
      .from("booking_cancellation_requests")
      .update({
        status: "REJECTED",
        resolved_by: admin.id,
        resolution_note: parsed.data.reason,
        resolved_at: now,
      })
      .eq("booking_id", booking.id)
      .eq("status", "REQUESTED");
  } else {
    const update =
      parsed.data.action === "CANCEL"
        ? { status: "CANCELLED", cancelled_at: now }
        : parsed.data.action === "COMPLETE"
          ? { status: "COMPLETED" }
          : { status: "DRAFT", cancelled_at: null, confirmed_at: null };
    await service.from("bookings").update(update).eq("id", booking.id);
    if (parsed.data.action === "CANCEL")
      await service
        .from("booking_cancellation_requests")
        .update({
          status: "APPROVED",
          resolved_by: admin.id,
          resolution_note: parsed.data.reason,
          resolved_at: now,
        })
        .eq("booking_id", booking.id)
        .eq("status", "REQUESTED");
  }
  await service
    .from("audit_logs")
    .insert({
      actor_profile_id: admin.id,
      action: `BOOKING_${parsed.data.action}`,
      entity_type: "booking",
      entity_id: booking.id,
      metadata: { reason: parsed.data.reason },
    });
  return Response.json({ ok: true });
}

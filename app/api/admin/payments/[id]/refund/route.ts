import { z } from "zod";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../../../lib/supabase/service";
import { getStripeSecretKey } from "../../../../../lib/payment-config";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const reason = z
    .object({ reason: z.string().trim().min(3).max(1000) })
    .safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !reason.success)
    return Response.json({ error: "Pago o motivo inválido." }, { status: 400 });
  const userClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  const { data: admin } = user
    ? await userClient
        .from("profiles")
        .select("id,role,active")
        .eq("auth_user_id", user.id)
        .single()
    : { data: null };
  if (!admin?.active || admin.role !== "ADMIN")
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const service = createSupabaseServiceClient();
  const { data: payment } = await service
    .from("payments")
    .select(
      "id,provider,provider_payment_id,status,order_id,order:orders(booking_id)",
    )
    .eq("id", id)
    .single();
  if (!payment || payment.status !== "PAID")
    return Response.json(
      { error: "El pago no está disponible para reembolso." },
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
            session.error?.message ??
            "No encontramos el pago original en Stripe.",
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
      }),
    });
    const refund = (await refundResponse.json()) as {
      error?: { message?: string };
    };
    if (!refundResponse.ok)
      return Response.json(
        { error: refund.error?.message ?? "Stripe rechazó el reembolso." },
        { status: 502 },
      );
  }
  await service.rpc("restore_product_inventory", {
    p_order_id: payment.order_id,
  });
  await service
    .from("payments")
    .update({
      status: "REFUNDED",
      raw_status: `REFUNDED: ${reason.data.reason}`,
    })
    .eq("id", payment.id);
  await service
    .from("orders")
    .update({ status: "REFUNDED" })
    .eq("id", payment.order_id);
  const order = Array.isArray(payment.order) ? payment.order[0] : payment.order;
  if (order?.booking_id)
    await service
      .from("bookings")
      .update({ status: "CANCELLED", cancelled_at: new Date().toISOString() })
      .eq("id", order.booking_id);
  await service
    .from("audit_logs")
    .insert({
      actor_profile_id: admin.id,
      action: "PAYMENT_REFUNDED",
      entity_type: "payment",
      entity_id: payment.id,
      metadata: { reason: reason.data.reason, booking_id: order?.booking_id },
    });
  return Response.json({ ok: true });
}

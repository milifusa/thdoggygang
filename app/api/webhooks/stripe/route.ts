import { createSupabaseServiceClient } from "../../../lib/supabase/service";
import { ensureBookingQrToken } from "../../../lib/domain/checkin-token";
import { getStripeWebhookSecret } from "../../../lib/payment-config";

function parseSignature(header: string) {
  const timestamp = header
    .split(",")
    .find((part) => part.startsWith("t="))
    ?.slice(2);
  const signatures = header
    .split(",")
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));
  return { timestamp, signatures };
}
async function verifyStripeSignature(
  body: string,
  header: string,
  secret: string,
) {
  const parsed = parseSignature(header);
  if (
    !parsed.timestamp ||
    parsed.signatures.length === 0 ||
    Math.abs(Date.now() / 1000 - Number(parsed.timestamp)) > 300
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signedPayload = new TextEncoder().encode(
    `${parsed.timestamp}.${body}`,
  );
  for (const candidate of parsed.signatures) {
    if (!/^[a-f\d]{64}$/i.test(candidate)) continue;
    const signature = Uint8Array.from(
      candidate.match(/.{2}/g) ?? [],
      (pair) => Number.parseInt(pair, 16),
    );
    if (await crypto.subtle.verify("HMAC", key, signature, signedPayload))
      return true;
  }
  return false;
}

export async function POST(request: Request) {
  const secret = await getStripeWebhookSecret();
  const signature = request.headers.get("stripe-signature");
  const raw = await request.text();
  if (
    !secret ||
    !signature ||
    !(await verifyStripeSignature(raw, signature, secret))
  )
    return Response.json({ error: "Firma inválida." }, { status: 401 });
  let event: {
    id: string;
    type: string;
    data: {
      object: {
        id: string;
        payment_status?: string;
        metadata?: { booking_id?: string; order_id?: string };
      };
    };
  };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    return Response.json({ error: "Evento inválido." }, { status: 400 });
  }
  if (!event.id || !event.type)
    return Response.json({ error: "Evento inválido." }, { status: 400 });
  const service = createSupabaseServiceClient();
  const { error: eventError } = await service
    .from("payment_webhook_events")
    .insert({
      provider: "stripe",
      event_id: event.id,
      event_type: event.type,
      payload: event,
    });
  const duplicate = eventError?.code === "23505";
  if (eventError && !duplicate)
    return Response.json(
      { error: "No pudimos registrar el evento." },
      { status: 500 },
    );
  if (
    event.type === "checkout.session.completed" &&
    event.data.object.payment_status === "paid"
  ) {
    const bookingId = event.data.object.metadata?.booking_id;
    const orderId = event.data.object.metadata?.order_id;
    if (orderId) {
      const { data: payment, error: paymentError } = await service
        .from("payments")
        .update({
          status: "PAID",
          paid_at: new Date().toISOString(),
          raw_status: event.type,
        })
        .eq("provider", "stripe")
        .eq("provider_payment_id", event.data.object.id)
        .eq("order_id", orderId)
        .select("id")
        .maybeSingle();
      if (paymentError || !payment)
        return Response.json(
          { error: "No pudimos conciliar el pago." },
          { status: 500 },
        );
      const { error: orderError } = await service
        .from("orders")
        .update({ status: "PAID" })
        .eq("id", orderId);
      if (orderError)
        return Response.json(
          { error: "No pudimos confirmar la orden." },
          { status: 500 },
        );
      const { error: inventoryError } = await service.rpc(
        "commit_product_inventory",
        { p_order_id: orderId },
      );
      if (inventoryError)
        return Response.json(
          { error: "No pudimos confirmar el inventario." },
          { status: 500 },
        );
      if (bookingId) {
        const { error: bookingError } = await service
          .from("bookings")
          .update({
            status: "CONFIRMED",
            confirmed_at: new Date().toISOString(),
          })
          .eq("id", bookingId);
        if (bookingError)
          return Response.json(
            { error: "No pudimos confirmar la reservación." },
            { status: 500 },
          );
        await ensureBookingQrToken(bookingId);
      }
    }
  }
  return Response.json({ received: true, duplicate });
}

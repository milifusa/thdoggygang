import { createSupabaseServiceClient } from "../../../lib/supabase/service";
import { ensureBookingQrToken } from "../../../lib/domain/checkin-token";
import { getStripeWebhookSecret } from "../../../lib/payment-config";

function parseSignature(header: string) {
  return Object.fromEntries(
    header.split(",").map((part) => part.split("=", 2) as [string, string]),
  );
}
async function verifyStripeSignature(
  body: string,
  header: string,
  secret: string,
) {
  const parsed = parseSignature(header);
  if (
    !parsed.t ||
    !parsed.v1 ||
    Math.abs(Date.now() / 1000 - Number(parsed.t)) > 300
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signature = Uint8Array.from(parsed.v1.match(/.{2}/g) ?? [], (pair) =>
    Number.parseInt(pair, 16),
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(`${parsed.t}.${body}`),
  );
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
  const event = JSON.parse(raw) as {
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
  const service = createSupabaseServiceClient();
  const { error: eventError } = await service
    .from("payment_webhook_events")
    .insert({
      provider: "stripe",
      event_id: event.id,
      event_type: event.type,
      payload: event,
    });
  if (eventError?.code === "23505")
    return Response.json({ received: true, duplicate: true });
  if (eventError)
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
      await service
        .from("payments")
        .update({
          status: "PAID",
          paid_at: new Date().toISOString(),
          raw_status: event.type,
        })
        .eq("provider", "stripe")
        .eq("provider_payment_id", event.data.object.id);
      await service.from("orders").update({ status: "PAID" }).eq("id", orderId);
      await service.rpc("commit_product_inventory", { p_order_id: orderId });
      if (bookingId) {
        await service
          .from("bookings")
          .update({
            status: "CONFIRMED",
            confirmed_at: new Date().toISOString(),
          })
          .eq("id", bookingId);
        await ensureBookingQrToken(bookingId);
      }
    }
  }
  return Response.json({ received: true });
}

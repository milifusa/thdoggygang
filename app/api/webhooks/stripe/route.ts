import { createSupabaseServiceClient } from "../../../lib/supabase/service";
import { getStripeWebhookSecret } from "../../../lib/payment-config";
import {
  confirmStripeCheckout,
  expireStripeCheckout,
} from "../../../lib/server/stripe-payment-reconciliation";

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
      try {
        await confirmStripeCheckout({
          sessionId: event.data.object.id,
          orderId,
          bookingId,
          rawStatus: event.type,
        });
      } catch {
        return Response.json(
          { error: "No pudimos conciliar el pago." },
          { status: 500 },
        );
      }
    }
  }
  if (
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    try {
      await expireStripeCheckout({
        sessionId: event.data.object.id,
        orderId: event.data.object.metadata?.order_id,
        rawStatus: event.type,
      });
    } catch {
      return Response.json(
        { error: "No pudimos cerrar el intento de pago." },
        { status: 500 },
      );
    }
  }
  return Response.json({ received: true, duplicate });
}

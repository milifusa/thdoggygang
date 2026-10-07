import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";

export const runtime = "nodejs";

type ResendWebhook = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    bounce?: { message?: string };
    failed?: { reason?: string };
  };
};

const terminalStatuses = new Set([
  "BOUNCED",
  "COMPLAINED",
  "FAILED",
  "SUPPRESSED",
]);

function verifySignature(request: Request, rawBody: string) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const eventId = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signatures = request.headers.get("svix-signature");
  if (!secret || !eventId || !timestamp || !signatures) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300)
    return false;
  try {
    const key = Buffer.from(secret.replace(/^whsec_/u, ""), "base64");
    const expected = createHmac("sha256", key)
      .update(`${eventId}.${timestamp}.${rawBody}`)
      .digest();
    return signatures.split(" ").some((candidate) => {
      const encoded = candidate.startsWith("v1,")
        ? candidate.slice(3)
        : candidate;
      const actual = Buffer.from(encoded, "base64");
      return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
      );
    });
  } catch {
    return false;
  }
}

function eventState(type: string) {
  const states: Record<string, string> = {
    "email.sent": "SENT",
    "email.delivery_delayed": "DELAYED",
    "email.delivered": "DELIVERED",
    "email.opened": "OPENED",
    "email.clicked": "CLICKED",
    "email.bounced": "BOUNCED",
    "email.complained": "COMPLAINED",
    "email.failed": "FAILED",
    "email.suppressed": "SUPPRESSED",
  };
  return states[type] ?? null;
}

function canAdvance(current: string, next: string) {
  if (terminalStatuses.has(current)) return terminalStatuses.has(next);
  if (terminalStatuses.has(next)) return true;
  const rank = ["QUEUED", "SENT", "DELAYED", "DELIVERED", "OPENED", "CLICKED"];
  return rank.indexOf(next) >= rank.indexOf(current);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifySignature(request, rawBody))
    return Response.json({ error: "Firma no válida." }, { status: 401 });
  let event: ResendWebhook;
  try {
    event = JSON.parse(rawBody) as ResendWebhook;
  } catch {
    return Response.json({ error: "Evento no válido." }, { status: 400 });
  }
  const eventId = request.headers.get("svix-id")!;
  const providerId = event.data?.email_id;
  const type = event.type ?? "unknown";
  const service = createSupabaseServiceClient();
  const { data: delivery } = providerId
    ? await service
        .from("email_deliveries")
        .select("id,status")
        .eq("provider", "resend")
        .eq("provider_id", providerId)
        .maybeSingle()
    : { data: null };
  const eventInsert = await service.from("email_delivery_events").insert({
    event_id: eventId,
    delivery_id: delivery?.id ?? null,
    provider_id: providerId ?? null,
    event_type: type,
    recipient: event.data?.to?.[0] ?? null,
    payload: event,
    event_created_at: event.created_at ?? null,
  });
  if (eventInsert.error?.code === "23505")
    return Response.json({ received: true, duplicate: true });
  if (eventInsert.error)
    return Response.json(
      { error: "No pudimos registrar el evento." },
      { status: 500 },
    );

  const next = eventState(type);
  if (!delivery || !next || !canAdvance(delivery.status, next))
    return Response.json({ received: true });
  const occurredAt = event.created_at ?? new Date().toISOString();
  const errorMessage =
    event.data?.bounce?.message ?? event.data?.failed?.reason ?? null;
  const update: Record<string, unknown> = {
    status: next,
    last_event_at: occurredAt,
    updated_at: new Date().toISOString(),
  };
  if (next === "DELIVERED") update.delivered_at = occurredAt;
  if (next === "OPENED") update.opened_at = occurredAt;
  if (next === "CLICKED") update.clicked_at = occurredAt;
  if (next === "BOUNCED") update.bounced_at = occurredAt;
  if (next === "COMPLAINED") update.complained_at = occurredAt;
  if (["FAILED", "SUPPRESSED"].includes(next)) update.failed_at = occurredAt;
  if (errorMessage) update.error_message = errorMessage;
  await service.from("email_deliveries").update(update).eq("id", delivery.id);

  if (providerId) {
    const communicationStatus = terminalStatuses.has(next)
      ? "FAILED"
      : ["DELIVERED", "OPENED", "CLICKED"].includes(next)
        ? "DELIVERED"
        : "SENT";
    await service
      .from("booking_communications")
      .update({ status: communicationStatus })
      .eq("provider_id", providerId);
  }
  return Response.json({ received: true });
}

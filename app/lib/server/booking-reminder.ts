import { createSupabaseServiceClient } from "../supabase/service";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}
function renderTemplate(value: string, variables: Record<string, string>) {
  return Object.entries(variables).reduce(
    (result, [key, replacement]) => result.replaceAll(`{${key}}`, replacement),
    value,
  );
}

export async function sendBookingReminder(
  bookingId: string,
  actorProfileId: string,
) {
  const service = createSupabaseServiceClient();
  const { data: booking } = await service
    .from("bookings")
    .select(
      "id,booking_number,status,current_step,last_reminder_at,profile:profiles(first_name,email),hike:hikes(name,slug,starts_at)",
    )
    .eq("id", bookingId)
    .single();
  if (!booking || !["DRAFT", "PENDING_PAYMENT"].includes(booking.status))
    throw new Error("La reservación ya no necesita un recordatorio.");
  const profile = Array.isArray(booking.profile)
    ? booking.profile[0]
    : booking.profile;
  const hike = Array.isArray(booking.hike) ? booking.hike[0] : booking.hike;
  if (!profile?.email || !hike)
    throw new Error("La reservación no tiene un correo válido.");
  if (
    booking.last_reminder_at &&
    Date.now() - new Date(booking.last_reminder_at).getTime() <
      12 * 60 * 60 * 1000
  )
    throw new Error(
      "Ya se envió un recordatorio durante las últimas 12 horas.",
    );
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Resend no está configurado.");

  const rawToken = randomToken();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  await service
    .from("booking_continue_tokens")
    .insert({
      booking_id: booking.id,
      token_hash: await sha256(rawToken),
      current_step: booking.current_step,
      expires_at: expiresAt.toISOString(),
      created_by: actorProfileId,
    });
  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.thedoggygang.com"
  ).replace(/\/$/u, "");
  const continueUrl = `${baseUrl}/reserva/continuar/${rawToken}`;
  const { data: template } = await service
    .from("email_templates")
    .select("subject,heading,body,button_label")
    .eq("key", "BOOKING_REMINDER")
    .eq("active", true)
    .maybeSingle();
  const variables = {
    nombre_cliente: profile.first_name || "amigo",
    hike: hike.name,
    fecha_hike: new Intl.DateTimeFormat("es-MX", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "America/Mexico_City",
    }).format(new Date(hike.starts_at)),
    paso_pendiente: booking.current_step,
    url_continuar: continueUrl,
  };
  const subject = renderTemplate(
    template?.subject ?? "Tu aventura sigue esperando",
    variables,
  );
  const heading = renderTemplate(
    template?.heading ?? "Termina tu reservación",
    variables,
  );
  const body = renderTemplate(
    template?.body ??
      "Guardamos tu avance para que puedas retomar tu reservación.",
    variables,
  );
  const buttonLabel = renderTemplate(
    template?.button_label ?? "CONTINUAR RESERVACIÓN",
    variables,
  );
  const html = `<!doctype html><html><body style="margin:0;background:#f5f2eb;color:#261e18;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #ded8cf"><tr><td style="padding:26px 32px;background:#12173a;color:#fff;font-weight:900;letter-spacing:2px">THE DOGGY GANG</td></tr><tr><td style="padding:38px 32px"><p style="margin:0 0 8px;color:#b86729;font-size:12px;font-weight:900;letter-spacing:2px">${escapeHtml(booking.booking_number)} · ${escapeHtml(hike.name)}</p><h1 style="margin:0 0 18px;font-size:38px;line-height:1">${escapeHtml(heading)}</h1><p style="font-size:17px;line-height:1.6;color:#5f5854">Hola ${escapeHtml(profile.first_name || "amigo")}. ${escapeHtml(body)}</p><p style="font-size:15px;line-height:1.5;color:#5f5854">El enlace vence en 72 horas y te llevará al paso ${escapeHtml(booking.current_step)}.</p><a href="${continueUrl}" style="display:inline-block;margin-top:16px;padding:17px 24px;background:#f5ba5f;color:#261e18;text-decoration:none;font-size:13px;font-weight:900;letter-spacing:1px">${escapeHtml(buttonLabel)}</a><p style="margin-top:28px;font-size:12px;color:#817873">Si no solicitaste este mensaje, puedes ignorarlo.</p></td></tr></table></td></tr></table></body></html>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from:
        process.env.RESEND_FROM_EMAIL ||
        "The Doggy Gang <hola@thedoggygang.com>",
      to: [profile.email],
      subject,
      html,
    }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  const sentAt = new Date().toISOString();
  await service
    .from("booking_communications")
    .insert({
      booking_id: booking.id,
      channel: "EMAIL",
      kind: "BOOKING_REMINDER",
      recipient: profile.email,
      status: response.ok ? "SENT" : "FAILED",
      provider_id: result.id,
      metadata: response.ok
        ? { step: booking.current_step, expiresAt: expiresAt.toISOString() }
        : { error: result.message ?? "Resend rejected the request" },
      sent_by: actorProfileId,
      sent_at: response.ok ? sentAt : null,
    });
  if (!response.ok)
    throw new Error(result.message ?? "Resend no pudo enviar el correo.");
  await Promise.all([
    service
      .from("bookings")
      .update({ last_reminder_at: sentAt })
      .eq("id", booking.id),
    service
      .from("audit_logs")
      .insert({
        actor_profile_id: actorProfileId,
        action: "BOOKING_REMINDER_SENT",
        entity_type: "booking",
        entity_id: booking.id,
        metadata: { recipient: profile.email, step: booking.current_step },
      }),
  ]);
  return { ok: true, recipient: profile.email };
}

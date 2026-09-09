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

export async function sendUpcomingHikeReminder(
  bookingId: string,
  kind: "HIKE_REMINDER_7D" | "HIKE_REMINDER_1D",
  actorProfileId: string,
) {
  const service = createSupabaseServiceClient();
  const { data: booking } = await service
    .from("bookings")
    .select("id,booking_number,status,profile_id,profile:profiles(first_name,email),hike:hikes(name,slug,starts_at,meeting_point,location_name)")
    .eq("id", bookingId)
    .single();
  const profile = Array.isArray(booking?.profile) ? booking?.profile[0] : booking?.profile;
  const hike = Array.isArray(booking?.hike) ? booking?.hike[0] : booking?.hike;
  if (!booking || booking.status !== "CONFIRMED" || !profile?.email || !hike)
    throw new Error("La reservación no admite este recordatorio.");
  const { data: existing } = await service.from("booking_communications").select("id").eq("booking_id", booking.id).eq("kind", kind).eq("status", "SENT").limit(1).maybeSingle();
  if (existing) return { ok: true, skipped: true, recipient: profile.email };
  const { data: preferences } = await service.from("member_notification_preferences").select("email_enabled,reminder_7d,reminder_1d").eq("profile_id", booking.profile_id).maybeSingle();
  if (preferences?.email_enabled === false || (kind === "HIKE_REMINDER_7D" && preferences?.reminder_7d === false) || (kind === "HIKE_REMINDER_1D" && preferences?.reminder_1d === false))
    return { ok: true, skipped: true, recipient: profile.email };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Resend no está configurado.");
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.thedoggygang.com").replace(/\/$/u, "");
  const centerUrl = `${baseUrl}/mi-manada/aventuras/${hike.slug}`;
  const { data: template } = await service.from("email_templates").select("subject,heading,body,button_label").eq("key", kind).eq("active", true).maybeSingle();
  const subject = template?.subject ?? (kind === "HIKE_REMINDER_7D" ? "Tu aventura es en una semana" : "Mañana caminamos en manada");
  const heading = template?.heading ?? "Tu aventura se acerca";
  const body = template?.body ?? "Revisa el punto de encuentro y prepara lo necesario para caminar juntos.";
  const button = template?.button_label ?? "ABRIR CENTRO DE AVENTURA";
  const when = new Intl.DateTimeFormat("es-MX", { dateStyle: "full", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(hike.starts_at));
  const html = `<!doctype html><html><body style="margin:0;background:#f5f2eb;color:#261e18;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #ded8cf"><tr><td style="padding:26px 32px;background:#12173a;color:#fff;font-weight:900;letter-spacing:2px">THE DOGGY GANG</td></tr><tr><td style="padding:38px 32px"><p style="margin:0 0 8px;color:#b86729;font-size:12px;font-weight:900;letter-spacing:2px">${escapeHtml(booking.booking_number)}</p><h1 style="margin:0 0 18px;font-size:38px;line-height:1">${escapeHtml(heading)}</h1><p style="font-size:17px;line-height:1.6;color:#5f5854">Hola ${escapeHtml(profile.first_name || "amigo")}. ${escapeHtml(body)}</p><p style="font-size:15px;line-height:1.6"><strong>${escapeHtml(hike.name)}</strong><br>${escapeHtml(when)}<br>${escapeHtml(hike.meeting_point || hike.location_name)}</p><a href="${centerUrl}" style="display:inline-block;margin-top:16px;padding:17px 24px;background:#f5ba5f;color:#261e18;text-decoration:none;font-size:13px;font-weight:900;letter-spacing:1px">${escapeHtml(button)}</a></td></tr></table></td></tr></table></body></html>`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL || "The Doggy Gang <hola@thedoggygang.com>", to: [profile.email], subject, html }) });
  const result = await response.json().catch(() => ({})) as { id?: string; message?: string };
  await service.from("booking_communications").insert({ booking_id: booking.id, channel: "EMAIL", kind, recipient: profile.email, status: response.ok ? "SENT" : "FAILED", provider_id: result.id, metadata: response.ok ? { startsAt: hike.starts_at } : { error: result.message ?? "Resend rejected the request" }, sent_by: actorProfileId, sent_at: response.ok ? new Date().toISOString() : null });
  if (!response.ok) throw new Error(result.message ?? "Resend no pudo enviar el correo.");
  await service.from("notifications").insert({ profile_id: booking.profile_id, channel: "IN_APP", template_key: kind, payload: { bookingId: booking.id, hike: hike.name, startsAt: hike.starts_at, url: `/mi-manada/aventuras/${hike.slug}` }, status: "SENT", sent_at: new Date().toISOString() });
  return { ok: true, recipient: profile.email };
}

export async function sendWaitlistOfferForHike(hikeId: string) {
  const service = createSupabaseServiceClient();
  const { data: entry } = await service.from("waitlist_entries").select("id,profile_id,offer_expires_at,profile:profiles(first_name,email),hike:hikes(name,slug,starts_at)").eq("hike_id", hikeId).eq("status", "OFFERED").is("notified_at", null).order("updated_at").limit(1).maybeSingle();
  const profile = Array.isArray(entry?.profile) ? entry?.profile[0] : entry?.profile;
  const hike = Array.isArray(entry?.hike) ? entry?.hike[0] : entry?.hike;
  if (!entry || !profile?.email || !hike) return { ok: true, skipped: true };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Resend no está configurado.");
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.thedoggygang.com").replace(/\/$/u, "");
  const reserveUrl = `${baseUrl}/reservar/${hike.slug}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f2eb;color:#261e18;font-family:Arial,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" style="max-width:620px;background:#fff;border:1px solid #ded8cf"><tr><td style="padding:26px 32px;background:#12173a;color:#fff;font-weight:900;letter-spacing:2px">THE DOGGY GANG</td></tr><tr><td style="padding:38px 32px"><p style="color:#b86729;font-size:12px;font-weight:900;letter-spacing:2px">LISTA DE ESPERA</p><h1 style="font-size:38px;line-height:1">Se liberó un lugar.</h1><p style="font-size:17px;line-height:1.6;color:#5f5854">Hola ${escapeHtml(profile.first_name || "amigo")}. Ya puedes reservar ${escapeHtml(hike.name)}. La oportunidad vence en 24 horas y el cupo se confirma al completar el pago.</p><a href="${reserveUrl}" style="display:inline-block;margin-top:16px;padding:17px 24px;background:#f5ba5f;color:#261e18;text-decoration:none;font-size:13px;font-weight:900">RESERVAR MI LUGAR</a></td></tr></table></td></tr></table></body></html>`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL || "The Doggy Gang <hola@thedoggygang.com>", to: [profile.email], subject: `Se liberó un lugar para ${hike.name}`, html }) });
  const result = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(result.message ?? "Resend no pudo enviar la oferta.");
  await service.from("waitlist_entries").update({ notified_at: new Date().toISOString() }).eq("id", entry.id);
  return { ok: true, recipient: profile.email };
}

export async function notifyConfirmedHikeChange(hikeId: string, changes: string[]) {
  if (!changes.length) return { ok: true, sent: 0 };
  const service = createSupabaseServiceClient();
  const { data: hike } = await service.from("hikes").select("name,slug,starts_at,meeting_point,location_name").eq("id", hikeId).single();
  if (!hike) return { ok: true, sent: 0 };
  const { data: bookings } = await service.from("bookings").select("id,profile_id,profile:profiles(first_name,email),preferences:profiles(member_notification_preferences(email_enabled,route_changes))").eq("hike_id", hikeId).eq("status", "CONFIRMED");
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.thedoggygang.com").replace(/\/$/u, "");
  let sent = 0;
  for (const booking of bookings ?? []) {
    const profile = Array.isArray(booking.profile) ? booking.profile[0] : booking.profile;
    const profileContainer = Array.isArray(booking.preferences) ? booking.preferences[0] : booking.preferences;
    const preference = Array.isArray(profileContainer?.member_notification_preferences) ? profileContainer?.member_notification_preferences[0] : profileContainer?.member_notification_preferences;
    if (preference?.route_changes === false) continue;
    await service.from("notifications").insert({ profile_id: booking.profile_id, channel: "IN_APP", template_key: "HIKE_CHANGED", payload: { hike: hike.name, url: `/mi-manada/aventuras/${hike.slug}`, changes }, status: "SENT", sent_at: new Date().toISOString() });
    if (!profile?.email || preference?.email_enabled === false || !process.env.RESEND_API_KEY) continue;
    const url = `${baseUrl}/mi-manada/aventuras/${hike.slug}`;
    const html = `<!doctype html><html><body style="margin:0;background:#f5f2eb;color:#261e18;font-family:Arial,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" style="max-width:620px;background:#fff"><tr><td style="padding:26px 32px;background:#12173a;color:#fff;font-weight:900">THE DOGGY GANG</td></tr><tr><td style="padding:38px 32px"><p style="color:#b86729;font-weight:900">ACTUALIZACIÓN DE RUTA</p><h1>Revisa tu aventura.</h1><p>Hola ${escapeHtml(profile.first_name || "amigo")}. Actualizamos ${escapeHtml(hike.name)}: ${escapeHtml(changes.join(", "))}.</p><p><strong>${escapeHtml(new Intl.DateTimeFormat("es-MX", { dateStyle: "full", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(hike.starts_at)))}</strong><br>${escapeHtml(hike.meeting_point || hike.location_name)}</p><a href="${url}" style="display:inline-block;padding:17px 24px;background:#f5ba5f;color:#261e18;text-decoration:none;font-weight:900">ABRIR CENTRO DE AVENTURA</a></td></tr></table></td></tr></table></body></html>`;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL || "The Doggy Gang <hola@thedoggygang.com>", to: [profile.email], subject: `Actualización importante de ${hike.name}`, html }) });
    if (response.ok) sent += 1;
  }
  return { ok: true, sent };
}

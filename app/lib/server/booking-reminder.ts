import { createSupabaseServiceClient } from "../supabase/service";
import { sendBrandedEmail } from "./email-renderer";

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
  let result: { id: string | null } | null = null;
  let sendError: string | null = null;
  try {
    result = await sendBrandedEmail({
      key: "BOOKING_REMINDER",
      to: profile.email,
      variables,
      actionUrl: continueUrl,
      detailLines: [
        booking.booking_number,
        `${hike.name} · ${variables.fecha_hike}`,
        `Paso pendiente: ${booking.current_step}`,
      ],
      note: "El enlace vence en 72 horas. Si no solicitaste este mensaje, puedes ignorarlo.",
    });
  } catch (error) {
    sendError = error instanceof Error ? error.message : "Resend rechazó el envío";
  }
  const sentAt = new Date().toISOString();
  await service
    .from("booking_communications")
    .insert({
      booking_id: booking.id,
      channel: "EMAIL",
      kind: "BOOKING_REMINDER",
      recipient: profile.email,
      status: result ? "SENT" : "FAILED",
      provider_id: result?.id,
      metadata: result
        ? { step: booking.current_step, expiresAt: expiresAt.toISOString() }
        : { error: sendError ?? "Resend rejected the request" },
      sent_by: actorProfileId,
      sent_at: result ? sentAt : null,
    });
  if (!result) throw new Error(sendError ?? "Resend no pudo enviar el correo.");
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
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.thedoggygang.com").replace(/\/$/u, "");
  const centerUrl = `${baseUrl}/mi-manada/aventuras/${hike.slug}`;
  const when = new Intl.DateTimeFormat("es-MX", { dateStyle: "full", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(hike.starts_at));
  const variables = { nombre_cliente: profile.first_name || "amigo", hike: hike.name, fecha_hike: when, punto_encuentro: hike.meeting_point || hike.location_name, url_aventura: centerUrl };
  let result: { id: string | null } | null = null;
  let sendError: string | null = null;
  try { result = await sendBrandedEmail({ key: kind, to: profile.email, variables, actionUrl: centerUrl, detailLines: [booking.booking_number, hike.name, when, variables.punto_encuentro], note: "Revisa los datos antes de salir y avísanos si necesitas ayuda." }); }
  catch (error) { sendError = error instanceof Error ? error.message : "Resend rechazó el envío"; }
  await service.from("booking_communications").insert({ booking_id: booking.id, channel: "EMAIL", kind, recipient: profile.email, status: result ? "SENT" : "FAILED", provider_id: result?.id, metadata: result ? { startsAt: hike.starts_at } : { error: sendError ?? "Resend rejected the request" }, sent_by: actorProfileId, sent_at: result ? new Date().toISOString() : null });
  if (!result) throw new Error(sendError ?? "Resend no pudo enviar el correo.");
  await service.from("notifications").insert({ profile_id: booking.profile_id, channel: "IN_APP", template_key: kind, payload: { bookingId: booking.id, hike: hike.name, startsAt: hike.starts_at, url: `/mi-manada/aventuras/${hike.slug}` }, status: "SENT", sent_at: new Date().toISOString() });
  return { ok: true, recipient: profile.email };
}

export async function sendWaitlistOfferForHike(hikeId: string) {
  const service = createSupabaseServiceClient();
  const { data: entry } = await service.from("waitlist_entries").select("id,profile_id,offer_expires_at,profile:profiles(first_name,email),hike:hikes(name,slug,starts_at)").eq("hike_id", hikeId).eq("status", "OFFERED").is("notified_at", null).order("updated_at").limit(1).maybeSingle();
  const profile = Array.isArray(entry?.profile) ? entry?.profile[0] : entry?.profile;
  const hike = Array.isArray(entry?.hike) ? entry?.hike[0] : entry?.hike;
  if (!entry || !profile?.email || !hike) return { ok: true, skipped: true };
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.thedoggygang.com").replace(/\/$/u, "");
  const reserveUrl = `${baseUrl}/reservar/${hike.slug}`;
  const when = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(hike.starts_at));
  await sendBrandedEmail({ key: "WAITLIST_OFFER", to: profile.email, variables: { nombre_cliente: profile.first_name || "amigo", hike: hike.name, fecha_hike: when, url_reserva: reserveUrl }, actionUrl: reserveUrl, detailLines: [hike.name, when], note: "La oportunidad vence en 24 horas y se confirma al completar el pago." });
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
    const when = new Intl.DateTimeFormat("es-MX", { dateStyle: "full", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(hike.starts_at));
    try {
      await sendBrandedEmail({ key: "HIKE_CHANGED", to: profile.email, variables: { nombre_cliente: profile.first_name || "amigo", hike: hike.name, fecha_hike: when, punto_encuentro: hike.meeting_point || hike.location_name, cambios: changes.join(", "), url_aventura: url }, actionUrl: url, detailLines: [when, hike.meeting_point || hike.location_name], note: "Revisa la información actualizada antes de salir." });
      sent += 1;
    } catch { /* La notificación interna ya quedó registrada. */ }
  }
  return { ok: true, sent };
}

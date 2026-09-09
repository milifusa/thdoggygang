import { createSupabaseServiceClient } from "../../../lib/supabase/service";
import { sendBookingReminder, sendUpcomingHikeReminder, sendWaitlistOfferForHike } from "../../../lib/server/booking-reminder";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "No autorizado." }, { status: 401 });
  const service = createSupabaseServiceClient();
  const { data: admin } = await service
    .from("profiles")
    .select("id")
    .eq("role", "ADMIN")
    .eq("active", true)
    .is("deleted_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!admin)
    return Response.json(
      { error: "No existe un administrador activo." },
      { status: 503 },
    );
  const stale = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const reminderLimit = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: bookings, error } = await service
    .from("bookings")
    .select("id")
    .in("status", ["DRAFT", "PENDING_PAYMENT"])
    .lt("last_activity_at", stale)
    .or(`last_reminder_at.is.null,last_reminder_at.lt.${reminderLimit}`)
    .order("last_activity_at")
    .limit(50);
  if (error)
    return Response.json(
      { error: "No pudimos consultar los borradores." },
      { status: 500 },
    );
  const results = [];
  for (const booking of bookings ?? []) {
    try {
      await sendBookingReminder(booking.id, admin.id);
      results.push({ bookingId: booking.id, ok: true });
    } catch (error) {
      results.push({
        bookingId: booking.id,
        ok: false,
        error: error instanceof Error ? error.message : "No enviado",
      });
    }
  }
  const now = new Date();
  const upper = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString();
  const { data: upcoming } = await service.from("bookings").select("id,hike:hikes!inner(starts_at)").eq("status", "CONFIRMED").gt("hike.starts_at", now.toISOString()).lte("hike.starts_at", upper).limit(200);
  const upcomingResults = [];
  for (const booking of upcoming ?? []) {
    const hike = Array.isArray(booking.hike) ? booking.hike[0] : booking.hike;
    if (!hike) continue;
    const hours = (new Date(hike.starts_at).getTime() - now.getTime()) / 3_600_000;
    const kind = hours >= 144 && hours <= 192 ? "HIKE_REMINDER_7D" : hours >= 18 && hours <= 42 ? "HIKE_REMINDER_1D" : null;
    if (!kind) continue;
    try { const sent = await sendUpcomingHikeReminder(booking.id, kind, admin.id); upcomingResults.push({ bookingId: booking.id, kind, ...sent }); }
    catch (error) { upcomingResults.push({ bookingId: booking.id, kind, ok: false, error: error instanceof Error ? error.message : "No enviado" }); }
  }
  const { data: waitlistOffers } = await service.from("waitlist_entries").select("hike_id").eq("status", "OFFERED").is("notified_at", null).gt("offer_expires_at", now.toISOString()).limit(50);
  const waitlistResults = [];
  for (const offer of waitlistOffers ?? []) {
    try { waitlistResults.push({ hikeId: offer.hike_id, ...(await sendWaitlistOfferForHike(offer.hike_id)) }); }
    catch (error) { waitlistResults.push({ hikeId: offer.hike_id, ok: false, error: error instanceof Error ? error.message : "No enviado" }); }
  }
  return Response.json({
    ok: true,
    processed: results.length,
    sent: results.filter((item) => item.ok).length,
    results,
    upcoming: upcomingResults,
    waitlist: waitlistResults,
  });
}

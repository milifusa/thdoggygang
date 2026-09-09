import { createSupabaseServiceClient } from "../../../lib/supabase/service";
import { sendBookingReminder } from "../../../lib/server/booking-reminder";

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
  return Response.json({
    ok: true,
    processed: results.length,
    sent: results.filter((item) => item.ok).length,
    results,
  });
}

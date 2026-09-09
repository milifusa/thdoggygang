import { z } from "zod";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

const icsEscape = (value: string) => value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\n", "\\n");
const icsDate = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new Response("Reservación inválida", { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();
  const { data: booking } = profile ? await supabase.from("bookings").select("booking_number,duration:hikes(name,starts_at,duration_minutes,location_name,meeting_point)").eq("id", id).eq("profile_id", profile.id).single() : { data: null };
  const hike = Array.isArray(booking?.duration) ? booking.duration[0] : booking?.duration;
  if (!booking || !hike) return new Response("No encontrado", { status: 404 });
  const start = new Date(hike.starts_at);
  const end = new Date(start.getTime() + Number(hike.duration_minutes || 180) * 60_000);
  const location = hike.meeting_point || hike.location_name;
  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Doggy Gang//Aventuras//ES", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${booking.booking_number}@thedoggygang.com`, `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${icsEscape(`The Doggy Gang · ${hike.name}`)}`,
    `LOCATION:${icsEscape(location)}`, `DESCRIPTION:${icsEscape(`Reservación ${booking.booking_number}. Revisa tu Centro de aventura antes de salir.`)}`,
    "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Prepara tu aventura con The Doggy Gang", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${booking.booking_number}.ics"`, "cache-control": "private, no-store" } });
}

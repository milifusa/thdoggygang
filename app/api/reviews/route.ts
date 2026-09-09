import { z } from "zod";
import { createSupabaseServerClient } from "../../lib/supabase/server";

const schema = z.object({
  bookingId: z.string().uuid(),
  routeRating: z.number().int().min(1).max(5),
  guideRating: z.number().int().min(1).max(5),
  transportRating: z.number().int().min(1).max(5).nullable(),
  body: z.string().trim().max(1200),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Revisa las calificaciones." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Inicia sesión." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();
  const { data: booking } = profile ? await supabase.from("bookings").select("id,hike_id,status,hikes(starts_at)").eq("id", parsed.data.bookingId).eq("profile_id", profile.id).single() : { data: null };
  const hike = Array.isArray(booking?.hikes) ? booking.hikes[0] : booking?.hikes;
  if (!booking || !hike || !["CONFIRMED","COMPLETED"].includes(booking.status) || new Date(hike.starts_at) >= new Date()) return Response.json({ error: "La reseña se habilita después de asistir al hike." }, { status: 403 });
  const { error } = await supabase.from("hike_reviews").upsert({ booking_id: booking.id, hike_id: booking.hike_id, profile_id: profile!.id, route_rating: parsed.data.routeRating, guide_rating: parsed.data.guideRating, transport_rating: parsed.data.transportRating, body: parsed.data.body, published: true }, { onConflict: "booking_id" });
  if (error) return Response.json({ error: "No pudimos guardar tu reseña." }, { status: 400 });
  return Response.json({ ok: true });
}

import { z } from "zod";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../lib/supabase/service";

const schema = z.object({
  hikeId: z.string().uuid(),
  peopleCount: z.number().int().min(1).max(12).default(1),
  dogCount: z.number().int().min(0).max(12).default(1),
});

async function currentProfile() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();
  return data;
}

export async function POST(request: Request) {
  const profile = await currentProfile();
  if (!profile) return Response.json({ error: "Inicia sesión para unirte a la lista." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Revisa cuántas personas y perritos asistirán." }, { status: 400 });
  const service = createSupabaseServiceClient();
  const { data: hike } = await service.from("hikes").select("id,slug,capacity,published,starts_at").eq("id", parsed.data.hikeId).is("deleted_at", null).single();
  if (!hike?.published || new Date(hike.starts_at) <= new Date()) return Response.json({ error: "Este hike ya no admite lista de espera." }, { status: 409 });
  const { data: activeBooking } = await service.from("bookings").select("id").eq("hike_id", hike.id).eq("profile_id", profile.id).in("status", ["DRAFT","PENDING_PAYMENT","CONFIRMED"]).maybeSingle();
  if (activeBooking) return Response.json({ error: "Ya tienes una reservación activa para este hike." }, { status: 409 });
  const { data: availability } = await service.rpc("public_hike_availability", { p_hike_ids: [hike.id] });
  const spots = Number(availability?.[0]?.spots_left ?? hike.capacity);
  if (spots >= parsed.data.peopleCount) return Response.json({ error: "Todavía hay lugares disponibles. Puedes reservar ahora.", reserveUrl: `/reservar/${hike.slug}` }, { status: 409 });
  const { data, error } = await service.from("waitlist_entries").insert({ hike_id: hike.id, profile_id: profile.id, people_count: parsed.data.peopleCount, dog_count: parsed.data.dogCount, status: "WAITING", offer_expires_at: null }).select("id,created_at").single();
  if (error) {
    const { data: existing } = await service.from("waitlist_entries").select("id,created_at").eq("hike_id", hike.id).eq("profile_id", profile.id).in("status", ["WAITING","OFFERED"]).maybeSingle();
    if (!existing) return Response.json({ error: "No pudimos guardar tu lugar en la lista." }, { status: 400 });
    return Response.json({ ok: true, entry: existing, alreadyJoined: true });
  }
  const { count: ahead } = await service.from("waitlist_entries").select("id", { count: "exact", head: true }).eq("hike_id", hike.id).eq("status", "WAITING").lt("created_at", data.created_at);
  return Response.json({ ok: true, entry: data, position: (ahead ?? 0) + 1 });
}

export async function DELETE(request: Request) {
  const profile = await currentProfile();
  if (!profile) return Response.json({ error: "Inicia sesión." }, { status: 401 });
  const hikeId = new URL(request.url).searchParams.get("hikeId");
  if (!z.string().uuid().safeParse(hikeId).success) return Response.json({ error: "Hike inválido." }, { status: 400 });
  const service = createSupabaseServiceClient();
  await service.from("waitlist_entries").update({ status: "CANCELLED" }).eq("hike_id", hikeId!).eq("profile_id", profile.id).in("status", ["WAITING","OFFERED"]);
  return Response.json({ ok: true });
}

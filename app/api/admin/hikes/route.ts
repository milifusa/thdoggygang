import { z } from "zod";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

const hikeSchema = z.object({
  name: z.string().min(3).max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().min(20),
  storyTitle: z.string().min(5).max(240),
  startsAt: z.string().datetime({ offset: true }),
  locationName: z.string().min(3),
  priceCents: z.number().int().min(0),
  capacity: z.number().int().positive(),
  maxDogs: z.number().int().positive().nullable(),
  distanceKm: z.number().positive().nullable(),
  elevationM: z.number().int().min(0).nullable(),
  durationMinutes: z.number().int().positive().nullable(),
  difficulty: z.string().max(40),
  terrain: z.string().max(80),
  published: z.boolean(),
  pricingMode: z.enum(["PER_PERSON", "PERSON_DOG_BUNDLE"]),
  dogPriceCents: z.number().int().min(0),
  includes: z.array(z.string().min(2).max(160)).max(20),
  excludes: z.array(z.string().min(2).max(160)).max(20),
  packingList: z.array(z.string().min(2).max(160)).max(20),
  dogSuitability: z.string().min(20).max(1200),
  rules: z.string().min(10).max(2000),
  cancellationPolicy: z.string().min(10).max(2000),
  transportMode: z.enum(["NONE", "OPTIONAL", "INCLUDED"]),
  transportCapacity: z.number().int().min(0).nullable(),
  transportPriceCents: z.number().int().min(0),
  transportDeparturePlace: z.string().max(200).nullable(),
  transportDepartureAt: z.string().datetime({ offset: true }).nullable(),
  transportReturnDetails: z.string().max(1000).nullable(),
  transportRules: z.string().max(1500).nullable(),
});

async function adminClient() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("auth_user_id", user.id)
    .single();
  return profile?.role === "ADMIN" && profile.active ? supabase : null;
}

export async function POST(request: Request) {
  const parsed = hikeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      {
        error: "Revisa los datos del hike.",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const value = parsed.data;
  const { data, error } = await supabase
    .from("hikes")
    .insert({
      name: value.name,
      slug: value.slug,
      description: value.description,
      story_title: value.storyTitle,
      starts_at: value.startsAt,
      location_name: value.locationName,
      price_cents: value.priceCents,
      dog_price_cents: value.dogPriceCents,
      pricing_mode: value.pricingMode,
      capacity: value.capacity,
      max_dogs: value.maxDogs,
      distance_km: value.distanceKm,
      elevation_m: value.elevationM,
      duration_minutes: value.durationMinutes,
      difficulty: value.difficulty,
      terrain: value.terrain,
      includes: value.includes,
      excludes: value.excludes,
      packing_list: value.packingList,
      dog_suitability: value.dogSuitability,
      rules: value.rules,
      cancellation_policy: value.cancellationPolicy,
      published: value.published,
    })
    .select("id, slug")
    .single();
  if (error)
    return Response.json(
      { error: error.code === "23505" ? "Ese slug ya existe." : error.message },
      { status: 400 },
    );
  const { error: transportError } = await supabase
    .from("transport_configurations")
    .insert({
      hike_id: data.id,
      mode: value.transportMode,
      capacity: value.transportCapacity,
      price_cents:
        value.transportMode === "INCLUDED" ? 0 : value.transportPriceCents,
      departure_place: value.transportDeparturePlace,
      departure_at: value.transportDepartureAt,
      return_details: value.transportReturnDetails,
      rules: value.transportRules,
    });
  if (transportError)
    return Response.json(
      {
        error: `El hike se creó, pero el transporte no pudo guardarse: ${transportError.message}`,
      },
      { status: 400 },
    );
  return Response.json({ hike: data }, { status: 201 });
}

export { hikeSchema, adminClient };

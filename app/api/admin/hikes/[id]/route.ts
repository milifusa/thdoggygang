import { z } from 'zod';
import { adminClient, hikeSchema } from '../route';
const idSchema = z.string().uuid();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!idSchema.safeParse(id).success) return Response.json({ error: 'ID inválido.' }, { status: 400 });
  const parsed = hikeSchema.partial().safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: 'Datos inválidos.' }, { status: 400 });
  const supabase = await adminClient(); if (!supabase) return Response.json({ error: 'No autorizado.' }, { status: 403 });
  const map: Record<string, unknown> = {}; const value = parsed.data;
  if (value.name !== undefined) map.name = value.name; if (value.slug !== undefined) map.slug = value.slug; if (value.description !== undefined) map.description = value.description;
  if (value.storyTitle !== undefined) map.story_title = value.storyTitle;
  if (value.startsAt !== undefined) map.starts_at = value.startsAt; if (value.locationName !== undefined) map.location_name = value.locationName; if (value.priceCents !== undefined) map.price_cents = value.priceCents;
  if (value.capacity !== undefined) map.capacity = value.capacity; if (value.maxDogs !== undefined) map.max_dogs = value.maxDogs; if (value.distanceKm !== undefined) map.distance_km = value.distanceKm;
  if (value.elevationM !== undefined) map.elevation_m = value.elevationM; if (value.durationMinutes !== undefined) map.duration_minutes = value.durationMinutes; if (value.difficulty !== undefined) map.difficulty = value.difficulty;
  if (value.terrain !== undefined) map.terrain = value.terrain; if (value.published !== undefined) map.published = value.published;
  if (value.pricingMode !== undefined) map.pricing_mode = value.pricingMode; if (value.dogPriceCents !== undefined) map.dog_price_cents = value.dogPriceCents;
  if (value.includes !== undefined) map.includes = value.includes; if (value.excludes !== undefined) map.excludes = value.excludes; if (value.packingList !== undefined) map.packing_list = value.packingList;
  if (value.dogSuitability !== undefined) map.dog_suitability = value.dogSuitability; if (value.rules !== undefined) map.rules = value.rules; if (value.cancellationPolicy !== undefined) map.cancellation_policy = value.cancellationPolicy;
  const { data, error } = await supabase.from('hikes').update(map).eq('id', id).select('id, slug').single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  if (value.transportMode !== undefined) {
    const { error: transportError } = await supabase.from('transport_configurations').upsert({ hike_id: id, mode: value.transportMode, capacity: value.transportCapacity ?? null, price_cents: value.transportMode === 'INCLUDED' ? 0 : value.transportPriceCents ?? 0, departure_place: value.transportDeparturePlace ?? null, departure_at: value.transportDepartureAt ?? null, return_details: value.transportReturnDetails ?? null, rules: value.transportRules ?? null }, { onConflict: 'hike_id' });
    if (transportError) return Response.json({ error: transportError.message }, { status: 400 });
  }
  return Response.json({ hike: data });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!idSchema.safeParse(id).success) return Response.json({ error: 'ID inválido.' }, { status: 400 });
  const supabase = await adminClient(); if (!supabase) return Response.json({ error: 'No autorizado.' }, { status: 403 });
  const { error } = await supabase.from('hikes').update({ published: false, deleted_at: new Date().toISOString() }).eq('id', id);
  return error ? Response.json({ error: error.message }, { status: 400 }) : Response.json({ ok: true });
}

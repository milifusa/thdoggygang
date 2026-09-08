import { z } from 'zod';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

const hikeSchema = z.object({
  name: z.string().min(3).max(120), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), description: z.string().min(20), startsAt: z.string().datetime({ offset: true }),
  locationName: z.string().min(3), priceCents: z.number().int().min(0), capacity: z.number().int().positive(), maxDogs: z.number().int().positive().nullable(),
  distanceKm: z.number().positive().nullable(), elevationM: z.number().int().min(0).nullable(), durationMinutes: z.number().int().positive().nullable(), difficulty: z.string().max(40), terrain: z.string().max(80), published: z.boolean(),
});

async function adminClient() {
  const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('auth_user_id', user.id).single();
  return profile?.role === 'ADMIN' ? supabase : null;
}

export async function POST(request: Request) {
  const parsed = hikeSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: 'Revisa los datos del hike.', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const supabase = await adminClient(); if (!supabase) return Response.json({ error: 'No autorizado.' }, { status: 403 });
  const value = parsed.data;
  const { data, error } = await supabase.from('hikes').insert({ name: value.name, slug: value.slug, description: value.description, starts_at: value.startsAt, location_name: value.locationName, price_cents: value.priceCents, capacity: value.capacity, max_dogs: value.maxDogs, distance_km: value.distanceKm, elevation_m: value.elevationM, duration_minutes: value.durationMinutes, difficulty: value.difficulty, terrain: value.terrain, published: value.published }).select('id, slug').single();
  if (error) return Response.json({ error: error.code === '23505' ? 'Ese slug ya existe.' : error.message }, { status: 400 });
  return Response.json({ hike: data }, { status: 201 });
}

export { hikeSchema, adminClient };

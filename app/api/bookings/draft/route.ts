import { z } from 'zod';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

const schema = z.object({
  bookingId: z.string().uuid().nullable(),
  hikeSlug: z.string().regex(/^[a-z0-9-]+$/),
  personIds: z.array(z.string().uuid()).min(1),
  dogIds: z.array(z.string().uuid()),
  transportPersonIds: z.array(z.string().uuid()),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Revisa la selección de tu manada.' }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Tu sesión expiró. Vuelve a entrar.' }, { status: 401 });
  const { data, error } = await supabase.rpc('save_booking_draft', {
    p_hike_slug: parsed.data.hikeSlug,
    p_booking_id: parsed.data.bookingId,
    p_person_ids: parsed.data.personIds,
    p_dog_ids: parsed.data.dogIds,
    p_transport_person_ids: parsed.data.transportPersonIds,
  });
  if (error || !data) return Response.json({ error: error?.message ?? 'No pudimos guardar tu reservación.' }, { status: 400 });
  return Response.json({ bookingId: data });
}

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
const schema = z.object({ hikeId: z.string().uuid(), bookingId: z.string().uuid(), participantIds: z.array(z.string().uuid()).min(1), method: z.enum(['QR','MANUAL']), clientOperationId: z.string().uuid() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos de check-in inválidos' }, { status: 400 });
  const authorization = request.headers.get('authorization'); const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!authorization || !url || !anon) return Response.json({ error: 'No autorizado' }, { status: 401 });
  const supabase = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: userData } = await supabase.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
  const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', userData.user?.id ?? '').single();
  if (!profile) return Response.json({ error: 'Perfil no autorizado' }, { status: 403 });
  const rows = parsed.data.participantIds.map((participantId, index) => ({ hike_id: parsed.data.hikeId, booking_id: parsed.data.bookingId, booking_participant_id: participantId, checked_in_by: profile.id, method: parsed.data.method, client_operation_id: index === 0 ? parsed.data.clientOperationId : crypto.randomUUID() }));
  const { error } = await supabase.from('check_ins').upsert(rows, { onConflict: 'hike_id,booking_participant_id' });
  if (error) return Response.json({ error: 'No pudimos registrar el check-in' }, { status: 403 });
  return Response.json({ ok: true, count: rows.length });
}

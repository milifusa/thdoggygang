import { z } from 'zod';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { createSupabaseServiceClient } from '../../../lib/supabase/service';
const schema = z.object({ hikeId: z.string().uuid(), bookingId: z.string().uuid(), participantIds: z.array(z.string().uuid()).min(1), method: z.enum(['QR','MANUAL']), clientOperationId: z.string().uuid() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos de check-in inválidos' }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('id, role').eq('auth_user_id', user.id).single();
  if (!profile || !['GUIDE', 'ADMIN'].includes(profile.role)) return Response.json({ error: 'Perfil no autorizado' }, { status: 403 });
  const { data: booking } = await supabase.from('bookings').select('id, hike_id, booking_participants(id)').eq('id', parsed.data.bookingId).eq('hike_id', parsed.data.hikeId).single();
  const allowedParticipantIds = new Set(booking?.booking_participants.map((participant) => participant.id) ?? []);
  if (!booking || parsed.data.participantIds.some((id) => !allowedParticipantIds.has(id))) return Response.json({ error: 'Los asistentes no pertenecen a esta reservación.' }, { status: 403 });
  const rows = parsed.data.participantIds.map((participantId, index) => ({ hike_id: parsed.data.hikeId, booking_id: parsed.data.bookingId, booking_participant_id: participantId, checked_in_by: profile.id, method: parsed.data.method, client_operation_id: index === 0 ? parsed.data.clientOperationId : crypto.randomUUID() }));
  const { error } = await supabase.from('check_ins').upsert(rows, { onConflict: 'hike_id,booking_participant_id', ignoreDuplicates: true });
  if (error) return Response.json({ error: 'No pudimos registrar el check-in' }, { status: 403 });
  const service = createSupabaseServiceClient();
  await service.from('booking_checkin_tokens').update({ used_at: new Date().toISOString() }).eq('booking_id', parsed.data.bookingId).is('revoked_at', null);
  return Response.json({ ok: true, count: rows.length });
}

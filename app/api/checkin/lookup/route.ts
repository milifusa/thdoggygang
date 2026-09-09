import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { verifySignedPayload } from '../../../lib/security/signed-token';

const payloadSchema = z.object({ token: z.string().min(24).max(256) });
async function hashToken(token: string) { const bytes = new TextEncoder().encode(token); const digest = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join(''); }

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'QR inválido' }, { status: 400 });
  const userClient = await createSupabaseServerClient(); const { data: { user } } = await userClient.auth.getUser();
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });
  const { data: staff } = await userClient.from('profiles').select('role').eq('auth_user_id', user.id).single();
  if (!staff || !['GUIDE', 'ADMIN'].includes(staff.role)) return Response.json({ error: 'No autorizado' }, { status: 403 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return Response.json({ error: 'Servicio no configurado' }, { status: 503 });
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const signedPayload = await verifySignedPayload(parsed.data.token);
  if (signedPayload && signedPayload.purpose !== 'checkin') return Response.json({ error: 'QR inválido' }, { status: 400 });
  const tokenHash = await hashToken(parsed.data.token);
  let query = supabase.from('booking_checkin_tokens').select('id, revoked_at, used_at, expires_at, booking:bookings(id, booking_number, status, hike_id,total_cents,profile:profiles(first_name,last_name,email,phone), booking_participants(id, snapshot), booking_dogs(id, snapshot), transport_reservations(id, booking_participant_id),signed_waivers(id,booking_participant_id,signed_at), check_ins(id, booking_participant_id,checked_in_at))').eq('token_hash', tokenHash);
  if (signedPayload?.purpose === 'checkin') query = query.eq('token_id', signedPayload.tokenId).eq('booking_id', signedPayload.bookingId);
  const { data, error } = await query.single();
  if (error || !data || data.revoked_at || (data.expires_at && new Date(data.expires_at).getTime() < Date.now())) return Response.json({ error: 'No encontramos esta reservación' }, { status: 404 });
  const booking = Array.isArray(data.booking) ? data.booking[0] : data.booking;
  if (!booking || booking.status !== 'CONFIRMED' || booking.booking_participants.length === 0 || booking.signed_waivers.length < booking.booking_participants.length) return Response.json({ error: 'La reservación no está habilitada para check-in.' }, { status: 409 });
  if (signedPayload?.purpose === 'checkin' && booking?.hike_id !== signedPayload.hikeId) return Response.json({ error: 'Este QR pertenece a otro hike.' }, { status: 403 });
  if (staff.role === 'GUIDE' && booking?.hike_id) {
    const { data: assignment } = await userClient.from('guide_hikes').select('hike_id').eq('hike_id', booking.hike_id).maybeSingle();
    if (!assignment) return Response.json({ error: 'No estás asignado a este hike' }, { status: 403 });
  }
  return Response.json({ booking: data.booking, alreadyUsedAt: data.used_at });
}

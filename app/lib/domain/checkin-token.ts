import { createSupabaseServiceClient } from '../supabase/service';
import { decryptQrToken, encryptQrToken, hashQrToken } from '../security/qr-token';
import { parseSignedPayload, signPayload, type SignedCheckinPayload } from '../security/signed-token';

export async function ensureBookingQrToken(bookingId: string) {
  const service = createSupabaseServiceClient();
  const { data: booking } = await service.from('bookings').select('id,hike_id,status,hike:hikes(starts_at),booking_participants(id),signed_waivers(id,booking_participant_id),check_ins(id,booking_participant_id)').eq('id', bookingId).single();
  if (!booking) throw new Error('Booking not found.');
  if (booking.status !== 'CONFIRMED') throw new Error('Only confirmed bookings can have a QR.');
  if (!booking.booking_participants.length || booking.signed_waivers.length < booking.booking_participants.length) throw new Error('All waivers must be signed before creating the QR.');
  if (booking.check_ins.length >= booking.booking_participants.length) throw new Error('Check-in is already complete.');
  const { data: existing } = await service.from('booking_checkin_tokens').select('id,token_ciphertext,expires_at').eq('booking_id', bookingId).is('revoked_at', null).is('used_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (existing?.token_ciphertext) {
    const decrypted = await decryptQrToken(existing.token_ciphertext).catch(() => null);
    const payload = decrypted ? parseSignedPayload(decrypted) : null;
    if (decrypted && payload?.purpose === 'checkin' && payload.expiresAt > Date.now()) return decrypted;
  }
  const hike = Array.isArray(booking.hike) ? booking.hike[0] : booking.hike;
  const tokenId = crypto.randomUUID();
  const payload: SignedCheckinPayload = {
    purpose: 'checkin',
    version: 2,
    tokenId,
    bookingId,
    hikeId: booking.hike_id,
    issuedAt: Date.now(),
    expiresAt: Math.max(Date.now() + 24 * 60 * 60 * 1000, new Date(hike?.starts_at ?? Date.now()).getTime() + 72 * 60 * 60 * 1000),
  };
  const token = await signPayload(payload);
  if (existing?.id) await service.from('booking_checkin_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', existing.id);
  await service.from('booking_checkin_tokens').insert({ booking_id: bookingId, token_hash: await hashQrToken(token), token_ciphertext: await encryptQrToken(token), token_id: tokenId, token_version: 2, signed_payload: payload, expires_at: new Date(payload.expiresAt).toISOString() });
  return token;
}

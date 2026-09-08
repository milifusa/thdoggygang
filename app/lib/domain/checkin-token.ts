import { createSupabaseServiceClient } from '../supabase/service';
import { decryptQrToken, encryptQrToken, hashQrToken } from '../security/qr-token';
import { parseSignedPayload, signPayload, type SignedCheckinPayload } from '../security/signed-token';

export async function ensureBookingQrToken(bookingId: string) {
  const service = createSupabaseServiceClient();
  const { data: existing } = await service.from('booking_checkin_tokens').select('id,token_ciphertext,expires_at').eq('booking_id', bookingId).is('revoked_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (existing?.token_ciphertext) {
    const decrypted = await decryptQrToken(existing.token_ciphertext).catch(() => null);
    const payload = decrypted ? parseSignedPayload(decrypted) : null;
    if (decrypted && payload?.purpose === 'checkin' && payload.expiresAt > Date.now()) return decrypted;
  }
  const { data: booking } = await service.from('bookings').select('id,hike_id,hike:hikes(starts_at)').eq('id', bookingId).single();
  if (!booking) throw new Error('Booking not found.');
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

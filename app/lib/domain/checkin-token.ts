import { createSupabaseServiceClient } from '../supabase/service';
import { decryptQrToken, encryptQrToken, hashQrToken } from '../security/qr-token';

export async function ensureBookingQrToken(bookingId: string) {
  const service = createSupabaseServiceClient();
  const { data: existing } = await service.from('booking_checkin_tokens').select('token_ciphertext').eq('booking_id', bookingId).is('revoked_at', null).maybeSingle();
  if (existing?.token_ciphertext) return decryptQrToken(existing.token_ciphertext);
  const token = `tdg:checkin:${crypto.randomUUID()}`;
  await service.from('booking_checkin_tokens').insert({ booking_id: bookingId, token_hash: await hashQrToken(token), token_ciphertext: await encryptQrToken(token) });
  return token;
}

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const payloadSchema = z.object({ token: z.string().min(24).max(256) });
async function hashToken(token: string) { const bytes = new TextEncoder().encode(token); const digest = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join(''); }

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'QR inválido' }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return Response.json({ error: 'Servicio no configurado' }, { status: 503 });
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const tokenHash = await hashToken(parsed.data.token);
  const { data, error } = await supabase.from('booking_checkin_tokens').select('id, revoked_at, used_at, booking:bookings(id, booking_number, status, hike_id, booking_participants(id, snapshot), booking_dogs(id, snapshot))').eq('token_hash', tokenHash).single();
  if (error || !data || data.revoked_at) return Response.json({ error: 'No encontramos esta reservación' }, { status: 404 });
  return Response.json({ booking: data.booking, alreadyUsedAt: data.used_at });
}

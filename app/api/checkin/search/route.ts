import { createSupabaseServerClient } from '../../../lib/supabase/server';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim().replace(/[%_,()]/g, '') ?? '';
  if (query.length < 2) return Response.json({ bookings: [] });
  const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const { data: staff } = await supabase.from('profiles').select('role').eq('auth_user_id', user.id).single();
  if (!staff || !['GUIDE','ADMIN'].includes(staff.role)) return Response.json({ error: 'No autorizado.' }, { status: 403 });
  const [participantMatches, dogMatches, bookingMatches] = await Promise.all([
    supabase.from('booking_participants').select('booking_id').or(`snapshot->>first_name.ilike.%${query}%,snapshot->>last_name.ilike.%${query}%`).limit(12),
    supabase.from('booking_dogs').select('booking_id').or(`snapshot->>name.ilike.%${query}%,snapshot->>breed.ilike.%${query}%`).limit(12),
    supabase.from('bookings').select('id').ilike('booking_number', `%${query}%`).limit(12),
  ]);
  const ids = [...new Set([...(participantMatches.data ?? []).map((item) => item.booking_id), ...(dogMatches.data ?? []).map((item) => item.booking_id), ...(bookingMatches.data ?? []).map((item) => item.id)])];
  if (!ids.length) return Response.json({ bookings: [] });
  const { data, error } = await supabase.from('bookings').select('id, booking_number, status, hike_id, booking_participants(id, snapshot), booking_dogs(id, snapshot)').in('id', ids).in('status', ['CONFIRMED','PENDING_PAYMENT']).limit(12);
  if (error) return Response.json({ error: 'No pudimos buscar reservaciones.' }, { status: 400 });
  return Response.json({ bookings: data ?? [] });
}

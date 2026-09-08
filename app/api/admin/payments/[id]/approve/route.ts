import { z } from 'zod';
import { createSupabaseServerClient } from '../../../../../lib/supabase/server';
import { createSupabaseServiceClient } from '../../../../../lib/supabase/service';
import { ensureBookingQrToken } from '../../../../../lib/domain/checkin-token';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!z.string().uuid().safeParse(id).success) return Response.json({ error: 'Pago inválido.' }, { status: 400 });
  const userClient = await createSupabaseServerClient(); const { data: { user } } = await userClient.auth.getUser();
  if (!user) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const { data: admin } = await userClient.from('profiles').select('id, role').eq('auth_user_id', user.id).single();
  if (admin?.role !== 'ADMIN') return Response.json({ error: 'No autorizado.' }, { status: 403 });
  const service = createSupabaseServiceClient(); const { data: payment } = await service.from('payments').select('id, order_id, status, order:orders(booking_id)').eq('id', id).single();
  if (!payment || payment.status !== 'UNDER_REVIEW') return Response.json({ error: 'Este pago ya fue revisado o no existe.' }, { status: 409 });
  const order = Array.isArray(payment.order) ? payment.order[0] : payment.order; const bookingId = order?.booking_id;
  await service.from('payments').update({ status: 'PAID', paid_at: new Date().toISOString() }).eq('id', payment.id);
  await service.from('payment_receipts').update({ reviewed_by: admin.id, reviewed_at: new Date().toISOString() }).eq('payment_id', payment.id);
  await service.from('orders').update({ status: 'PAID' }).eq('id', payment.order_id);
  await service.rpc('commit_product_inventory', { p_order_id: payment.order_id });
  if (bookingId) { await service.from('bookings').update({ status: 'CONFIRMED', confirmed_at: new Date().toISOString() }).eq('id', bookingId); await ensureBookingQrToken(bookingId); }
  await service.from('audit_logs').insert({ actor_profile_id: admin.id, action: 'TRANSFER_PAYMENT_APPROVED', entity_type: 'payment', entity_id: payment.id, metadata: { booking_id: bookingId } });
  return Response.json({ ok: true });
}

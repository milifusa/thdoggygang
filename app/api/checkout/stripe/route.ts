import { z } from 'zod';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { createSupabaseServiceClient } from '../../../lib/supabase/service';

const schema = z.object({ bookingId: z.string().uuid() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Reservación inválida.' }, { status: 400 });
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return Response.json({ error: 'El pago con tarjeta aún no está configurado.' }, { status: 503 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Tu sesión expiró.' }, { status: 401 });
  const { data: booking } = await supabase.from('bookings').select('id, booking_number, total_cents, currency, status, hike:hikes(name, slug), booking_participants(id)').eq('id', parsed.data.bookingId).single();
  if (!booking || booking.status === 'CANCELLED' || booking.total_cents <= 0) return Response.json({ error: 'No encontramos una reservación pagable.' }, { status: 404 });
  const { count: signedCount } = await supabase.from('signed_waivers').select('id', { count: 'exact', head: true }).eq('booking_id', booking.id);
  if ((signedCount ?? 0) < booking.booking_participants.length) return Response.json({ error: 'Falta firmar la responsiva de la reservación.' }, { status: 409 });
  const service = createSupabaseServiceClient();
  const hike = Array.isArray(booking.hike) ? booking.hike[0] : booking.hike;
  const { data: existingOrder } = await service.from('orders').select('id, order_number').eq('booking_id', booking.id).maybeSingle();
  let order = existingOrder;
  if (!order) {
    const { data, error } = await service.from('orders').insert({ order_number: `ORD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, profile_id: (await service.from('profiles').select('id').eq('auth_user_id', user.id).single()).data?.id, booking_id: booking.id, status: 'PENDING', total_cents: booking.total_cents, currency: booking.currency }).select('id, order_number').single();
    if (error || !data) return Response.json({ error: 'No pudimos crear la orden.' }, { status: 500 });
    order = data;
    await service.from('order_items').insert({ order_id: order.id, item_type: 'HIKE', reference_id: booking.id, description: hike?.name ?? 'Aventura The Doggy Gang', quantity: 1, unit_price_cents: booking.total_cents });
  }
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  const form = new URLSearchParams({
    mode: 'payment', success_url: `${origin}/reservar/confirmacion?booking=${booking.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/reservar/${hike?.slug ?? 'sendero-del-duende'}?pago=cancelado`, client_reference_id: booking.id,
    'line_items[0][price_data][currency]': booking.currency.toLowerCase(), 'line_items[0][price_data][unit_amount]': String(booking.total_cents),
    'line_items[0][price_data][product_data][name]': hike?.name ?? 'Aventura The Doggy Gang', 'line_items[0][quantity]': '1',
    'metadata[booking_id]': booking.id, 'metadata[order_id]': order.id,
  });
  const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  const checkout = await stripeResponse.json() as { id?: string; url?: string; error?: { message?: string } };
  if (!stripeResponse.ok || !checkout.id || !checkout.url) return Response.json({ error: checkout.error?.message ?? 'Stripe no pudo iniciar el pago.' }, { status: 502 });
  await service.from('payments').upsert({ order_id: order.id, provider: 'stripe', provider_payment_id: checkout.id, method: 'CARD', status: 'PENDING', amount_cents: booking.total_cents }, { onConflict: 'provider,provider_payment_id' });
  await service.from('bookings').update({ status: 'PENDING_PAYMENT' }).eq('id', booking.id);
  return Response.json({ url: checkout.url });
}

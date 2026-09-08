import Link from 'next/link';
import { requireStaffSession } from '../lib/auth/guards';
import { createSupabaseServerClient } from '../lib/supabase/server';
import { ApprovePaymentButton } from './approve-payment-button';

export const dynamic = 'force-dynamic';

async function liveDashboard() {
  const supabase = await createSupabaseServerClient();
  const { data: hike } = await supabase.from('hikes').select('id, name, slug, starts_at, location_name, capacity, max_dogs').gte('starts_at', new Date().toISOString()).is('deleted_at', null).order('starts_at').limit(1).maybeSingle();
  const { data: bookings } = hike ? await supabase.from('bookings').select('id, booking_number, status, total_cents, profile:profiles(first_name, last_name), booking_participants(id), booking_dogs(id), transport_reservations(id)').eq('hike_id', hike.id).order('created_at', { ascending: false }) : { data: [] };
  const { data: payments } = await supabase.from('payments').select('id, amount_cents, created_at, order:orders(order_number, booking:bookings(booking_number, profile:profiles(first_name, last_name)))').eq('status', 'UNDER_REVIEW').order('created_at', { ascending: false }).limit(5);
  return { hike, bookings: bookings ?? [], payments: payments ?? [] };
}

export default async function AdminDashboard() {
  const session = await requireStaffSession('/admin');
  const live = session.mode === 'live' ? await liveDashboard() : null;
  const expected = live?.bookings.reduce((sum, booking) => sum + booking.booking_participants.length, 0) ?? 38;
  const dogs = live?.bookings.reduce((sum, booking) => sum + booking.booking_dogs.length, 0) ?? 26;
  const transport = live?.bookings.reduce((sum, booking) => sum + booking.transport_reservations.length, 0) ?? 18;
  const recent = live?.bookings.slice(0, 3) ?? [];
  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <Link className="wordmark" href="/">THE DOGGY <span>GANG</span></Link><span className="admin-badge">ADMIN</span>
        <nav><Link className="active" href="/admin">⌂ Dashboard</Link><Link href="/admin/hikes/nuevo">↗ Hikes</Link><a href="#bookings">▤ Reservaciones</a><a href="#payments">$ Pagos</a><a href="#photos">▦ Fotografías</a><a href="#reports">↓ Reportes</a></nav>
        <Link className="mode-link" href="/admin/hike-mode">⚡ INICIAR MODO HIKE</Link>
      </aside>
      <section className="admin-content">
        <header><div><p>OPERACIÓN · 08 SEP 2026</p><h1>Buenos días, {session.mode === 'live' ? session.profile.first_name : 'Mishu'}.</h1></div><div className="admin-head-actions"><Link href="/admin/hikes/nuevo">＋ NUEVO HIKE</Link><div className="admin-avatar">ML</div></div></header>
        <section className="admin-next" id="hikes">
          <div className="admin-next-image"><img src="https://images.unsplash.com/photo-1558788353-f76d92427f16?auto=format&fit=crop&w=1100&q=88" alt={live?.hike?.name ?? 'Sendero del Duende'} /><span>PRÓXIMA AVENTURA</span></div>
          <div><p>PRÓXIMO HIKE</p><h2>{live?.hike?.name ?? 'Sendero del Duende'}</h2><span>{live?.hike ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(live.hike.starts_at)) : '20 SEP · 07:00 AM'} · {live?.hike?.location_name ?? 'Cholula, Puebla'}</span><div className="admin-stats"><div><strong>{expected}</strong><small>/ {live?.hike?.capacity ?? 40} LUGARES</small></div><div><strong>{dogs}</strong><small>PERRITOS</small></div><div><strong>{transport}</strong><small>TRANSPORTE</small></div><div><strong>{live?.payments.length ?? 4}</strong><small>ALERTAS</small></div></div><Link href="/admin/hike-mode" className="button button-primary">INICIAR MODO HIKE →</Link></div>
        </section>
        <section className="kpi-grid"><article><span>INGRESOS CONFIRMADOS</span><strong>${((live?.bookings.filter((booking) => booking.status === 'CONFIRMED').reduce((sum, booking) => sum + booking.total_cents, 0) ?? 8425000) / 100).toLocaleString('es-MX')}</strong><small>MXN</small></article><article><span>RESERVACIONES</span><strong>{live?.bookings.length ?? 64}</strong><small>{live?.bookings.filter((booking) => booking.status === 'PENDING_PAYMENT').length ?? 8} pendientes de pago</small></article><article><span>RESPONSIVAS</span><strong>92%</strong><small>5 pendientes de firma</small></article><article><span>CHECK-INS</span><strong>—</strong><small>Abren el día del hike</small></article></section>
        <section className="admin-lower">
          <div className="admin-table" id="bookings"><div className="admin-section-head"><h2>Reservaciones recientes</h2><button>VER TODAS →</button></div>{recent.length ? recent.map((booking) => { const profile = Array.isArray(booking.profile) ? booking.profile[0] : booking.profile; return <div className="admin-row" key={booking.id}><span>{booking.booking_number}</span><strong>{profile ? `${profile.first_name} ${profile.last_name}` : 'Cliente'}</strong><small>{booking.booking_participants.length} personas · {booking.booking_dogs.length} perritos</small><em className={booking.status === 'CONFIRMED' ? 'paid' : ''}>{booking.status}</em><button>→</button></div>; }) : <>{[['TDG-1048','Mishele Lojan','3 personas · 1 perrito','PAGADO'],['TDG-1047','Andrea Cruz','2 personas · 2 perritos','PENDIENTE'],['TDG-1046','Roberto Gil','1 persona · 1 perrito','PAGADO']].map((row) => <div className="admin-row" key={row[0]}><span>{row[0]}</span><strong>{row[1]}</strong><small>{row[2]}</small><em className={row[3] === 'PAGADO' ? 'paid' : ''}>{row[3]}</em><button>→</button></div>)}</>}</div>
          <div className="alerts-panel" id="payments"><div className="admin-section-head"><h2>Pagos por revisar</h2><span>{live?.payments.length ?? 1}</span></div>{live?.payments.length ? live.payments.map((payment) => { const order = Array.isArray(payment.order) ? payment.order[0] : payment.order; const booking = Array.isArray(order?.booking) ? order.booking[0] : order?.booking; const profile = Array.isArray(booking?.profile) ? booking.profile[0] : booking?.profile; return <article key={payment.id}><strong>⚠ {profile ? `${profile.first_name} ${profile.last_name}` : order?.order_number}</strong><p>Transferencia por ${(payment.amount_cents / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}.</p><ApprovePaymentButton paymentId={payment.id} /></article>; }) : <article><strong>⚠ Andrea Cruz</strong><p>Subió un comprobante para revisión.</p><small>Vista demostrativa</small></article>}</div>
        </section>
      </section>
    </main>
  );
}

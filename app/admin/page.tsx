import Link from "next/link";
import { AlertTriangle, Bolt, CircleCheck, Mountain, Plus } from "lucide-react";
import { requireStaffSession } from "../lib/auth/guards";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { hikeCoverUrl } from "../lib/data";
import { ApprovePaymentButton } from "./approve-payment-button";
import { AdminMobileNav, AdminNav } from "./admin-nav";
import { adminDate, money, profileName } from "./admin-utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const session = await requireStaffSession("/admin");
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const [{ data: hikes }, { data: pendingPayments }, { data: recentBookings }, { count: photoCount }, { data: paidPayments }] = await Promise.all([
    supabase.from("hikes").select("id,name,slug,starts_at,location_name,capacity,cover_path").gte("starts_at", now).is("deleted_at", null).order("starts_at").limit(10),
    supabase.from("payments").select("id,amount_cents,created_at,order:orders(order_number,profile:profiles(first_name,last_name),booking:bookings(booking_number,profile:profiles(first_name,last_name)))").eq("status", "UNDER_REVIEW").order("created_at", { ascending: false }).limit(5),
    supabase.from("bookings").select("id,status,total_cents,hike_id").in("status", ["CONFIRMED", "PENDING_PAYMENT"]).order("created_at", { ascending: false }).limit(250),
    supabase.from("photos").select("id", { count: "exact", head: true }),
    supabase.from("payments").select("amount_cents").eq("status", "PAID"),
  ]);
  const nextHike = hikes?.[0] ?? null;
  const nextBookings = (recentBookings ?? []).filter((booking) => booking.hike_id === nextHike?.id);
  const confirmedIncome = (paidPayments ?? []).reduce((sum, payment) => sum + payment.amount_cents, 0);
  const pendingBookings = (recentBookings ?? []).filter((booking) => booking.status === "PENDING_PAYMENT").length;
  const profile = session.mode === "live" ? session.profile : null;

  return (
    <main className="admin-page">
      <AdminNav active="/admin" hikeId={nextHike?.id} />
      <section className="admin-content">
        <AdminMobileNav />
        <header>
          <div><p>RESUMEN DE OPERACIÓN</p><h1>Hola, {profile?.first_name ?? "Mishu"}.</h1></div>
          <div className="admin-head-actions"><Link href="/admin/hikes/nuevo"><Plus aria-hidden="true" /> NUEVO HIKE</Link></div>
        </header>
        <section className="kpi-grid admin-kpi-first">
          <article><span>HIKES PRÓXIMOS</span><strong>{hikes?.length ?? 0}</strong><small>publicados y borradores</small></article>
          <article><span>RESERVAS ACTIVAS</span><strong>{recentBookings?.length ?? 0}</strong><small>{pendingBookings} con pago pendiente</small></article>
          <article><span>INGRESOS CONFIRMADOS</span><strong>{money(confirmedIncome)}</strong><small>reservaciones activas</small></article>
          <article><span>FOTOS</span><strong>{photoCount ?? 0}</strong><small>organizadas por hike</small></article>
        </section>
        {nextHike ? (
          <section className="admin-next admin-next-compact">
            <div className="admin-next-image"><img src={hikeCoverUrl(nextHike.id, nextHike.cover_path)} alt={nextHike.name} /><span>PRÓXIMA AVENTURA</span></div>
            <div>
              <p>PRÓXIMO HIKE</p><h2>{nextHike.name}</h2><span>{adminDate(nextHike.starts_at)} · {nextHike.location_name}</span>
              <div className="admin-stats"><div><strong>{nextBookings.length}</strong><small>RESERVAS</small></div><div><strong>{nextHike.capacity}</strong><small>CUPO</small></div><div><strong>{pendingPayments?.length ?? 0}</strong><small>ALERTAS</small></div></div>
              <Link className="button button-primary" href={`/admin/hike-mode?hike=${nextHike.id}`}><Bolt aria-hidden="true" /> OPERAR HIKE</Link>
            </div>
          </section>
        ) : <section className="admin-empty-state"><Mountain aria-hidden="true" /><div><h2>No hay aventuras próximas</h2><p>Crea el siguiente hike para comenzar.</p></div><Link className="button button-primary" href="/admin/hikes/nuevo">CREAR HIKE</Link></section>}
        <section className="admin-lower admin-dashboard-lower">
          <div className="admin-table">
            <div className="admin-section-head"><div><p>ACCESOS DIRECTOS</p><h2>Operación</h2></div></div>
            <div className="admin-quick-grid">
              <Link href="/admin/hikes"><strong>Hikes</strong><span>Edita contenido, precios y transporte.</span></Link>
              <Link href="/admin/clientes"><strong>Clientes</strong><span>Consulta expedientes y descarga responsivas.</span></Link>
              <Link href="/admin/reservaciones"><strong>Reservaciones</strong><span>Consulta personas, perritos y estatus.</span></Link>
              <Link href="/admin/fotos"><strong>Fotografías</strong><span>Carga, publica y vende recuerdos.</span></Link>
              <Link href="/admin/productos"><strong>Productos</strong><span>Administra catálogo, precios e inventario.</span></Link>
              <Link href="/admin/reportes"><strong>Reportes</strong><span>Descarga manifiestos y conciliación.</span></Link>
              <Link href="/admin/configuracion-pagos"><strong>Configuración de pagos</strong><span>Administra transferencias y Stripe.</span></Link>
              <Link href="/admin/sitio"><strong>Sitio</strong><span>Edita imágenes y textos del landing.</span></Link>
            </div>
          </div>
          <div className="alerts-panel">
            <div className="admin-section-head"><div><p>ATENCIÓN</p><h2>Alertas de pago</h2></div><span>{pendingPayments?.length ?? 0}</span></div>
            {pendingPayments?.length ? pendingPayments.map((payment) => {
              const order = Array.isArray(payment.order) ? payment.order[0] : payment.order;
              const booking = Array.isArray(order?.booking) ? order.booking[0] : order?.booking;
              return <article key={payment.id}><strong><AlertTriangle aria-hidden="true" /> {profileName(booking?.profile ?? order?.profile)}</strong><p>Transferencia por {money(payment.amount_cents)}.</p><ApprovePaymentButton paymentId={payment.id} /></article>;
            }) : <div className="admin-clear-state"><CircleCheck aria-hidden="true" /><p>No hay pagos por revisar.</p></div>}
            <Link className="admin-text-link" href="/admin/pagos">VER TODOS LOS PAGOS</Link>
          </div>
        </section>
      </section>
    </main>
  );
}

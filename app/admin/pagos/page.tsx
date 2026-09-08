import { AlertTriangle, CircleCheck } from "lucide-react";
import { requireStaffSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { adminDate, money, paymentStatus, profileName } from "../admin-utils";
import { ApprovePaymentButton } from "../approve-payment-button";

export const dynamic = "force-dynamic";

export default async function PaymentsAdminPage() {
  await requireStaffSession("/admin/pagos");
  const supabase = await createSupabaseServerClient();
  const [{ data: payments }, { data: next }] = await Promise.all([
    supabase.from("payments").select("id,provider,method,status,amount_cents,paid_at,created_at,order:orders(order_number,booking:bookings(booking_number,profile:profiles(first_name,last_name),hike:hikes(name)))").order("created_at", { ascending: false }).limit(300),
    supabase.from("hikes").select("id").gte("starts_at", new Date().toISOString()).is("deleted_at", null).order("starts_at").limit(1).maybeSingle(),
  ]);
  const paid = payments?.filter((item) => item.status === "PAID").reduce((sum, item) => sum + item.amount_cents, 0) ?? 0;
  const pending = payments?.filter((item) => ["PENDING","UNDER_REVIEW"].includes(item.status)).reduce((sum, item) => sum + item.amount_cents, 0) ?? 0;
  return <main className="admin-page"><AdminNav active="/admin/pagos" hikeId={next?.id} /><section className="admin-content"><AdminMobileNav />
    <header><div><p>CONCILIACIÓN</p><h1>Pagos.</h1></div></header>
    <section className="kpi-grid admin-kpi-first"><article><span>COBRADO</span><strong>{money(paid)}</strong><small>pagos confirmados</small></article><article><span>PENDIENTE</span><strong>{money(pending)}</strong><small>por cobrar o revisar</small></article><article><span>OPERACIONES</span><strong>{payments?.length ?? 0}</strong><small>historial completo</small></article></section>
    <section className="admin-table admin-module-panel"><div className="admin-section-head"><div><p>MOVIMIENTOS</p><h2>Historial de pagos</h2></div></div>
      <div className="admin-payment-list">{payments?.map((payment) => {
        const order = Array.isArray(payment.order) ? payment.order[0] : payment.order; const booking = Array.isArray(order?.booking) ? order.booking[0] : order?.booking; const hike = Array.isArray(booking?.hike) ? booking.hike[0] : booking?.hike;
        return <article key={payment.id}><div><strong>{profileName(booking?.profile)}</strong><small>{hike?.name ?? "Compra de fotografías"} · {order?.order_number}</small></div><span>{payment.method === "CARD" ? "TARJETA" : "TRANSFERENCIA"}</span><strong>{money(payment.amount_cents)}</strong><em className={payment.status === "PAID" ? "paid" : ""}>{paymentStatus(payment.status)}</em><small>{adminDate(payment.paid_at ?? payment.created_at)}</small>{payment.status === "UNDER_REVIEW" ? <ApprovePaymentButton paymentId={payment.id} /> : payment.status === "PAID" ? <CircleCheck /> : <AlertTriangle />}</article>;
      })}</div>
    </section>
  </section></main>;
}

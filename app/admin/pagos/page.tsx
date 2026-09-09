import { AlertTriangle, CircleCheck, FileDown } from "lucide-react";
import { requireStaffSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { adminDate, money, paymentStatus, profileName } from "../admin-utils";
import {
  ApprovePaymentButton,
  RefundPaymentButton,
} from "../approve-payment-button";

export const dynamic = "force-dynamic";

export default async function PaymentsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; method?: string }>;
}) {
  await requireStaffSession("/admin/pagos");
  const filters = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data: payments }, { data: next }] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id,provider,method,status,amount_cents,paid_at,created_at,payment_receipts(id,created_at),order:orders(order_number,profile:profiles(first_name,last_name),order_items(item_type,description),booking:bookings(booking_number,profile:profiles(first_name,last_name),hike:hikes(name)))",
      )
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("hikes")
      .select("id")
      .gte("starts_at", new Date().toISOString())
      .is("deleted_at", null)
      .order("starts_at")
      .limit(1)
      .maybeSingle(),
  ]);
  const paid =
    payments
      ?.filter((item) => item.status === "PAID")
      .reduce((sum, item) => sum + item.amount_cents, 0) ?? 0;
  const pending =
    payments
      ?.filter((item) => ["PENDING", "UNDER_REVIEW"].includes(item.status))
      .reduce((sum, item) => sum + item.amount_cents, 0) ?? 0;
  const term = (filters.q ?? "").trim().toLocaleLowerCase("es-MX");
  const status = (filters.status ?? "ALL").toUpperCase();
  const method = (filters.method ?? "ALL").toUpperCase();
  const visible = (payments ?? []).filter((payment) => {
    const order = Array.isArray(payment.order)
      ? payment.order[0]
      : payment.order;
    const booking = Array.isArray(order?.booking)
      ? order.booking[0]
      : order?.booking;
    const hike = Array.isArray(booking?.hike) ? booking.hike[0] : booking?.hike;
    const searchable = [
      profileName(booking?.profile ?? order?.profile),
      order?.order_number,
      booking?.booking_number,
      hike?.name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("es-MX");
    return (
      (!term || searchable.includes(term)) &&
      (status === "ALL" || payment.status === status) &&
      (method === "ALL" || payment.method === method)
    );
  });
  return (
    <main className="admin-page">
      <AdminNav active="/admin/pagos" hikeId={next?.id} />
      <section className="admin-content">
        <AdminMobileNav />
        <header>
          <div>
            <p>CONCILIACIÓN</p>
            <h1>Pagos.</h1>
          </div>
        </header>
        <section className="kpi-grid admin-kpi-first">
          <article>
            <span>COBRADO</span>
            <strong>{money(paid)}</strong>
            <small>pagos confirmados</small>
          </article>
          <article>
            <span>PENDIENTE</span>
            <strong>{money(pending)}</strong>
            <small>por cobrar o revisar</small>
          </article>
          <article>
            <span>OPERACIONES</span>
            <strong>{payments?.length ?? 0}</strong>
            <small>historial completo</small>
          </article>
        </section>
        <section className="admin-table admin-module-panel">
          <div className="admin-section-head">
            <div>
              <p>MOVIMIENTOS</p>
              <h2>Historial de pagos</h2>
            </div>
          </div>
          <form className="payment-admin-filters">
            <input
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Cliente, reservación, pedido o hike"
            />
            <select name="status" defaultValue={status}>
              <option value="ALL">Todos los estados</option>
              <option value="PENDING">Pendiente</option>
              <option value="UNDER_REVIEW">Por revisar</option>
              <option value="PAID">Pagado</option>
              <option value="FAILED">Fallido</option>
              <option value="REFUNDED">Reembolsado</option>
            </select>
            <select name="method" defaultValue={method}>
              <option value="ALL">Todos los métodos</option>
              <option value="CARD">Tarjeta</option>
              <option value="TRANSFER">Transferencia</option>
            </select>
            <button>FILTRAR</button>
          </form>
          <div className="admin-payment-list">
            {visible.map((payment) => {
              const order = Array.isArray(payment.order)
                ? payment.order[0]
                : payment.order;
              const booking = Array.isArray(order?.booking)
                ? order.booking[0]
                : order?.booking;
              const hike = Array.isArray(booking?.hike)
                ? booking.hike[0]
                : booking?.hike;
              const hasProducts = order?.order_items?.some(
                (item) => item.item_type === "PRODUCT",
              );
              const receipt = payment.payment_receipts?.[0];
              return (
                <article key={payment.id}>
                  <div>
                    <strong>
                      {profileName(booking?.profile ?? order?.profile)}
                    </strong>
                    <small>
                      {hike?.name ??
                        (hasProducts
                          ? "Pedido de productos"
                          : "Compra de fotografías")}{" "}
                      · {order?.order_number}
                    </small>
                    {receipt && (
                      <a
                        target="_blank"
                        rel="noreferrer"
                        href={`/api/admin/payment-receipts/${receipt.id}/download`}
                      >
                        <FileDown /> VER COMPROBANTE
                      </a>
                    )}
                  </div>
                  <span>
                    {payment.method === "CARD" ? "TARJETA" : "TRANSFERENCIA"}
                  </span>
                  <strong>{money(payment.amount_cents)}</strong>
                  <em className={payment.status === "PAID" ? "paid" : ""}>
                    {paymentStatus(payment.status)}
                  </em>
                  <small>
                    {adminDate(payment.paid_at ?? payment.created_at)}
                  </small>
                  {payment.status === "UNDER_REVIEW" ? (
                    <ApprovePaymentButton paymentId={payment.id} />
                  ) : payment.status === "PAID" ? (
                    <div className="payment-row-actions">
                      <CircleCheck />
                      <RefundPaymentButton paymentId={payment.id} />
                    </div>
                  ) : (
                    <AlertTriangle />
                  )}
                </article>
              );
            })}
            {!visible.length && (
              <div className="admin-clear-state">
                <p>No encontramos pagos con esos filtros.</p>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

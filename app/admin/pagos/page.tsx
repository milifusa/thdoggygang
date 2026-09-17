import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  FileDown,
  Landmark,
  RotateCcw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { requireStaffSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { adminDate, money, profileName } from "../admin-utils";
import {
  ApprovePaymentButton,
  RefundPaymentButton,
} from "../approve-payment-button";
import styles from "./payments.module.css";

export const dynamic = "force-dynamic";

type Tone = "paid" | "review" | "pending" | "refunded" | "closed";

function one<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

function paymentState(status: string, rawStatus: string | null) {
  if (status === "PAID") {
    return { label: "PAGADO", tone: "paid" as Tone, detail: "Cobro confirmado y conciliado." };
  }
  if (status === "UNDER_REVIEW") {
    return { label: "REQUIERE REVISIÓN", tone: "review" as Tone, detail: "Hay un comprobante de transferencia por validar." };
  }
  if (status === "PENDING") {
    return { label: "EN ESPERA", tone: "pending" as Tone, detail: "El cliente todavía no concluye el pago." };
  }
  if (status === "REFUNDED") {
    return { label: "REEMBOLSADO", tone: "refunded" as Tone, detail: "El importe fue devuelto al cliente." };
  }
  if (rawStatus?.startsWith("checkout.session.expired")) {
    return { label: "EXPIRADO", tone: "closed" as Tone, detail: "La sesión venció sin recibir el pago." };
  }
  if (rawStatus === "SUPERSEDED_BY_PAID_BOOKING") {
    return { label: "REEMPLAZADO", tone: "closed" as Tone, detail: "Otro intento de esta reservación sí fue pagado." };
  }
  if (rawStatus === "booking.cancelled") {
    return { label: "CANCELADO", tone: "closed" as Tone, detail: "La reservación asociada fue cancelada." };
  }
  return { label: "RECHAZADO", tone: "closed" as Tone, detail: "El pago no se completó." };
}

function pendingDeadline(createdAt: string) {
  return new Date(new Date(createdAt).getTime() + 48 * 60 * 60 * 1000);
}

export default async function PaymentsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; method?: string }>;
}) {
  await requireStaffSession("/admin/pagos");
  const filters = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [paymentsResult, nextHikeResult] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id,provider,method,status,raw_status,amount_cents,paid_at,created_at,payment_receipts(id,created_at),order:orders(id,order_number,status,profile:profiles(first_name,last_name),order_items(item_type,description,quantity),booking:bookings(id,booking_number,status,credit_applied_cents,profile:profiles!bookings_profile_id_fkey(first_name,last_name),hike:hikes(name)))",
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

  if (paymentsResult.error) {
    throw new Error(`No fue posible cargar los pagos: ${paymentsResult.error.message}`);
  }
  if (nextHikeResult.error) {
    throw new Error(`No fue posible cargar el próximo hike: ${nextHikeResult.error.message}`);
  }

  const payments = paymentsResult.data ?? [];
  const next = nextHikeResult.data;
  const paidPayments = payments.filter((item) => item.status === "PAID");
  const reviewPayments = payments.filter((item) => {
    const order = one(item.order);
    const booking = one(order?.booking);
    return item.status === "UNDER_REVIEW" && order?.status !== "FAILED" && booking?.status !== "CANCELLED";
  });
  const waitingPayments = payments.filter((item) => {
    const order = one(item.order);
    const booking = one(order?.booking);
    return item.status === "PENDING" && order?.status !== "FAILED" && booking?.status !== "CANCELLED";
  });
  const refundedPayments = payments.filter((item) => item.status === "REFUNDED");
  const expiredPayments = payments.filter(
    (item) => item.status === "FAILED" && item.raw_status?.startsWith("checkout.session.expired"),
  );
  const paid = paidPayments.reduce((sum, item) => sum + item.amount_cents, 0);
  const review = reviewPayments.reduce((sum, item) => sum + item.amount_cents, 0);
  const waiting = waitingPayments.reduce((sum, item) => sum + item.amount_cents, 0);
  const refunded = refundedPayments.reduce((sum, item) => sum + item.amount_cents, 0);

  const term = (filters.q ?? "").trim().toLocaleLowerCase("es-MX");
  const status = (filters.status ?? "ALL").toUpperCase();
  const method = (filters.method ?? "ALL").toUpperCase();
  const visible = payments.filter((payment) => {
    const order = one(payment.order);
    const booking = one(order?.booking);
    const hike = one(booking?.hike);
    const state = paymentState(payment.status, payment.raw_status);
    const searchable = [profileName(booking?.profile ?? order?.profile), order?.order_number, booking?.booking_number, hike?.name, state.label]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("es-MX");
    const matchesStatus =
      status === "ALL" ||
      payment.status === status ||
      (status === "EXPIRED" && state.label === "EXPIRADO") ||
      (status === "REPLACED" && state.label === "REEMPLAZADO");
    return (!term || searchable.includes(term)) && matchesStatus && (method === "ALL" || payment.method === method);
  });

  const quickFilters = [
    { label: "Todos", value: "ALL", count: payments.length },
    { label: "Requieren acción", value: "UNDER_REVIEW", count: reviewPayments.length },
    { label: "En espera", value: "PENDING", count: waitingPayments.length },
    { label: "Pagados", value: "PAID", count: paidPayments.length },
    { label: "Expirados", value: "EXPIRED", count: expiredPayments.length },
    { label: "Reembolsados", value: "REFUNDED", count: refundedPayments.length },
  ];

  return (
    <main className="admin-page">
      <AdminNav active="/admin/pagos" hikeId={next?.id} />
      <section className="admin-content">
        <AdminMobileNav />
        <header className={styles.header}>
          <div>
            <p>DINERO Y CONCILIACIÓN</p>
            <h1>Pagos.</h1>
            <span>Distingue rápidamente qué ya se cobró, qué necesita una decisión y qué intento quedó inconcluso.</span>
          </div>
          <div className={styles.liveStatus}>
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>Conciliación activa</strong>
              <small>Stripe y vencimientos se revisan automáticamente.</small>
            </div>
          </div>
        </header>

        <section className={styles.summaryGrid} aria-label="Resumen de pagos">
          <article className={styles.summaryPaid}>
            <div className={styles.summaryIcon}><CheckCircle2 aria-hidden="true" /></div>
            <span>COBRADO</span><strong>{money(paid)}</strong><small>{paidPayments.length} pagos confirmados</small>
          </article>
          <article className={styles.summaryReview}>
            <div className={styles.summaryIcon}><AlertCircle aria-hidden="true" /></div>
            <span>REQUIERE ACCIÓN</span><strong>{money(review)}</strong><small>{reviewPayments.length} comprobantes por revisar</small>
          </article>
          <article className={styles.summaryWaiting}>
            <div className={styles.summaryIcon}><Clock3 aria-hidden="true" /></div>
            <span>EN ESPERA</span><strong>{money(waiting)}</strong><small>{waitingPayments.length} intentos dentro de 48 horas</small>
          </article>
          <article className={styles.summaryRefunded}>
            <div className={styles.summaryIcon}><RotateCcw aria-hidden="true" /></div>
            <span>DEVUELTO</span><strong>{money(refunded)}</strong><small>{refundedPayments.length} pagos reembolsados</small>
          </article>
        </section>

        <section className={styles.workspace}>
          <div className={styles.workspaceHeading}>
            <div><p>MOVIMIENTOS</p><h2>Control de pagos</h2></div>
            <span>{visible.length} resultados</span>
          </div>

          <nav className={styles.quickFilters} aria-label="Filtros rápidos">
            {quickFilters.map((filter) => (
              <Link
                key={filter.value}
                className={status === filter.value ? styles.activeFilter : ""}
                href={{ pathname: "/admin/pagos", query: { ...(filters.q ? { q: filters.q } : {}), status: filter.value, ...(method !== "ALL" ? { method } : {}) } }}
              >
                {filter.label}<span>{filter.count}</span>
              </Link>
            ))}
          </nav>

          <form className={styles.filters}>
            <label className={styles.searchField}>
              <span>BUSCAR</span>
              <div><Search aria-hidden="true" /><input name="q" defaultValue={filters.q ?? ""} placeholder="Cliente, reservación, pedido o hike" /></div>
            </label>
            <label>
              <span>ESTADO</span>
              <select name="status" defaultValue={status}>
                <option value="ALL">Todos</option>
                <option value="UNDER_REVIEW">Requiere revisión</option>
                <option value="PENDING">En espera</option>
                <option value="PAID">Pagado</option>
                <option value="EXPIRED">Expirado</option>
                <option value="REPLACED">Reemplazado</option>
                <option value="FAILED">Rechazado o cerrado</option>
                <option value="REFUNDED">Reembolsado</option>
              </select>
            </label>
            <label>
              <span>MÉTODO</span>
              <select name="method" defaultValue={method}>
                <option value="ALL">Todos</option><option value="CARD">Tarjeta</option><option value="TRANSFER">Transferencia</option>
              </select>
            </label>
            <button type="submit">APLICAR FILTROS</button>
          </form>

          <div className={styles.paymentList}>
            {visible.map((payment) => {
              const order = one(payment.order);
              const booking = one(order?.booking);
              const hike = one(booking?.hike);
              const items = order?.order_items ?? [];
              const receipt = payment.payment_receipts?.[0];
              const state = paymentState(payment.status, payment.raw_status);
              const customer = profileName(booking?.profile ?? order?.profile);
              const initials = customer.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
              const itemSummary = items.length
                ? items.slice(0, 2).map((item) => `${item.quantity} × ${item.description}`).join(" · ")
                : "Pago de reservación";
              const MethodIcon = payment.method === "CARD" ? CreditCard : Landmark;
              const isWaiting = payment.status === "PENDING";
              const bookingHref = booking?.id ? `/admin/reservaciones/${booking.id}` : undefined;

              return (
                <article className={styles.paymentCard} key={payment.id}>
                  <div className={styles.customerBlock}>
                    <div className={styles.avatar}>{initials || "DG"}</div>
                    <div><strong>{customer}</strong><span>{hike?.name ?? "Compra sin hike"}</span></div>
                  </div>
                  <div className={`${styles.stateBlock} ${styles[state.tone]}`}>
                    <span>{state.label}</span><small>{state.detail}</small>
                  </div>
                  <div className={styles.amountBlock}>
                    <strong>{money(payment.amount_cents)}</strong>
                    <span><MethodIcon aria-hidden="true" />{payment.method === "CARD" ? "Tarjeta" : "Transferencia"}</span>
                    {booking?.credit_applied_cents > 0 && <small>+ {money(booking.credit_applied_cents)} de crédito</small>}
                  </div>
                  <dl className={styles.details}>
                    <div><dt>PEDIDO</dt><dd>{order?.order_number ?? "Sin folio"}</dd></div>
                    <div><dt>RESERVACIÓN</dt><dd>{booking?.booking_number ?? "No aplica"}</dd></div>
                    <div><dt>{isWaiting ? "VENCE" : "FECHA"}</dt><dd>{isWaiting ? adminDate(pendingDeadline(payment.created_at).toISOString()) : adminDate(payment.paid_at ?? payment.created_at)}</dd></div>
                    <div className={styles.conceptDetail}><dt>CONCEPTO</dt><dd>{itemSummary}{items.length > 2 ? ` · +${items.length - 2} más` : ""}</dd></div>
                  </dl>
                  <div className={styles.actions}>
                    {bookingHref && <Link href={bookingHref}>VER RESERVACIÓN <ExternalLink aria-hidden="true" /></Link>}
                    {receipt && <a target="_blank" rel="noreferrer" href={`/api/admin/payment-receipts/${receipt.id}/download`}><FileDown aria-hidden="true" /> COMPROBANTE</a>}
                    {payment.status === "UNDER_REVIEW" ? (
                      <ApprovePaymentButton paymentId={payment.id} />
                    ) : payment.status === "PAID" ? (
                      <RefundPaymentButton paymentId={payment.id} />
                    ) : isWaiting ? (
                      <span className={styles.automaticNote}><Clock3 aria-hidden="true" /> CIERRE AUTOMÁTICO A LAS 48 H</span>
                    ) : (
                      <span className={styles.closedNote}><XCircle aria-hidden="true" /> OPERACIÓN CERRADA</span>
                    )}
                  </div>
                </article>
              );
            })}
            {!visible.length && (
              <div className={styles.emptyState}>
                <Banknote aria-hidden="true" /><h3>No hay pagos con esos filtros.</h3><p>Prueba otro estado, método o término de búsqueda.</p><Link href="/admin/pagos">LIMPIAR FILTROS</Link>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

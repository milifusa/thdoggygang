import { CalendarX2, Clock3, WalletCards } from "lucide-react";
import { requireStaffSession } from "../../lib/auth/guards";
import { getCancellationSettings } from "../../lib/server/member-credit";
import { createSupabaseServiceClient } from "../../lib/supabase/service";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { adminDate, money, profileName } from "../admin-utils";
import { CancellationSettingsForm } from "./cancellation-settings-form";

export const dynamic = "force-dynamic";

const one = <T,>(value: T | T[] | null | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function CancellationsAdminPage() {
  await requireStaffSession("/admin/cancelaciones");
  const service = createSupabaseServiceClient();
  const [settings, requestsResult, creditsResult, nextResult] = await Promise.all([
    getCancellationSettings(),
    service
      .from("booking_cancellation_requests")
      .select("id,status,reason,credit_amount_cents,created_at,booking:bookings(booking_number,hike:hikes(name),profile:profiles!bookings_profile_id_fkey(first_name,last_name,email))")
      .order("created_at", { ascending: false })
      .limit(100),
    service
      .from("member_credit_transactions")
      .select("id,amount_cents,kind,status,note,created_at,profile:profiles!member_credit_transactions_profile_id_fkey(id,first_name,last_name,email),booking:bookings(booking_number)")
      .order("created_at", { ascending: false })
      .limit(1000),
    service
      .from("hikes")
      .select("id")
      .gte("starts_at", new Date().toISOString())
      .is("deleted_at", null)
      .order("starts_at")
      .limit(1)
      .maybeSingle(),
  ]);
  if (requestsResult.error || creditsResult.error)
    throw new Error("No fue posible cargar cancelaciones y créditos.");
  const requests = requestsResult.data ?? [];
  const credits = creditsResult.data ?? [];
  const issued = credits
    .filter((item) => item.amount_cents > 0 && item.status === "POSTED")
    .reduce((sum, item) => sum + item.amount_cents, 0);
  const used = credits
    .filter((item) => item.amount_cents < 0 && item.status === "POSTED")
    .reduce((sum, item) => sum + Math.abs(item.amount_cents), 0);
  const reserved = credits
    .filter((item) => item.amount_cents < 0 && item.status === "RESERVED")
    .reduce((sum, item) => sum + Math.abs(item.amount_cents), 0);
  const balances = Array.from(
    credits
      .filter((item) => item.status !== "VOID")
      .reduce((map, item) => {
        const profile = one(item.profile);
        if (!profile) return map;
        const current = map.get(profile.id) ?? { profile, balance: 0 };
        current.balance += item.amount_cents;
        map.set(profile.id, current);
        return map;
      }, new Map<string, { profile: { id: string; first_name: string; last_name: string; email: string | null }; balance: number }>())
      .values(),
  )
    .filter((entry) => entry.balance > 0)
    .sort((left, right) => right.balance - left.balance);
  return (
    <main className="admin-page">
      <AdminNav active="/admin/cancelaciones" hikeId={nextResult.data?.id} />
      <section className="admin-content">
        <AdminMobileNav />
        <header>
          <div><p>POLÍTICAS Y SALDOS</p><h1>Cancelaciones y créditos.</h1></div>
        </header>
        <section className="kpi-grid admin-kpi-first cancellation-kpis">
          <article><span>CRÉDITO EMITIDO</span><strong>{money(issued)}</strong><small>por cancelaciones</small></article>
          <article><span>CRÉDITO UTILIZADO</span><strong>{money(used)}</strong><small>en nuevos hikes</small></article>
          <article><span>CRÉDITO RESERVADO</span><strong>{money(reserved)}</strong><small>en compras en proceso</small></article>
          <article><span>CANCELACIONES</span><strong>{requests.length}</strong><small>historial visible</small></article>
        </section>
        <section className="admin-panel admin-module-panel">
          <CancellationSettingsForm initial={settings} />
        </section>
        <section className="admin-panel admin-module-panel credit-balances-panel">
          <div className="admin-section-head"><div><p>SALDOS DISPONIBLES</p><h2>Crédito por cliente</h2></div><WalletCards /></div>
          <div className="credit-balance-grid">
            {balances.map(({ profile, balance }) => <article key={profile.id}><div><strong>{profileName(profile)}</strong><small>{profile.email}</small></div><span>{money(balance)}</span></article>)}
            {!balances.length && <p>Aún no hay clientes con crédito disponible.</p>}
          </div>
        </section>
        <div className="cancellation-admin-grid">
          <section className="admin-panel admin-module-panel">
            <div className="admin-section-head"><div><p>HISTORIAL</p><h2>Cancelaciones</h2></div><CalendarX2 /></div>
            <div className="credit-ledger-list">
              {requests.map((request) => {
                const booking = one(request.booking);
                const hike = one(booking?.hike);
                return <article key={request.id}>
                  <div><strong>{profileName(booking?.profile)}</strong><small>{hike?.name} · {booking?.booking_number}</small></div>
                  <span>{request.status}</span><strong>{money(request.credit_amount_cents)} crédito</strong>
                  <small>{adminDate(request.created_at)} · {request.reason}</small>
                </article>;
              })}
              {!requests.length && <p>No hay cancelaciones registradas.</p>}
            </div>
          </section>
          <section className="admin-panel admin-module-panel">
            <div className="admin-section-head"><div><p>BITÁCORA</p><h2>Movimientos de crédito</h2></div><WalletCards /></div>
            <div className="credit-ledger-list">
              {credits.map((credit) => {
                const booking = one(credit.booking);
                return <article key={credit.id}>
                  <div><strong>{profileName(credit.profile)}</strong><small>{booking?.booking_number ?? "Ajuste de cuenta"}</small></div>
                  <span>{credit.status}</span><strong className={credit.amount_cents < 0 ? "credit-debit" : "credit-income"}>{credit.amount_cents < 0 ? "−" : "+"}{money(Math.abs(credit.amount_cents))}</strong>
                  <small>{adminDate(credit.created_at)} · {credit.note}</small>
                </article>;
              })}
              {!credits.length && <p>Aún no hay movimientos de crédito.</p>}
            </div>
          </section>
        </div>
        <div className="cancellation-policy-note"><Clock3 /><p>El plazo se calcula desde la hora exacta de inicio de cada hike. Los administradores pueden atender casos extraordinarios desde la reservación.</p></div>
      </section>
    </main>
  );
}

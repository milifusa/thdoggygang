import {
  Award,
  ChevronRight,
  Gift,
  Mountain,
  Search,
  Share2,
  Users,
} from "lucide-react";
import { requireStaffSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { adminDate } from "../admin-utils";

export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  referral_code: string | null;
  referred_by: string | null;
  created_at: string;
};

type LedgerRow = {
  id: string;
  profile_id: string;
  points: number;
  reason: string;
  description: string;
  created_at: string;
};

type StampRow = {
  id: string;
  profile_id: string;
  booking_number: string;
  status: string;
  hike:
    | { name: string; starts_at: string }
    | Array<{ name: string; starts_at: string }>
    | null;
};

const rewardLevels = [500, 1000, 1500] as const;

function clientName(client: ClientRow) {
  return (
    `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || "Cliente"
  );
}

function singleHike(stamp: StampRow) {
  return Array.isArray(stamp.hike) ? stamp.hike[0] : stamp.hike;
}

function reasonLabel(reason: string) {
  return (
    {
      HIKE_COMPLETED: "HIKE COMPLETADO",
      REFERRAL_COMPLETED: "REFERIDO COMPLETADO",
      REFERRED_WELCOME: "BONO DE BIENVENIDA",
      ADMIN_ADJUSTMENT: "AJUSTE ADMINISTRATIVO",
    }[reason] ?? reason.replaceAll("_", " ")
  );
}

export default async function RewardsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireStaffSession("/admin/recompensas");
  const supabase = await createSupabaseServerClient();
  const [{ data: clientsData, error: clientsError }, { data: ledgerData, error: ledgerError }, { data: stampsData, error: stampsError }, { data: next }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id,first_name,last_name,email,phone,referral_code,referred_by,created_at",
        )
        .eq("role", "CLIENT")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("reward_ledger")
        .select("id,profile_id,points,reason,description,created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("bookings")
        .select(
          "id,profile_id,booking_number,status,hike:hikes(name,starts_at)",
        )
        .in("status", ["CONFIRMED", "COMPLETED"])
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("hikes")
        .select("id")
        .gte("starts_at", new Date().toISOString())
        .is("deleted_at", null)
        .order("starts_at")
        .limit(1)
        .maybeSingle(),
    ]);

  if (clientsError || ledgerError || stampsError) {
    throw new Error("No pudimos cargar el programa de recompensas.", {
      cause: clientsError ?? ledgerError ?? stampsError,
    });
  }

  const clients = (clientsData ?? []) as ClientRow[];
  const ledger = (ledgerData ?? []) as LedgerRow[];
  const stamps = ((stampsData ?? []) as StampRow[]).filter((stamp) => {
    const hike = singleHike(stamp);
    return (
      stamp.status === "COMPLETED" ||
      Boolean(hike && new Date(hike.starts_at) < new Date())
    );
  });
  const ledgerByClient = new Map<string, LedgerRow[]>();
  const stampsByClient = new Map<string, StampRow[]>();
  const referralsByClient = new Map<string, ClientRow[]>();

  for (const item of ledger) {
    ledgerByClient.set(item.profile_id, [
      ...(ledgerByClient.get(item.profile_id) ?? []),
      item,
    ]);
  }
  for (const stamp of stamps) {
    stampsByClient.set(stamp.profile_id, [
      ...(stampsByClient.get(stamp.profile_id) ?? []),
      stamp,
    ]);
  }
  for (const referred of clients) {
    if (!referred.referred_by) continue;
    referralsByClient.set(referred.referred_by, [
      ...(referralsByClient.get(referred.referred_by) ?? []),
      referred,
    ]);
  }

  const { q = "" } = await searchParams;
  const query = q.trim().toLocaleLowerCase("es-MX");
  const visibleClients = clients.filter((client) => {
    if (!query) return true;
    return [
      clientName(client),
      client.email,
      client.phone,
      client.referral_code,
    ].some((value) => value?.toLocaleLowerCase("es-MX").includes(query));
  });
  const totalPoints = ledger.reduce((sum, item) => sum + item.points, 0);
  const clientsWithRewards = clients.filter((client) => {
    const points = (ledgerByClient.get(client.id) ?? []).reduce(
      (sum, item) => sum + item.points,
      0,
    );
    return points >= rewardLevels[0];
  }).length;

  return (
    <main className="admin-page">
      <AdminNav active="/admin/recompensas" hikeId={next?.id} />
      <section className="admin-content">
        <AdminMobileNav />
        <header>
          <div>
            <p>FIDELIDAD Y REFERIDOS</p>
            <h1>Recompensas.</h1>
          </div>
        </header>

        <section className="reward-admin-kpis" aria-label="Resumen de recompensas">
          <article><Users /><span>CLIENTES</span><strong>{clients.length}</strong></article>
          <article><Mountain /><span>SELLOS</span><strong>{stamps.length}</strong></article>
          <article><Award /><span>PUNTOS</span><strong>{totalPoints.toLocaleString("es-MX")}</strong></article>
          <article><Share2 /><span>REFERIDOS</span><strong>{clients.filter((client) => client.referred_by).length}</strong></article>
          <article><Gift /><span>CON NIVEL ALCANZADO</span><strong>{clientsWithRewards}</strong></article>
        </section>

        <section className="admin-panel reward-scheme">
          <div>
            <p>ESQUEMA ACTUAL</p>
            <h2>Así se ganan los puntos</h2>
          </div>
          <ol>
            <li><strong>100</strong><span>por completar un hike</span></li>
            <li><strong>150</strong><span>para quien refiere</span></li>
            <li><strong>75</strong><span>para la persona invitada</span></li>
          </ol>
          <p className="reward-scheme-note">
            Los niveles de regalo se alcanzan a los 500, 1,000 y 1,500 puntos.
            Esta vista muestra elegibilidad; la entrega del regalo se confirma fuera del sistema.
          </p>
        </section>

        <section className="admin-panel admin-module-panel">
          <div className="admin-section-head reward-admin-heading">
            <div>
              <p>EXPEDIENTE DE BENEFICIOS</p>
              <h2>{visibleClients.length} clientes</h2>
            </div>
            <form className="reward-admin-search">
              <Search aria-hidden="true" />
              <input
                aria-label="Buscar cliente"
                defaultValue={q}
                name="q"
                placeholder="Nombre, correo, teléfono o código"
              />
              <button type="submit">BUSCAR</button>
            </form>
          </div>

          <div className="reward-admin-list">
            {visibleClients.map((client) => {
              const clientLedger = ledgerByClient.get(client.id) ?? [];
              const clientStamps = stampsByClient.get(client.id) ?? [];
              const referrals = referralsByClient.get(client.id) ?? [];
              const points = clientLedger.reduce(
                (sum, item) => sum + item.points,
                0,
              );
              const unlocked = rewardLevels.filter((level) => points >= level);
              const nextLevel = rewardLevels.find((level) => points < level);
              return (
                <details
                  className="reward-admin-card"
                  id={`cliente-${client.id}`}
                  key={client.id}
                >
                  <summary>
                    <div className="admin-client-avatar">
                      {`${client.first_name?.[0] ?? ""}${client.last_name?.[0] ?? ""}`.toUpperCase()}
                    </div>
                    <div className="reward-admin-identity">
                      <strong>{clientName(client)}</strong>
                      <small>{client.email ?? client.phone ?? "Sin contacto"}</small>
                    </div>
                    <span><Mountain /> {clientStamps.length} sellos</span>
                    <span><Award /> {points.toLocaleString("es-MX")} puntos</span>
                    <span><Share2 /> {referrals.length} referidos</span>
                    <span><Gift /> {unlocked.length} niveles</span>
                    <ChevronRight className="reward-admin-chevron" aria-hidden="true" />
                  </summary>
                  <div className="reward-admin-detail">
                    <section>
                      <h3><Mountain /> Sellos del pasaporte</h3>
                      {clientStamps.length ? clientStamps.map((stamp) => {
                        const hike = singleHike(stamp);
                        return <article className="reward-entry" key={stamp.id}>
                          <strong>{hike?.name ?? "Hike completado"}</strong>
                          <small>{hike ? adminDate(hike.starts_at) : stamp.booking_number}</small>
                          <span>{stamp.booking_number}</span>
                        </article>;
                      }) : <p className="admin-empty-copy">Todavía no tiene sellos.</p>}
                    </section>
                    <section>
                      <h3><Award /> Movimientos de puntos</h3>
                      {clientLedger.length ? clientLedger.map((item) => <article className="reward-entry" key={item.id}>
                        <strong>{item.description}</strong>
                        <small>{reasonLabel(item.reason)} · {adminDate(item.created_at)}</small>
                        <b className={item.points >= 0 ? "positive" : "negative"}>{item.points > 0 ? "+" : ""}{item.points}</b>
                      </article>) : <p className="admin-empty-copy">Todavía no tiene movimientos.</p>}
                    </section>
                    <section>
                      <h3><Share2 /> Referidos</h3>
                      {referrals.length ? referrals.map((referred) => {
                        const completed = (stampsByClient.get(referred.id) ?? []).some((stamp) => stamp.status === "COMPLETED");
                        return <article className="reward-entry" key={referred.id}>
                          <strong>{clientName(referred)}</strong>
                          <small>{referred.email ?? "Sin correo"}</small>
                          <span className={completed ? "completed" : "pending"}>{completed ? "PRIMER HIKE COMPLETADO" : "PENDIENTE"}</span>
                        </article>;
                      }) : <p className="admin-empty-copy">Todavía no tiene referidos.</p>}
                    </section>
                    <aside className="reward-unlock">
                      <div>
                        <Gift />
                        <span>REGALOS ALCANZADOS</span>
                        <strong>{unlocked.length} de {rewardLevels.length}</strong>
                      </div>
                      <div className="reward-levels">
                        {rewardLevels.map((level, index) => <span className={points >= level ? "unlocked" : ""} key={level}>
                          REGALO {index + 1} · {level.toLocaleString("es-MX")}
                        </span>)}
                      </div>
                      <p>{nextLevel ? `Le faltan ${Math.max(0, nextLevel - points).toLocaleString("es-MX")} puntos para el siguiente regalo.` : "Alcanzó todos los niveles actuales."}</p>
                      <small>CÓDIGO DE REFERIDO · {client.referral_code ?? "SIN CÓDIGO"}</small>
                    </aside>
                  </div>
                </details>
              );
            })}
            {!visibleClients.length && (
              <p className="admin-empty-copy">No encontramos clientes con esa búsqueda.</p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

import Link from "next/link";
import {
  AlertTriangle,
  BadgeDollarSign,
  Bolt,
  Camera,
  ChartNoAxesCombined,
  ChevronRight,
  CircleCheck,
  ExternalLink,
  House,
  Mountain,
  Pencil,
  Plus,
  ReceiptText,
} from "lucide-react";
import { requireStaffSession } from "../lib/auth/guards";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { ApprovePaymentButton } from "./approve-payment-button";
import { HikeDeleteButton } from "./hike-delete-button";

export const dynamic = "force-dynamic";

async function liveDashboard() {
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const [{ data: hikes }, { data: payments }] = await Promise.all([
    supabase
      .from("hikes")
      .select("id, name, slug, starts_at, location_name, capacity, max_dogs, published")
      .gte("starts_at", now)
      .is("deleted_at", null)
      .order("starts_at")
      .limit(12),
    supabase
      .from("payments")
      .select(
        "id, amount_cents, created_at, order:orders(order_number, booking:bookings(booking_number, profile:profiles(first_name, last_name)))",
      )
      .eq("status", "UNDER_REVIEW")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const upcomingHikes = hikes ?? [];
  const { data: activeBookings } = upcomingHikes.length
    ? await supabase
        .from("bookings")
        .select("hike_id")
        .in("hike_id", upcomingHikes.map((item) => item.id))
        .in("status", ["CONFIRMED", "PENDING_PAYMENT"])
        .limit(1)
    : { data: [] };
  const activeHikeId = activeBookings?.[0]?.hike_id;
  const hike = upcomingHikes.find((item) => item.id === activeHikeId) ?? upcomingHikes[0] ?? null;
  const { data: bookings } = hike
    ? await supabase
        .from("bookings")
        .select(
          "id, booking_number, status, total_cents, created_at, profile:profiles(first_name, last_name), booking_participants(id, snapshot), booking_dogs(id, snapshot), transport_reservations(id), signed_waivers(id), check_ins(id)",
        )
        .eq("hike_id", hike.id)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] };
  const { count: photoCount } = await supabase
    .from("photos")
    .select("id", { count: "exact", head: true });
  return {
    hike,
    hikes: upcomingHikes,
    bookings: bookings ?? [],
    payments: payments ?? [],
    photoCount: photoCount ?? 0,
  };
}

function nameFromProfile(profileValue: unknown) {
  const profile = Array.isArray(profileValue) ? profileValue[0] : profileValue;
  if (!profile || typeof profile !== "object") return "Cliente";
  const value = profile as { first_name?: string; last_name?: string };
  return `${value.first_name ?? ""} ${value.last_name ?? ""}`.trim() || "Cliente";
}

function bookingStatus(status: string) {
  const labels: Record<string, string> = {
    CONFIRMED: "CONFIRMADA",
    PENDING_PAYMENT: "PAGO PENDIENTE",
    DRAFT: "BORRADOR",
    CANCELLED: "CANCELADA",
    COMPLETED: "COMPLETADA",
  };
  return labels[status] ?? status;
}

export default async function AdminDashboard() {
  const session = await requireStaffSession("/admin");
  const live = session.mode === "live" ? await liveDashboard() : null;
  const confirmed = live?.bookings.filter((booking) => booking.status === "CONFIRMED") ?? [];
  const expected = confirmed.reduce(
    (sum, booking) => sum + booking.booking_participants.length,
    0,
  );
  const dogs = confirmed.reduce(
    (sum, booking) => sum + booking.booking_dogs.length,
    0,
  );
  const transport = confirmed.reduce(
    (sum, booking) => sum + booking.transport_reservations.length,
    0,
  );
  const checkIns = confirmed.reduce(
    (sum, booking) => sum + booking.check_ins.length,
    0,
  );
  const waiverCount = confirmed.reduce(
    (sum, booking) => sum + booking.signed_waivers.length,
    0,
  );
  const income = confirmed.reduce(
    (sum, booking) => sum + booking.total_cents,
    0,
  );
  const profile = session.mode === "live" ? session.profile : null;
  const displayName = profile?.first_name || "Mishu";
  const initials = `${profile?.first_name?.[0] ?? "M"}${profile?.last_name?.[0] ?? "L"}`.toUpperCase();
  const today = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Mexico_City",
  })
    .format(new Date())
    .replaceAll(".", "")
    .toUpperCase();
  const waiverPercent = expected ? Math.round((waiverCount / expected) * 100) : 0;

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <Link className="wordmark" href="/">
          THE DOGGY <span>GANG</span>
        </Link>
        <span className="admin-badge">ADMIN</span>
        <nav>
          <Link className="active" href="/admin">
            <House aria-hidden="true" /> Dashboard
          </Link>
          <a href="#hikes">
            <Mountain aria-hidden="true" /> Hikes
          </a>
          <a href="#bookings">
            <ReceiptText aria-hidden="true" /> Reservaciones
          </a>
          <a href="#payments">
            <BadgeDollarSign aria-hidden="true" /> Pagos
          </a>
          <a href="#photos">
            <Camera aria-hidden="true" /> Fotografías
          </a>
          <a href="#reports">
            <ChartNoAxesCombined aria-hidden="true" /> Reportes
          </a>
        </nav>
        <Link
          className="mode-link"
          href={live?.hike ? `/admin/hike-mode?hike=${live.hike.id}` : "/admin/hike-mode"}
        >
          <Bolt aria-hidden="true" /> INICIAR MODO HIKE
        </Link>
      </aside>
      <section className="admin-content">
        <nav className="admin-mobile-nav" aria-label="Navegación administrativa">
          <a href="#hikes">HIKES</a>
          <a href="#bookings">RESERVAS</a>
          <a href="#payments">PAGOS</a>
          <Link href="/admin/hike-mode">MODO HIKE</Link>
        </nav>
        <header>
          <div>
            <p>OPERACIÓN · {today}</p>
            <h1>Buenos días, {displayName}.</h1>
          </div>
          <div className="admin-head-actions">
            <Link href="/admin/hikes/nuevo">
              <Plus aria-hidden="true" /> NUEVO HIKE
            </Link>
            <div className="admin-avatar">{initials}</div>
          </div>
        </header>

        {live?.hike ? (
          <section className="admin-next">
            <div className="admin-next-image">
              <img
                src="https://images.unsplash.com/photo-1558788353-f76d92427f16?auto=format&fit=crop&w=1100&q=88"
                alt={live.hike.name}
              />
              <span>PRÓXIMA AVENTURA</span>
            </div>
            <div>
              <p>PRÓXIMO HIKE</p>
              <h2>{live.hike.name}</h2>
              <span>
                {new Intl.DateTimeFormat("es-MX", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "America/Mexico_City",
                }).format(new Date(live.hike.starts_at))}{" "}
                · {live.hike.location_name}
              </span>
              <div className="admin-stats">
                <div>
                  <strong>{expected}</strong>
                  <small>/ {live.hike.capacity} PERSONAS</small>
                </div>
                <div>
                  <strong>{dogs}</strong>
                  <small>PERRITOS</small>
                </div>
                <div>
                  <strong>{transport}</strong>
                  <small>TRANSPORTE</small>
                </div>
                <div>
                  <strong>{live.payments.length}</strong>
                  <small>ALERTAS</small>
                </div>
              </div>
              <Link
                href={`/admin/hike-mode?hike=${live.hike.id}`}
                className="button button-primary"
              >
                <Bolt aria-hidden="true" /> INICIAR MODO HIKE
              </Link>
            </div>
          </section>
        ) : (
          <section className="admin-empty-state">
            <Mountain aria-hidden="true" />
            <div>
              <h2>No hay aventuras próximas</h2>
              <p>Crea un hike para comenzar a recibir reservaciones.</p>
            </div>
            <Link className="button button-primary" href="/admin/hikes/nuevo">
              CREAR HIKE
            </Link>
          </section>
        )}

        <section className="kpi-grid" id="reports">
          <article>
            <span>INGRESOS CONFIRMADOS</span>
            <strong>${(income / 100).toLocaleString("es-MX")}</strong>
            <small>MXN · próximo hike</small>
          </article>
          <article>
            <span>RESERVACIONES</span>
            <strong>{live?.bookings.length ?? 0}</strong>
            <small>{confirmed.length} confirmadas</small>
          </article>
          <article>
            <span>RESPONSIVAS</span>
            <strong>{waiverPercent}%</strong>
            <small>{waiverCount} de {expected} firmadas</small>
          </article>
          <article>
            <span>CHECK-INS</span>
            <strong>{checkIns}</strong>
            <small>{expected ? `${expected - checkIns} por llegar` : "Sin asistentes confirmados"}</small>
          </article>
        </section>

        <section className="admin-panel" id="hikes">
          <div className="admin-section-head">
            <div>
              <p>PROGRAMACIÓN</p>
              <h2>Próximos hikes</h2>
            </div>
            <Link href="/admin/hikes/nuevo">
              <Plus aria-hidden="true" /> NUEVO HIKE
            </Link>
          </div>
          <div className="admin-hike-list">
            {live?.hikes.length ? (
              live.hikes.map((hike) => (
                <article key={hike.id}>
                  <time dateTime={hike.starts_at}>
                    {new Intl.DateTimeFormat("es-MX", {
                      day: "2-digit",
                      month: "short",
                      timeZone: "America/Mexico_City",
                    }).format(new Date(hike.starts_at))}
                  </time>
                  <div>
                    <strong>{hike.name}</strong>
                    <small>{hike.location_name} · {hike.capacity} lugares</small>
                  </div>
                  <span className={hike.published ? "status-live" : ""}>
                    {hike.published ? "PUBLICADO" : "BORRADOR"}
                  </span>
                  <div className="admin-item-actions">
                    <Link href={`/aventuras/${hike.slug}`} aria-label={`Ver ${hike.name}`}>
                      <ExternalLink aria-hidden="true" /> VER
                    </Link>
                    <Link href={`/admin/hikes/${hike.id}/editar`}>
                      <Pencil aria-hidden="true" /> EDITAR
                    </Link>
                    <Link className="admin-operate" href={`/admin/hike-mode?hike=${hike.id}`}>
                      <Bolt aria-hidden="true" /> OPERAR
                    </Link>
                    <HikeDeleteButton hikeId={hike.id} hikeName={hike.name} />
                  </div>
                </article>
              ))
            ) : (
              <p className="admin-empty-copy">No hay hikes próximos.</p>
            )}
          </div>
        </section>

        <section className="admin-lower">
          <div className="admin-table" id="bookings">
            <div className="admin-section-head">
              <div>
                <p>PRÓXIMO HIKE</p>
                <h2>Reservaciones</h2>
              </div>
              <span>{live?.bookings.length ?? 0}</span>
            </div>
            {live?.bookings.length ? (
              live.bookings.map((booking) => (
                <details className="admin-booking" key={booking.id}>
                  <summary className="admin-row">
                    <span>{booking.booking_number}</span>
                    <strong>{nameFromProfile(booking.profile)}</strong>
                    <small>
                      {booking.booking_participants.length} personas ·{" "}
                      {booking.booking_dogs.length} perritos
                    </small>
                    <em className={booking.status === "CONFIRMED" ? "paid" : ""}>
                      {bookingStatus(booking.status)}
                    </em>
                    <ChevronRight aria-hidden="true" />
                  </summary>
                  <div className="admin-booking-detail">
                    <div>
                      <span>PERSONAS</span>
                      {booking.booking_participants.map((participant) => {
                        const snapshot = participant.snapshot as {
                          first_name?: string;
                          last_name?: string;
                        };
                        return (
                          <strong key={participant.id}>
                            {snapshot.first_name} {snapshot.last_name}
                          </strong>
                        );
                      })}
                    </div>
                    <div>
                      <span>PERRITOS</span>
                      {booking.booking_dogs.length ? booking.booking_dogs.map((dog) => {
                        const snapshot = dog.snapshot as { name?: string; breed?: string };
                        return <strong key={dog.id}>{snapshot.name}{snapshot.breed ? ` · ${snapshot.breed}` : ""}</strong>;
                      }) : <strong>Sin perritos</strong>}
                    </div>
                    <div>
                      <span>OPERACIÓN</span>
                      <strong>{booking.transport_reservations.length} transportes</strong>
                      <strong>{booking.signed_waivers.length} responsivas</strong>
                      <strong>{booking.check_ins.length} check-ins</strong>
                    </div>
                  </div>
                </details>
              ))
            ) : (
              <p className="admin-empty-copy">Este hike todavía no tiene reservaciones.</p>
            )}
          </div>
          <div className="alerts-panel" id="payments">
            <div className="admin-section-head">
              <div>
                <p>TRANSFERENCIAS</p>
                <h2>Pagos por revisar</h2>
              </div>
              <span>{live?.payments.length ?? 0}</span>
            </div>
            {live?.payments.length ? (
              live.payments.map((payment) => {
                const order = Array.isArray(payment.order) ? payment.order[0] : payment.order;
                const booking = Array.isArray(order?.booking) ? order.booking[0] : order?.booking;
                return (
                  <article key={payment.id}>
                    <strong>
                      <AlertTriangle aria-hidden="true" /> {nameFromProfile(booking?.profile)}
                    </strong>
                    <p>
                      Transferencia por {(payment.amount_cents / 100).toLocaleString("es-MX", {
                        style: "currency",
                        currency: "MXN",
                      })}.
                    </p>
                    <ApprovePaymentButton paymentId={payment.id} />
                  </article>
                );
              })
            ) : (
              <div className="admin-clear-state">
                <CircleCheck aria-hidden="true" />
                <p>No hay pagos pendientes de revisión.</p>
              </div>
            )}
          </div>
        </section>

        <section className="admin-panel admin-photo-summary" id="photos">
          <div>
            <Camera aria-hidden="true" />
            <div>
              <p>GALERÍAS</p>
              <h2>Fotografías</h2>
              <span>{live?.photoCount ?? 0} fotos cargadas en la plataforma.</span>
            </div>
          </div>
          <Link href="/galeria/sendero-del-duende">
            VER GALERÍA <ExternalLink aria-hidden="true" />
          </Link>
        </section>
      </section>
    </main>
  );
}

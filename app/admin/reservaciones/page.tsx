import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileSignature,
  PackageCheck,
  Search,
  TicketCheck,
} from "lucide-react";
import { requireStaffSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { adminDate, bookingStatus, money, profileName } from "../admin-utils";
import {
  BulkReminderButton,
  ReminderButton,
  ReservationRowMenu,
} from "./reservation-actions";
import { EmailTemplateEditor } from "./email-template-editor";

export const dynamic = "force-dynamic";
type Payment = { status: string; method: string; amount_cents: number };
type Order = {
  id: string;
  status: string;
  payments: Payment[];
  order_items: Array<{
    id: string;
    item_type: string;
    quantity: number;
    order_item_fulfillments:
      | Array<{ status: string }>
      | { status: string }
      | null;
  }>;
};
type Booking = {
  id: string;
  booking_number: string;
  status: string;
  total_cents: number;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  last_reminder_at: string | null;
  current_step: string;
  profile:
    | {
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
      }
    | null
    | Array<{
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
      }>;
  hike:
    | { id: string; name: string; starts_at: string }
    | null
    | Array<{ id: string; name: string; starts_at: string }>;
  booking_participants: Array<{ id: string }>;
  booking_dogs: Array<{ id: string; snapshot: { name?: string } }>;
  transport_reservations: Array<{ id: string }>;
  signed_waivers: Array<{ id: string }>;
  check_ins: Array<{ id: string }>;
  booking_checkin_tokens: Array<{
    id: string;
    used_at: string | null;
    revoked_at: string | null;
  }>;
  orders: Order[] | Order | null;
};
const one = <T,>(value: T | T[] | null | undefined) =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

export default async function ReservationsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    q?: string;
    hike?: string;
    payment?: string;
    status?: string;
    incomplete?: string;
    waiver?: string;
    transport?: string;
    qr?: string;
    checkin?: string;
    products?: string;
    from?: string;
    to?: string;
  }>;
}) {
  await requireStaffSession("/admin/reservaciones");
  const supabase = await createSupabaseServerClient();
  const filters = await searchParams;
  const [
    { data: rawBookings },
    { data: hikes },
    { data: next },
    { data: template },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id,booking_number,status,total_cents,created_at,updated_at,last_activity_at,last_reminder_at,current_step,profile:profiles!bookings_profile_id_fkey(first_name,last_name,email,phone),hike:hikes(id,name,starts_at),booking_participants(id),booking_dogs(id,snapshot),transport_reservations(id),signed_waivers(id),check_ins(id),booking_checkin_tokens(id,used_at,revoked_at),orders(id,status,payments(status,method,amount_cents),order_items(id,item_type,quantity,order_item_fulfillments(status)))",
      )
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("hikes")
      .select("id,name,starts_at")
      .is("deleted_at", null)
      .order("starts_at", { ascending: false })
      .limit(100),
    supabase
      .from("hikes")
      .select("id")
      .gte("starts_at", new Date().toISOString())
      .is("deleted_at", null)
      .order("starts_at")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("email_templates")
      .select("key,subject,heading,body,button_label,active")
      .eq("key", "BOOKING_REMINDER")
      .maybeSingle(),
  ]);
  const bookings = (rawBookings ?? []) as unknown as Booking[];
  const now = new Date().getTime();
  const view = (filters.view ?? "ACTIVE").toUpperCase();
  const term = (filters.q ?? "").trim().toLowerCase();
  const ordersOf = (booking: Booking) =>
    Array.isArray(booking.orders)
      ? booking.orders
      : booking.orders
        ? [booking.orders]
        : [];
  const paymentOf = (booking: Booking) =>
    ordersOf(booking)
      .flatMap((order) => order.payments ?? [])
      .sort(
        (a, b) =>
          ["PAID", "UNDER_REVIEW", "PENDING"].indexOf(a.status) -
          ["PAID", "UNDER_REVIEW", "PENDING"].indexOf(b.status),
      )[0] ?? null;
  const groupOf = (booking: Booking) => {
    const hike = one(booking.hike);
    if (booking.status === "DRAFT") return "DRAFT";
    if (booking.status === "CANCELLED") return "CANCELLED";
    if (
      booking.status === "COMPLETED" ||
      (hike && new Date(hike.starts_at).getTime() < now)
    )
      return "PAST";
    return "ACTIVE";
  };
  const counts = Object.fromEntries(
    ["ACTIVE", "PAST", "DRAFT", "CANCELLED"].map((key) => [
      key,
      bookings.filter((booking) => groupOf(booking) === key).length,
    ]),
  );
  const visible = bookings
    .filter((booking) => {
      const profile = one(booking.profile);
      const hike = one(booking.hike);
      const payment = paymentOf(booking);
      const items = ordersOf(booking).flatMap(
        (order) => order.order_items ?? [],
      );
      const signaturesComplete =
        booking.booking_participants.length > 0 &&
        booking.signed_waivers.length >= booking.booking_participants.length;
      const activeQr = booking.booking_checkin_tokens.some(
        (token) => !token.revoked_at && !token.used_at,
      );
      const usedQr = booking.booking_checkin_tokens.some((token) =>
        Boolean(token.used_at),
      );
      const checkins = booking.check_ins.length;
      const people = booking.booking_participants.length;
      if (groupOf(booking) !== view) return false;
      if (
        term &&
        !`${booking.booking_number} ${profile?.first_name} ${profile?.last_name} ${profile?.email} ${profile?.phone} ${hike?.name} ${booking.booking_dogs.map((dog) => dog.snapshot?.name ?? "").join(" ")}`
          .toLowerCase()
          .includes(term)
      )
        return false;
      if (filters.hike && hike?.id !== filters.hike) return false;
      if (filters.payment && payment?.status !== filters.payment) return false;
      if (filters.status && booking.status !== filters.status) return false;
      if (
        filters.incomplete === "YES" &&
        booking.booking_participants.length > 0 &&
        booking.booking_dogs.length > 0
      )
        return false;
      if (filters.waiver === "COMPLETE" && !signaturesComplete) return false;
      if (filters.waiver === "PENDING" && signaturesComplete) return false;
      if (filters.transport === "YES" && !booking.transport_reservations.length)
        return false;
      if (filters.transport === "NO" && booking.transport_reservations.length)
        return false;
      if (filters.qr === "ACTIVE" && !activeQr) return false;
      if (filters.qr === "USED" && !usedQr) return false;
      if (filters.qr === "NONE" && (activeQr || usedQr)) return false;
      if (filters.checkin === "NONE" && checkins > 0) return false;
      if (
        filters.checkin === "PARTIAL" &&
        (checkins === 0 || checkins >= people)
      )
        return false;
      if (filters.checkin === "COMPLETE" && (people === 0 || checkins < people))
        return false;
      if (
        filters.products === "YES" &&
        !items.some((item) => item.item_type === "PRODUCT")
      )
        return false;
      if (
        filters.products === "NO" &&
        items.some((item) => item.item_type === "PRODUCT")
      )
        return false;
      if (
        filters.from &&
        hike &&
        new Date(hike.starts_at) < new Date(filters.from)
      )
        return false;
      if (
        filters.to &&
        hike &&
        new Date(hike.starts_at) > new Date(`${filters.to}T23:59:59`)
      )
        return false;
      return true;
    })
    .sort((a, b) =>
      view === "DRAFT"
        ? new Date(a.last_activity_at).getTime() -
          new Date(b.last_activity_at).getTime()
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  const pendingPayments = bookings.filter(
    (booking) =>
      ["PENDING_PAYMENT"].includes(booking.status) ||
      ["PENDING", "UNDER_REVIEW"].includes(paymentOf(booking)?.status ?? ""),
  ).length;
  const unsigned = bookings.filter(
    (booking) =>
      groupOf(booking) === "ACTIVE" &&
      booking.signed_waivers.length < booking.booking_participants.length,
  ).length;
  const pendingDeliveries = bookings.reduce(
    (sum, booking) =>
      sum +
      ordersOf(booking)
        .flatMap((order) => order.order_items ?? [])
        .filter(
          (item) =>
            item.item_type === "PRODUCT" &&
            one(item.order_item_fulfillments)?.status !== "DELIVERED",
        ).length,
    0,
  );
  const draftIds = visible
    .filter((booking) => booking.status === "DRAFT")
    .map((booking) => booking.id);
  return (
    <main className="admin-page">
      <AdminNav active="/admin/reservaciones" hikeId={next?.id} />
      <section className="admin-content">
        <AdminMobileNav />
        <header>
          <div>
            <p>CENTRO DE OPERACIONES</p>
            <h1>Reservaciones.</h1>
          </div>
          <BulkReminderButton bookingIds={draftIds} />
        </header>
        <section className="reservation-kpis">
          <article>
            <TicketCheck />
            <span>ACTIVAS</span>
            <strong>{counts.ACTIVE}</strong>
          </article>
          <article className={pendingPayments ? "warn" : ""}>
            <AlertCircle />
            <span>PAGOS PENDIENTES</span>
            <strong>{pendingPayments}</strong>
          </article>
          <article className={unsigned ? "warn" : ""}>
            <FileSignature />
            <span>RESPONSIVAS</span>
            <strong>{unsigned}</strong>
          </article>
          <article>
            <PackageCheck />
            <span>ENTREGAS</span>
            <strong>{pendingDeliveries}</strong>
          </article>
        </section>
        <nav className="reservation-tabs">
          {[
            ["ACTIVE", "ACTIVAS"],
            ["PAST", "PASADAS"],
            ["DRAFT", "BORRADORES"],
            ["CANCELLED", "CANCELADAS"],
          ].map(([key, label]) => (
            <Link
              className={view === key ? "active" : ""}
              href={`/admin/reservaciones?view=${key}`}
              key={key}
            >
              {label}
              <span>{counts[key]}</span>
            </Link>
          ))}
        </nav>
        <form className="reservation-filters">
          <label className="reservation-search">
            <Search />
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Cliente, perrito, correo, teléfono o reservación"
            />
          </label>
          <select name="hike" defaultValue={filters.hike ?? ""}>
            <option value="">Todos los hikes</option>
            {hikes?.map((hike) => (
              <option value={hike.id} key={hike.id}>
                {hike.name}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">Todos los estados</option>
            <option value="DRAFT">Borrador</option>
            <option value="PENDING_PAYMENT">Pago pendiente</option>
            <option value="CONFIRMED">Confirmada</option>
            <option value="COMPLETED">Completada</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
          <select name="payment" defaultValue={filters.payment ?? ""}>
            <option value="">Todos los pagos</option>
            <option value="PAID">Pagado</option>
            <option value="UNDER_REVIEW">Por revisar</option>
            <option value="PENDING">Pendiente</option>
            <option value="FAILED">Fallido</option>
            <option value="REFUNDED">Reembolsado</option>
          </select>
          <select name="waiver" defaultValue={filters.waiver ?? ""}>
            <option value="">Todas las responsivas</option>
            <option value="COMPLETE">Completas</option>
            <option value="PENDING">Pendientes</option>
          </select>
          <select name="checkin" defaultValue={filters.checkin ?? ""}>
            <option value="">Cualquier check-in</option>
            <option value="NONE">Sin check-in</option>
            <option value="PARTIAL">Parcial</option>
            <option value="COMPLETE">Completo</option>
          </select>
          <select name="transport" defaultValue={filters.transport ?? ""}>
            <option value="">Cualquier transporte</option>
            <option value="YES">Con transporte</option>
            <option value="NO">Sin transporte</option>
          </select>
          <select name="products" defaultValue={filters.products ?? ""}>
            <option value="">Cualquier compra</option>
            <option value="YES">Con productos</option>
            <option value="NO">Sin productos</option>
          </select>
          <select name="qr" defaultValue={filters.qr ?? ""}>
            <option value="">Cualquier QR</option>
            <option value="ACTIVE">QR activo</option>
            <option value="USED">QR utilizado</option>
            <option value="NONE">Sin QR</option>
          </select>
          <select name="incomplete" defaultValue={filters.incomplete ?? ""}>
            <option value="">Cualquier integridad</option>
            <option value="YES">Datos incompletos</option>
          </select>
          <input type="date" name="from" defaultValue={filters.from} />
          <input type="date" name="to" defaultValue={filters.to} />
          <input type="hidden" name="view" value={view} />
          <button>FILTRAR</button>
        </form>
        {template && <EmailTemplateEditor template={template} />}
        <section className="reservation-table">
          <div className="reservation-table-head">
            <span>CLIENTE / RESERVACIÓN</span>
            <span>HIKE</span>
            <span>MANADA</span>
            <span>PAGO</span>
            <span>OPERACIÓN</span>
            <span />
          </div>
          {visible.map((booking) => {
            const profile = one(booking.profile);
            const hike = one(booking.hike);
            const payment = paymentOf(booking);
            const items = ordersOf(booking).flatMap(
              (order) => order.order_items ?? [],
            );
            const delivered = items.filter(
              (item) =>
                item.item_type === "PRODUCT" &&
                one(item.order_item_fulfillments)?.status === "DELIVERED",
            ).length;
            const products = items.filter(
              (item) => item.item_type === "PRODUCT",
            ).length;
            return (
              <article key={booking.id}>
                <Link
                  className="admin-card-hit"
                  href={`/admin/reservaciones/${booking.id}`}
                  aria-label={`Abrir ${booking.booking_number}`}
                />
                <div>
                  <small>{booking.booking_number}</small>
                  <strong>{profileName(booking.profile)}</strong>
                  <span>
                    {profile?.email ?? profile?.phone ?? "Sin contacto"}
                  </span>
                  <em
                    className={
                      booking.status === "CONFIRMED"
                        ? "paid"
                        : booking.status === "CANCELLED"
                          ? "cancelled"
                          : ""
                    }
                  >
                    {bookingStatus(booking.status)}
                  </em>
                  {booking.status === "DRAFT" && (
                    <>
                      <small>
                        Paso: {booking.current_step} · actividad{" "}
                        {adminDate(booking.last_activity_at)}
                      </small>
                      <small>
                        Personas{" "}
                        {booking.booking_participants.length
                          ? "LISTO"
                          : "FALTA"}{" "}
                        · Perritos{" "}
                        {booking.booking_dogs.length ? "LISTO" : "FALTA"} ·
                        Responsivas{" "}
                        {booking.signed_waivers.length >=
                          booking.booking_participants.length &&
                        booking.booking_participants.length
                          ? "LISTO"
                          : "FALTA"}
                      </small>
                      {booking.last_reminder_at && (
                        <small>
                          Último recordatorio:{" "}
                          {adminDate(booking.last_reminder_at)}
                        </small>
                      )}
                    </>
                  )}
                </div>
                <div>
                  <strong>{hike?.name ?? "Hike"}</strong>
                  <span>{hike ? adminDate(hike.starts_at) : "Sin fecha"}</span>
                </div>
                <div>
                  <strong>
                    {booking.booking_participants.length} personas
                  </strong>
                  <span>
                    {booking.booking_dogs
                      .map((dog) => dog.snapshot?.name)
                      .filter(Boolean)
                      .join(", ") ||
                      `${booking.booking_dogs.length} perritos`}{" "}
                    · {booking.transport_reservations.length} transportes
                  </span>
                </div>
                <div>
                  <strong>
                    {money(payment?.amount_cents ?? booking.total_cents)}
                  </strong>
                  <span>
                    {payment?.method ?? "Sin método"} ·{" "}
                    {payment?.status ?? "SIN PAGO"}
                  </span>
                </div>
                <div>
                  <span>
                    {booking.signed_waivers.length}/
                    {booking.booking_participants.length} firmas
                  </span>
                  <span>{booking.check_ins.length} check-ins</span>
                  {products > 0 && (
                    <span>
                      {delivered}/{products} entregas
                    </span>
                  )}
                </div>
                <div className="reservation-row-actions">
                  {booking.status === "DRAFT" && (
                    <ReminderButton bookingId={booking.id} />
                  )}
                  <ReservationRowMenu
                    bookingId={booking.id}
                    hikeId={hike?.id}
                    status={booking.status}
                  />
                  <Link
                    href={`/admin/reservaciones/${booking.id}`}
                    aria-label={`Abrir ${booking.booking_number}`}
                  >
                    <ChevronRight />
                  </Link>
                </div>
              </article>
            );
          })}
          {!visible.length && (
            <div className="reservation-empty">
              <CheckCircle2 />
              <strong>No hay reservaciones en esta vista.</strong>
              <span>Prueba otro filtro o rango de fechas.</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

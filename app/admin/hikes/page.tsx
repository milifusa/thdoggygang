import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  CircleDollarSign,
  Dog,
  Search,
  TicketCheck,
  Users,
} from "lucide-react";
import { requireStaffSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { hikeCoverUrl } from "../../lib/data";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { adminDate, money } from "../admin-utils";
import { HikeQuickActions } from "./hike-quick-actions";

export const dynamic = "force-dynamic";
type HikeRow = {
  id: string;
  name: string;
  slug: string;
  starts_at: string;
  location_name: string;
  capacity: number;
  max_dogs: number | null;
  published: boolean;
  cancelled_at: string | null;
  cover_path: string | null;
  bookings: Array<{
    id: string;
    status: string;
    booking_participants: Array<{ id: string }>;
    booking_dogs: Array<{ id: string }>;
    transport_reservations: Array<{ id: string }>;
    signed_waivers: Array<{ id: string }>;
    check_ins: Array<{ id: string }>;
  }>;
  transport_configurations:
    | Array<{ mode: string; capacity: number | null }>
    | { mode: string; capacity: number | null }
    | null;
  hike_galleries:
    | Array<{
        id: string;
        published_at: string | null;
        photos: Array<{ id: string }>;
      }>
    | { id: string; published_at: string | null; photos: Array<{ id: string }> }
    | null;
};
type PaymentRow = {
  status: string;
  amount_cents: number;
  order:
    | {
        booking: { hike_id: string } | Array<{ hike_id: string }> | null;
        order_items: Array<{
          item_type: string;
          reference_id: string | null;
          quantity: number;
          unit_price_cents: number;
        }>;
      }
    | Array<{
        booking: { hike_id: string } | Array<{ hike_id: string }> | null;
        order_items: Array<{
          item_type: string;
          reference_id: string | null;
          quantity: number;
          unit_price_cents: number;
        }>;
      }>
    | null;
};
const activeStatuses = ["PENDING_PAYMENT", "CONFIRMED"];
export default async function HikesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const session = await requireStaffSession("/admin/hikes", true);
  const isAdmin = session.mode !== "live" || session.profile.role === "ADMIN";
  const supabase = await createSupabaseServerClient();
  const query = await searchParams;
  const [{ data: hikeData }, { data: paymentData }] = await Promise.all([
    supabase
      .from("hikes")
      .select(
        "id,name,slug,starts_at,location_name,capacity,max_dogs,published,cancelled_at,cover_path,bookings(id,status,booking_participants(id),booking_dogs(id),transport_reservations(id),signed_waivers(id),check_ins(id)),transport_configurations(mode,capacity),hike_galleries(id,published_at,photos:photos!photos_gallery_id_fkey(id))",
      )
      .is("deleted_at", null)
      .order("starts_at"),
    supabase
      .from("payments")
      .select(
        "status,amount_cents,order:orders(booking:bookings(hike_id),order_items(item_type,reference_id,quantity,unit_price_cents))",
      )
      .order("created_at", { ascending: false }),
  ]);
  const hikes = (hikeData ?? []) as unknown as HikeRow[];
  const payments = (paymentData ?? []) as unknown as PaymentRow[];
  const galleryOf = (hike: HikeRow) =>
    Array.isArray(hike.hike_galleries)
      ? hike.hike_galleries[0]
      : hike.hike_galleries;
  const transportOf = (hike: HikeRow) =>
    Array.isArray(hike.transport_configurations)
      ? hike.transport_configurations[0]
      : hike.transport_configurations;
  const photoHike = new Map<string, string>();
  hikes.forEach((hike) =>
    galleryOf(hike)?.photos?.forEach((photo) =>
      photoHike.set(photo.id, hike.id),
    ),
  );
  const metrics = new Map(
    hikes.map((h) => {
      const active = h.bookings.filter((b) =>
        activeStatuses.includes(b.status),
      );
      const confirmedPeople = active.reduce(
        (sum, b) => sum + b.booking_participants.length,
        0,
      );
      const dogs = active.reduce((sum, b) => sum + b.booking_dogs.length, 0);
      const transport = active.reduce(
        (sum, b) => sum + b.transport_reservations.length,
        0,
      );
      const waivers = active.reduce(
        (sum, b) => sum + b.signed_waivers.length,
        0,
      );
      const checkins = active.reduce((sum, b) => sum + b.check_ins.length, 0);
      let paid = 0,
        pending = 0,
        photoRevenue = 0;
      payments.forEach((payment) => {
        const order = Array.isArray(payment.order)
          ? payment.order[0]
          : payment.order;
        const booking = Array.isArray(order?.booking)
          ? order?.booking[0]
          : order?.booking;
        const items = order?.order_items ?? [];
        const belongs =
          booking?.hike_id === h.id ||
          items.some(
            (item) =>
              item.reference_id && photoHike.get(item.reference_id) === h.id,
          );
        if (!belongs) return;
        if (payment.status === "PAID") {
          paid += payment.amount_cents;
          photoRevenue += items
            .filter(
              (i) =>
                i.item_type.startsWith("PHOTO") &&
                i.reference_id &&
                photoHike.get(i.reference_id) === h.id,
            )
            .reduce((sum, i) => sum + i.unit_price_cents * i.quantity, 0);
        } else if (["PENDING", "UNDER_REVIEW"].includes(payment.status))
          pending += payment.amount_cents;
      });
      return [
        h.id,
        {
          active,
          confirmedPeople,
          dogs,
          transport,
          waivers,
          checkins,
          paid,
          pending,
          photoRevenue,
          available: Math.max(0, h.capacity - confirmedPeople),
        },
      ];
    }),
  );
  const now = new Date().getTime();
  const filter = (query.filter ?? "ALL").toUpperCase();
  const term = (query.q ?? "").trim().toLowerCase();
  const match = (h: HikeRow) => {
    const m = metrics.get(h.id)!;
    if (term && !`${h.name} ${h.location_name}`.toLowerCase().includes(term))
      return false;
    if (filter === "UPCOMING")
      return new Date(h.starts_at).getTime() >= now && !h.cancelled_at;
    if (filter === "PAST")
      return new Date(h.starts_at).getTime() < now && !h.cancelled_at;
    if (filter === "DRAFT") return !h.published && !h.cancelled_at;
    if (filter === "CANCELLED") return Boolean(h.cancelled_at);
    if (filter === "SOLDOUT") return m.available === 0;
    return true;
  };
  const visible = hikes.filter(match);
  const upcoming = visible
    .filter(
      (h) =>
        new Date(h.starts_at).getTime() >= now &&
        !h.cancelled_at &&
        h.published,
    )
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  const past = visible
    .filter((h) => new Date(h.starts_at).getTime() < now && !h.cancelled_at)
    .sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));
  const drafts = visible.filter(
    (h) =>
      !h.published && !h.cancelled_at && new Date(h.starts_at).getTime() >= now,
  );
  const cancelled = visible.filter((h) => h.cancelled_at);
  const futurePeople = hikes
    .filter((h) => new Date(h.starts_at).getTime() >= now && !h.cancelled_at)
    .reduce((sum, h) => sum + metrics.get(h.id)!.confirmedPeople, 0);
  const futureRevenue = hikes
    .filter((h) => new Date(h.starts_at).getTime() >= now)
    .reduce((sum, h) => sum + metrics.get(h.id)!.paid, 0);
  const review = payments.filter((p) => p.status === "UNDER_REVIEW").length;
  const group = (title: string, items: HikeRow[], pastMode = false) =>
    items.length ? (
      <section className="hike-ops-group">
        <div>
          <p>{title}</p>
          <span>{items.length}</span>
        </div>
        <div>
          {items.map((h) => {
            const m = metrics.get(h.id)!;
            const transport = transportOf(h);
            const gallery = galleryOf(h);
            const photos = gallery?.photos?.length ?? 0;
            const availability =
              m.available === 0
                ? "COMPLETO"
                : m.available / h.capacity <= 0.2
                  ? `ÚLTIMOS ${m.available}`
                  : "DISPONIBLE";
            return (
              <article className="hike-ops-card" key={h.id}>
                <img src={hikeCoverUrl(h.id, h.cover_path)} alt={h.name} />
                <div className="hike-ops-main">
                  <span>
                    {adminDate(h.starts_at)} · {h.location_name}
                  </span>
                  <h2>{h.name}</h2>
                  <em
                    className={
                      h.cancelled_at
                        ? "cancelled"
                        : h.published
                          ? "live"
                          : "draft"
                    }
                  >
                    {h.cancelled_at
                      ? "CANCELADO"
                      : h.published
                        ? "PUBLICADO"
                        : "BORRADOR"}
                  </em>
                  <b
                    className={
                      availability === "DISPONIBLE"
                        ? "available"
                        : availability === "COMPLETO"
                          ? "full"
                          : "last"
                    }
                  >
                    {availability}
                  </b>
                </div>
                <div className="hike-ops-stats">
                  <span>
                    <Users />
                    <b>
                      {m.confirmedPeople} / {h.capacity}
                    </b>
                    <small>
                      {m.active.length} reservaciones · {m.available} libres
                    </small>
                  </span>
                  <span>
                    <Dog />
                    <b>{m.dogs}</b>
                    <small>perritos registrados</small>
                  </span>
                  <span>
                    <TicketCheck />
                    <b>
                      {transport?.mode === "NONE"
                        ? "No aplica"
                        : `${m.transport} / ${transport?.capacity ?? "—"}`}
                    </b>
                    <small>transporte</small>
                  </span>
                  <span>
                    <CircleDollarSign />
                    <b>{money(m.paid)}</b>
                    <small>{money(m.pending)} pendientes</small>
                  </span>
                  <span>
                    <Camera />
                    <b>{photos}</b>
                    <small>
                      {m.photoRevenue
                        ? `${money(m.photoRevenue)} en ventas`
                        : gallery?.published_at
                          ? "galería publicada"
                          : "galería pendiente"}
                    </small>
                  </span>
                  {!pastMode && (
                    <span>
                      <AlertTriangle />
                      <b>{Math.max(0, m.confirmedPeople - m.waivers)}</b>
                      <small>responsivas pendientes</small>
                    </span>
                  )}
                </div>
                <div className="hike-ops-actions">
                  {isAdmin ? (
                    <HikeQuickActions
                      id={h.id}
                      past={pastMode}
                      published={h.published}
                      cancelled={Boolean(h.cancelled_at)}
                    />
                  ) : (
                    <>
                      <Link
                        className="button button-primary"
                        href={`/admin/hikes/${h.id}`}
                      >
                        {pastMode ? "VER RESULTADOS" : "ADMINISTRAR"}
                      </Link>
                      <Link href={`/admin/hike-mode?hike=${h.id}`}>
                        MODO HIKE
                      </Link>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    ) : null;
  return (
    <main className="admin-page">
      <AdminNav active="/admin/hikes" hikeId={upcoming[0]?.id} />
      <section className="admin-content">
        <AdminMobileNav />
        <header>
          <div>
            <p>CENTRO DE OPERACIONES</p>
            <h1>Hikes.</h1>
          </div>
          <div className="admin-head-actions">
            <Link href="/admin/hikes/nuevo">NUEVO HIKE</Link>
          </div>
        </header>
        <section className="kpi-grid admin-kpi-first hike-kpis">
          <article>
            <span>PRÓXIMOS</span>
            <strong>
              {
                hikes.filter(
                  (h) => +new Date(h.starts_at) >= now && !h.cancelled_at,
                ).length
              }
            </strong>
            <small>hikes</small>
          </article>
          <article>
            <span>PERSONAS FUTURAS</span>
            <strong>{futurePeople}</strong>
            <small>lugares ocupados</small>
          </article>
          <article>
            <span>RECAUDADO PRÓXIMOS</span>
            <strong>{money(futureRevenue)}</strong>
            <small>pagos confirmados</small>
          </article>
          <article>
            <span>POR REVISAR</span>
            <strong>{review}</strong>
            <small>pagos</small>
          </article>
        </section>
        <form className="hike-ops-filters">
          <label>
            <Search />
            <input
              name="q"
              defaultValue={query.q ?? ""}
              placeholder="Buscar por nombre o lugar"
            />
          </label>
          <div>
            {[
              ["ALL", "TODOS"],
              ["UPCOMING", "PRÓXIMOS"],
              ["PAST", "PASADOS"],
              ["DRAFT", "BORRADORES"],
              ["CANCELLED", "CANCELADOS"],
              ["SOLDOUT", "SOLD OUT"],
            ].map(([value, label]) => (
              <Link
                className={filter === value ? "active" : ""}
                href={`/admin/hikes?filter=${value}${query.q ? `&q=${encodeURIComponent(query.q)}` : ""}`}
                key={value}
              >
                {label}
              </Link>
            ))}
          </div>
          <button>BUSCAR</button>
        </form>
        {group("PRÓXIMAS AVENTURAS", upcoming)}
        {group("AVENTURAS PASADAS", past, true)}
        {group("BORRADORES", drafts)}
        {group("CANCELADOS", cancelled)}
        {!visible.length && (
          <section className="admin-empty-state">
            <p>No encontramos hikes con esos filtros.</p>
          </section>
        )}
      </section>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  BusFront,
  CheckCircle2,
  Dog,
  Download,
  Hourglass,
  Settings,
  Star,
} from "lucide-react";
import { requireStaffSession } from "../../../lib/auth/guards";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { hikeCoverUrl } from "../../../lib/data";
import { AdminMobileNav, AdminNav } from "../../admin-nav";
import {
  adminDate,
  bookingStatus,
  money,
  profileName,
} from "../../admin-utils";
import { PhotoManager, type AdminPhoto } from "../../fotos/photo-manager";

export const dynamic = "force-dynamic";
const tabs = [
  "resumen",
  "inscripciones",
  "perritos",
  "transporte",
  "responsivas",
  "pagos",
  "fotos",
  "check-in",
  "lista-espera",
  "reseñas",
  "configuracion",
] as const;
type Tab = (typeof tabs)[number];
type Booking = {
  id: string;
  booking_number: string;
  status: string;
  total_cents: number;
  profile:
    | {
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
      }
    | Array<{
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
      }>;
  booking_participants: Array<{
    id: string;
    snapshot: Record<string, unknown>;
  }>;
  booking_dogs: Array<{ id: string; snapshot: Record<string, unknown> }>;
  transport_reservations: Array<{ id: string }>;
  signed_waivers: Array<{ id: string; signed_at: string }>;
  check_ins: Array<{ id: string; booking_participant_id: string }>;
};
type Payment = {
  id: string;
  status: string;
  method: string;
  amount_cents: number;
  created_at: string;
  order:
    | {
        booking_id: string | null;
        order_items: Array<{
          item_type: string;
          reference_id: string | null;
          description: string;
          quantity: number;
          unit_price_cents: number;
        }>;
      }
    | Array<{
        booking_id: string | null;
        order_items: Array<{
          item_type: string;
          reference_id: string | null;
          description: string;
          quantity: number;
          unit_price_cents: number;
        }>;
      }>;
};
export default async function HikeAdminDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const session = await requireStaffSession(`/admin/hikes/${id}`, true);
  const tabValue = (await searchParams).tab;
  const tab = (tabs.includes(tabValue as Tab) ? tabValue : "resumen") as Tab;
  const supabase = await createSupabaseServerClient();
  const isAdmin = session.mode !== "live" || session.profile.role === "ADMIN";
  if (!isAdmin && session.mode === "live") {
    const { data: assignment } = await supabase
      .from("guide_hikes")
      .select("hike_id")
      .eq("hike_id", id)
      .eq("profile_id", session.profile.id)
      .maybeSingle();
    if (!assignment) notFound();
  }
  const [
    { data: hike },
    { data: bookingData },
    { data: gallery },
    { data: allPayments },
    { data: waitlist },
    { data: reviews },
  ] = await Promise.all([
    supabase
      .from("hikes")
      .select(
        "id,name,slug,starts_at,location_name,capacity,max_dogs,cover_path,published,cancelled_at,transport_configurations(mode,capacity,price_cents,departure_place,departure_at,return_details,rules)",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("bookings")
      .select(
        "id,booking_number,status,total_cents,profile:profiles(first_name,last_name,email,phone),booking_participants(id,snapshot),booking_dogs(id,snapshot),transport_reservations(id),signed_waivers(id,signed_at),check_ins(id,booking_participant_id)",
      )
      .eq("hike_id", id)
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false }),
    supabase
      .from("hike_galleries")
      .select(
        "id,title,published_at,default_photo_price_cents,package_5_price_cents,package_10_price_cents,full_gallery_price_cents,cover_photo_id,photos:photos!photos_gallery_id_fkey(id,title,caption,access,price_cents,thumbnail_path,preview_path,watermarked_path,processing_status,hidden)",
      )
      .eq("hike_id", id)
      .maybeSingle(),
    supabase
      .from("payments")
      .select(
        "id,status,method,amount_cents,created_at,order:orders(booking_id,order_items(item_type,reference_id,description,quantity,unit_price_cents))",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("waitlist_entries")
      .select("id,status,people_count,dog_count,created_at,offer_expires_at,profile:profiles(first_name,last_name,email,phone)")
      .eq("hike_id", id)
      .order("created_at"),
    supabase
      .from("hike_reviews")
      .select("id,route_rating,guide_rating,transport_rating,body,published,created_at,profile:profiles(first_name,last_name,email)")
      .eq("hike_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!hike) notFound();
  const bookings = (bookingData ?? []) as unknown as Booking[];
  const active = bookings.filter((b) =>
    ["PENDING_PAYMENT", "CONFIRMED"].includes(b.status),
  );
  const people = active.reduce(
    (sum, b) => sum + b.booking_participants.length,
    0,
  );
  const dogs = active.reduce((sum, b) => sum + b.booking_dogs.length, 0);
  const transport = active.reduce(
    (sum, b) => sum + b.transport_reservations.length,
    0,
  );
  const waivers = active.reduce((sum, b) => sum + b.signed_waivers.length, 0);
  const checkins = active.reduce((sum, b) => sum + b.check_ins.length, 0);
  const photoIds = new Set((gallery?.photos ?? []).map((p) => p.id));
  const bookingIds = new Set(bookings.map((b) => b.id));
  const payments = ((allPayments ?? []) as unknown as Payment[]).filter(
    (payment) => {
      const order = Array.isArray(payment.order)
        ? payment.order[0]
        : payment.order;
      return Boolean(
        order &&
          ((order.booking_id && bookingIds.has(order.booking_id)) ||
            order.order_items.some(
              (i) => i.reference_id && photoIds.has(i.reference_id),
            )),
      );
    },
  );
  let hikeRevenue = 0,
    transportRevenue = 0,
    photoRevenue = 0,
    refunded = 0,
    pending = 0;
  payments.forEach((payment) => {
    const order = Array.isArray(payment.order)
      ? payment.order[0]
      : payment.order;
    if (payment.status === "REFUNDED") {
      refunded += payment.amount_cents;
      return;
    }
    if (["PENDING", "UNDER_REVIEW"].includes(payment.status)) {
      pending += payment.amount_cents;
      return;
    }
    if (payment.status !== "PAID" || !order) return;
    order.order_items.forEach((i) => {
      const amount = i.quantity * i.unit_price_cents;
      if (i.item_type === "TRANSPORT") transportRevenue += amount;
      else if (i.item_type.startsWith("PHOTO")) photoRevenue += amount;
      else if (i.item_type === "HIKE") hikeRevenue += amount;
    });
  });
  const available = Math.max(0, hike.capacity - people);
  const trans = Array.isArray(hike.transport_configurations)
    ? hike.transport_configurations[0]
    : hike.transport_configurations;
  const photos: AdminPhoto[] = await Promise.all(
    (gallery?.photos ?? []).map(async (photo) => {
      const bucket =
        photo.access === "PAID" ? "hike-watermarked" : "hike-previews";
      const path =
        photo.access === "PAID" ? photo.watermarked_path : photo.thumbnail_path;
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 3600);
      return {
        id: photo.id,
        title: photo.title,
        caption: photo.caption,
        access: photo.access,
        price_cents: photo.price_cents,
        url: data?.signedUrl ?? "",
      };
    }),
  );
  const visibleTabs = isAdmin
    ? tabs
    : tabs.filter(
        (name) => !["pagos", "fotos", "configuracion"].includes(name),
      );
  const nav = (
    <nav className="hike-detail-tabs">
      {visibleTabs.map((name) => (
        <Link
          className={tab === name ? "active" : ""}
          href={`/admin/hikes/${id}?tab=${name}`}
          key={name}
        >
          {name.replace("configuracion", "configuración").toUpperCase()}
        </Link>
      ))}
    </nav>
  );
  return (
    <main className="admin-page">
      <AdminNav active="/admin/hikes" hikeId={id} />
      <section className="admin-content">
        <AdminMobileNav />
        <header className="hike-detail-header">
          <img src={hikeCoverUrl(hike.id, hike.cover_path)} alt={hike.name} />
          <div>
            <p>
              {adminDate(hike.starts_at)} · {hike.location_name}
            </p>
            <h1>{hike.name}</h1>
            <span>
              {hike.cancelled_at
                ? "CANCELADO"
                : hike.published
                  ? "PUBLICADO"
                  : "BORRADOR"}
            </span>
          </div>
          {isAdmin && (
            <Link href={`/admin/hikes/${id}/editar`}>EDITAR HIKE</Link>
          )}
        </header>
        {nav}
        {tab === "resumen" && (
          <>
            <section className="kpi-grid admin-kpi-first hike-detail-kpis">
              <article>
                <span>PERSONAS</span>
                <strong>{people}</strong>
                <small>{available} lugares libres</small>
              </article>
              <article>
                <span>PERRITOS</span>
                <strong>{dogs}</strong>
                <small>de {hike.max_dogs ?? "—"}</small>
              </article>
              <article>
                <span>TRANSPORTE</span>
                <strong>{transport}</strong>
                <small>de {trans?.capacity ?? "—"}</small>
              </article>
              <article>
                <span>RECAUDADO</span>
                <strong>
                  {money(hikeRevenue + transportRevenue + photoRevenue)}
                </strong>
                <small>{money(pending)} pendiente</small>
              </article>
            </section>
            <section className="hike-summary-grid">
              <div className="admin-panel">
                <h2>Requiere atención</h2>
                <p>
                  <AlertTriangle /> {Math.max(0, people - waivers)} responsivas
                  pendientes
                </p>
                <p>
                  <AlertTriangle />{" "}
                  {
                    payments.filter((p) =>
                      ["PENDING", "UNDER_REVIEW"].includes(p.status),
                    ).length
                  }{" "}
                  pagos pendientes
                </p>
                <p>
                  <Dog />{" "}
                  {
                    active
                      .flatMap((b) => b.booking_dogs)
                      .filter((d) =>
                        Boolean(
                          d.snapshot.reactivity ||
                            d.snapshot.medical_conditions,
                        ),
                      ).length
                  }{" "}
                  perritos con alertas
                </p>
                <p>
                  <Hourglass />{" "}
                  {(waitlist ?? []).filter((entry) => entry.status === "WAITING").length}{" "}
                  registros en lista de espera
                </p>
              </div>
              <div className="admin-panel">
                <h2>Finanzas</h2>
                <dl>
                  <div>
                    <dt>Hike</dt>
                    <dd>{money(hikeRevenue)}</dd>
                  </div>
                  <div>
                    <dt>Transporte</dt>
                    <dd>{money(transportRevenue)}</dd>
                  </div>
                  <div>
                    <dt>Fotografías</dt>
                    <dd>{money(photoRevenue)}</dd>
                  </div>
                  <div>
                    <dt>Reembolsado</dt>
                    <dd>{money(refunded)}</dd>
                  </div>
                  <div>
                    <dt>Total generado</dt>
                    <dd>
                      {money(hikeRevenue + transportRevenue + photoRevenue)}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="admin-panel hike-quick-actions">
                <h2>Acciones rápidas</h2>
                <Link href={`/admin/hike-mode?hike=${id}`}>
                  INICIAR MODO HIKE
                </Link>
                <Link href={`/admin/hikes/${id}?tab=fotos`}>
                  GESTIONAR FOTOS
                </Link>
                <Link href={`/admin/hikes/${id}?tab=inscripciones`}>
                  VER PARTICIPANTES
                </Link>
              </div>
            </section>
          </>
        )}
        {tab === "inscripciones" && (
          <section className="admin-panel hike-detail-list">
            <h2>Inscripciones</h2>
            {bookings.map((b) => (
              <article key={b.id}>
                <div>
                  <span>{b.booking_number}</span>
                  <strong>{profileName(b.profile)}</strong>
                  <small>
                    {b.booking_participants.length} personas ·{" "}
                    {b.booking_dogs.length} perritos
                  </small>
                </div>
                <b>{money(b.total_cents)}</b>
                <em>{bookingStatus(b.status)}</em>
              </article>
            ))}
          </section>
        )}
        {tab === "perritos" && (
          <section className="admin-panel hike-dog-list">
            <h2>Perritos registrados</h2>
            {active
              .flatMap((b) => b.booking_dogs.map((d) => ({ d, b })))
              .map(({ d, b }) => (
                <article key={d.id}>
                  <Dog />
                  <div>
                    <strong>{String(d.snapshot.name ?? "Perrito")}</strong>
                    <span>
                      {String(d.snapshot.breed ?? "Sin raza registrada")} ·{" "}
                      {String(d.snapshot.size ?? "Tamaño sin registrar")}
                    </span>
                    <small>
                      {d.snapshot.reactivity
                        ? `Reactividad: ${String(d.snapshot.reactivity)}`
                        : "Sin alerta de reactividad"}
                    </small>
                  </div>
                  <b>{b.booking_number}</b>
                </article>
              ))}
          </section>
        )}
        {tab === "transporte" && (
          <section className="admin-panel transport-detail">
            <BusFront />
            <div>
              <p>CONFIGURACIÓN DE TRANSPORTE</p>
              <h2>
                {trans?.mode === "NONE" || !trans
                  ? "Este hike no ofrece transporte"
                  : `${transport} de ${trans.capacity ?? "—"} lugares ocupados`}
              </h2>
              <p>
                {trans?.departure_place ?? "Lugar de salida por definir"}
                {trans?.departure_at
                  ? ` · ${adminDate(trans.departure_at)}`
                  : ""}
              </p>
              <p>{trans?.return_details}</p>
              <small>{trans?.rules}</small>
              <Link href={`/admin/hikes/${id}/editar`}>EDITAR TRANSPORTE</Link>
            </div>
          </section>
        )}
        {tab === "responsivas" && (
          <section className="admin-panel hike-detail-list">
            <h2>Responsivas</h2>
            {active
              .flatMap((b) => b.signed_waivers.map((w) => ({ w, b })))
              .map(({ w, b }) => (
                <article key={w.id}>
                  <div>
                    <span>{b.booking_number}</span>
                    <strong>{profileName(b.profile)}</strong>
                    <small>Firmada {adminDate(w.signed_at)}</small>
                  </div>
                  <Link
                    className="admin-waiver-download"
                    href={`/api/admin/waivers/${w.id}/download`}
                  >
                    <Download /> DESCARGAR PDF
                  </Link>
                </article>
              ))}
            {waivers === 0 && <p>No hay responsivas firmadas todavía.</p>}
          </section>
        )}
        {tab === "pagos" && (
          <section className="admin-panel hike-detail-list">
            <h2>Pagos de esta aventura</h2>
            {payments.map((p) => {
              const order = Array.isArray(p.order) ? p.order[0] : p.order;
              return (
                <article key={p.id}>
                  <div>
                    <span>{adminDate(p.created_at)}</span>
                    <strong>
                      {order?.order_items
                        .map((i) => i.description)
                        .join(", ") || "Pago"}
                    </strong>
                    <small>{p.method}</small>
                  </div>
                  <b>{money(p.amount_cents)}</b>
                  <em>{p.status}</em>
                </article>
              );
            })}
          </section>
        )}
        {tab === "fotos" && (
          <section className="admin-panel admin-module-panel">
            <div className="admin-section-head">
              <div>
                <p>
                  GALERÍA · {gallery?.published_at ? "PUBLICADA" : "BORRADOR"}
                </p>
                <h2>{photos.length} fotografías</h2>
              </div>
              <Link href={`/galeria/${hike.slug}`}>VER GALERÍA</Link>
            </div>
            {isAdmin ? (
              <PhotoManager
                hikeId={id}
                photos={photos}
                gallery={{
                  published: Boolean(gallery?.published_at),
                  defaultPriceCents: gallery?.default_photo_price_cents ?? 9000,
                  package5Cents: gallery?.package_5_price_cents ?? null,
                  package10Cents: gallery?.package_10_price_cents ?? null,
                  fullGalleryCents: gallery?.full_gallery_price_cents ?? null,
                  coverPhotoId: gallery?.cover_photo_id ?? null,
                }}
              />
            ) : (
              <p>La galería sólo puede ser modificada por un administrador.</p>
            )}
          </section>
        )}
        {tab === "check-in" && (
          <section className="admin-panel checkin-results">
            <CheckCircle2 />
            <div>
              <p>ASISTENCIA</p>
              <h2>
                {checkins} de {people} check-ins
              </h2>
              <strong>
                {people ? Math.round((checkins / people) * 100) : 0}% de
                asistencia
              </strong>
              <p>{Math.max(0, people - checkins)} personas sin check-in.</p>
              <Link
                className="button button-primary"
                href={`/admin/hike-mode?hike=${id}`}
              >
                INICIAR MODO HIKE
              </Link>
            </div>
          </section>
        )}
        {tab === "lista-espera" && (
          <section className="admin-panel hike-detail-list">
            <h2>Lista de espera</h2>
            {(waitlist ?? []).map((entry) => (
              <article key={entry.id}>
                <div>
                  <span>{adminDate(entry.created_at)}</span>
                  <strong>{profileName(entry.profile)}</strong>
                  <small>{entry.people_count} personas · {entry.dog_count} perritos</small>
                </div>
                <b>{entry.status === "OFFERED" ? "OFERTA 24 H" : entry.status}</b>
                <em>{entry.offer_expires_at ? `Vence ${adminDate(entry.offer_expires_at)}` : "ORDEN DE LLEGADA"}</em>
              </article>
            ))}
            {!waitlist?.length && <p>No hay personas en lista de espera.</p>}
          </section>
        )}
        {tab === "reseñas" && (
          <section className="admin-panel hike-detail-list admin-review-list">
            <h2>Reseñas verificadas</h2>
            {(reviews ?? []).map((review) => (
              <article key={review.id}>
                <Star />
                <div>
                  <span>{adminDate(review.created_at)}</span>
                  <strong>{profileName(review.profile)}</strong>
                  <small>{review.body || "Sin comentario escrito"}</small>
                </div>
                <b>RUTA {review.route_rating}/5 · GUÍAS {review.guide_rating}/5</b>
                <em>{review.published ? "PUBLICADA" : "OCULTA"}</em>
              </article>
            ))}
            {!reviews?.length && <p>Las reseñas aparecerán después de la aventura.</p>}
          </section>
        )}
        {tab === "configuracion" && isAdmin && (
          <section className="admin-panel transport-detail">
            <Settings />
            <div>
              <p>CONFIGURACIÓN</p>
              <h2>Contenido, precios, cupos y políticas</h2>
              <p>
                La edición centralizada mantiene el landing, el flujo de compra
                y la operación sincronizados.
              </p>
              <Link
                className="button button-primary"
                href={`/admin/hikes/${id}/editar`}
              >
                EDITAR HIKE
              </Link>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

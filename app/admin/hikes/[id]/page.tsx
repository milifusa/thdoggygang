import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  BusFront,
  CheckCircle2,
  Dog,
  Download,
  Hourglass,
  ImageIcon,
  PackageCheck,
  Settings,
  Star,
} from "lucide-react";
import { requireStaffSession } from "../../../lib/auth/guards";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { hikeCoverUrl } from "../../../lib/data";
import {
  dateInMexico,
  snapshotIsFreeChildForDate,
} from "../../../lib/person-age";
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
  "productos",
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
  booking_dogs: Array<{
    id: string;
    dog_id: string | null;
    snapshot: Record<string, unknown>;
  }>;
  transport_reservations: Array<{
    id: string;
    booking_participant_id: string;
    dog_ids: string[];
  }>;
  signed_waivers: Array<{ id: string; signed_at: string }>;
  check_ins: Array<{ id: string; booking_participant_id: string }>;
};

function participantName(snapshot: Record<string, unknown>) {
  return (
    [snapshot.first_name, snapshot.last_name]
      .filter(
        (value): value is string =>
          typeof value === "string" && Boolean(value.trim()),
      )
      .join(" ") || "Persona sin nombre"
  );
}

function participantPhone(snapshot: Record<string, unknown>) {
  return typeof snapshot.phone === "string" && snapshot.phone.trim()
    ? snapshot.phone.trim()
    : "Sin teléfono";
}

function participantIsFreeChild(
  snapshot: Record<string, unknown>,
  hikeDate: string,
) {
  return snapshotIsFreeChildForDate(snapshot, hikeDate);
}

function paymentStatusLabel(status: string) {
  if (status === "PAID") return "PAGADO";
  if (status === "PENDING") return "PENDIENTE";
  if (status === "UNDER_REVIEW") return "EN REVISIÓN";
  if (status === "REFUNDED") return "REEMBOLSADO";
  if (status === "FAILED") return "PAGO FALLIDO";
  if (status === "REJECTED") return "RECHAZADO";
  if (status === "CANCELLED") return "CANCELADO";
  return status.replaceAll("_", " ");
}

type Payment = {
  id: string;
  status: string;
  method: string;
  amount_cents: number;
  received_amount_cents: number | null;
  created_at: string;
  order:
    | {
        profile_id: string;
        booking_id: string | null;
        pickup_hike_id: string | null;
        order_number: string;
        fulfillment_mode: string | null;
        profile:
          | {
              first_name: string;
              last_name: string;
              email: string | null;
            }
          | Array<{
              first_name: string;
              last_name: string;
              email: string | null;
            }>
          | null;
        order_items: Array<{
          id: string;
          item_type: string;
          reference_id: string | null;
          description: string;
          quantity: number;
          unit_price_cents: number;
          order_item_fulfillments:
            | {
                status: string;
                delivery_location: string | null;
                delivered_at: string | null;
              }
            | Array<{
                status: string;
                delivery_location: string | null;
                delivered_at: string | null;
              }>
            | null;
        }>;
      }
    | Array<{
        profile_id: string;
        booking_id: string | null;
        pickup_hike_id: string | null;
        order_number: string;
        fulfillment_mode: string | null;
        profile:
          | {
              first_name: string;
              last_name: string;
              email: string | null;
            }
          | Array<{
              first_name: string;
              last_name: string;
              email: string | null;
            }>
          | null;
        order_items: Array<{
          id: string;
          item_type: string;
          reference_id: string | null;
          description: string;
          quantity: number;
          unit_price_cents: number;
          order_item_fulfillments:
            | {
                status: string;
                delivery_location: string | null;
                delivered_at: string | null;
              }
            | Array<{
                status: string;
                delivery_location: string | null;
                delivered_at: string | null;
              }>
            | null;
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
        "id,booking_number,status,total_cents,profile:profiles!bookings_profile_id_fkey(first_name,last_name,email,phone),booking_participants(id,snapshot),booking_dogs(id,dog_id,snapshot),transport_reservations(id,booking_participant_id,dog_ids),signed_waivers(id,signed_at),check_ins(id,booking_participant_id)",
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
        "id,status,method,amount_cents,received_amount_cents,created_at,order:orders(profile_id,booking_id,pickup_hike_id,order_number,fulfillment_mode,profile:profiles(first_name,last_name,email),order_items(id,item_type,reference_id,description,quantity,unit_price_cents,order_item_fulfillments(status,delivery_location,delivered_at)))",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("waitlist_entries")
      .select(
        "id,status,people_count,dog_count,created_at,offer_expires_at,profile:profiles(first_name,last_name,email,phone)",
      )
      .eq("hike_id", id)
      .order("created_at"),
    supabase
      .from("hike_reviews")
      .select(
        "id,route_rating,guide_rating,transport_rating,body,published,created_at,profile:profiles(first_name,last_name,email)",
      )
      .eq("hike_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!hike) notFound();
  const bookings = (bookingData ?? []) as unknown as Booking[];
  const active = bookings.filter((b) =>
    ["PENDING_PAYMENT", "CONFIRMED"].includes(b.status),
  );
  const hikeDate = dateInMexico(hike.starts_at);
  const people = active.reduce(
    (sum, b) => sum + b.booking_participants.length,
    0,
  );
  const freeChildren = active.reduce(
    (sum, booking) =>
      sum +
      booking.booking_participants.filter((participant) =>
        participantIsFreeChild(participant.snapshot, hikeDate),
      ).length,
    0,
  );
  const occupiedSpots = people - freeChildren;
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
          order.pickup_hike_id === id ||
          order.order_items.some(
            (i) => i.reference_id && photoIds.has(i.reference_id),
          )),
      );
    },
  );
  let hikeRevenue = 0,
    transportRevenue = 0,
    photoRevenue = 0,
    productRevenue = 0,
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
      else if (i.item_type === "PRODUCT") productRevenue += amount;
      else if (i.item_type === "HIKE") hikeRevenue += amount;
    });
  });
  const productsSold = payments.reduce((sum, payment) => {
    if (payment.status !== "PAID") return sum;
    const order = Array.isArray(payment.order)
      ? payment.order[0]
      : payment.order;
    return (
      sum +
      (order?.order_items ?? [])
        .filter((item) => item.item_type === "PRODUCT")
        .reduce((count, item) => count + item.quantity, 0)
    );
  }, 0);
  const productPurchases = payments.flatMap((payment) => {
    if (payment.status !== "PAID") return [];
    const order = Array.isArray(payment.order)
      ? payment.order[0]
      : payment.order;
    if (!order) return [];
    const purchaser = Array.isArray(order.profile)
      ? order.profile[0]
      : order.profile;
    return order.order_items
      .filter((item) => item.item_type === "PRODUCT")
      .map((item) => {
        const fulfillment = Array.isArray(item.order_item_fulfillments)
          ? item.order_item_fulfillments[0]
          : item.order_item_fulfillments;
        return { payment, order, purchaser, item, fulfillment };
      });
  });
  const available = Math.max(0, hike.capacity - occupiedSpots);
  const trans = Array.isArray(hike.transport_configurations)
    ? hike.transport_configurations[0]
    : hike.transport_configurations;
  const transportPassengers = active.flatMap((booking) =>
    booking.transport_reservations.map((reservation) => {
      const participant = booking.booking_participants.find(
        (candidate) => candidate.id === reservation.booking_participant_id,
      );
      const dogNames = booking.booking_dogs
        .filter((dog) => dog.dog_id && reservation.dog_ids.includes(dog.dog_id))
        .map((dog) => String(dog.snapshot.name ?? "Perrito"));
      return { booking, reservation, participant, dogNames };
    }),
  );
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
  const photoById = new Map(photos.map((photo) => [photo.id, photo]));
  const photoPositionById = new Map(
    photos.map((photo, index) => [photo.id, index + 1]),
  );
  const photoPurchases = payments.flatMap((payment) => {
    const order = Array.isArray(payment.order)
      ? payment.order[0]
      : payment.order;
    if (!order) return [];
    const items = order.order_items.filter(
      (item) =>
        item.item_type.startsWith("PHOTO") &&
        item.reference_id &&
        photoIds.has(item.reference_id),
    );
    if (!items.length) return [];
    const purchaser = Array.isArray(order.profile)
      ? order.profile[0]
      : order.profile;
    return [{ payment, order, purchaser, items }];
  });
  const photoPurchaseKey = (purchase: (typeof photoPurchases)[number]) =>
    `${purchase.order.profile_id}:${purchase.items
      .map((item) => `${item.reference_id}:${item.quantity}`)
      .sort()
      .join("|")}`;
  const paidPhotoPurchaseKeys = new Set(
    photoPurchases
      .filter(({ payment }) => payment.status === "PAID")
      .map(photoPurchaseKey),
  );
  const visiblePhotoPurchases = photoPurchases.filter(
    (purchase) =>
      purchase.payment.status !== "PENDING" ||
      !paidPhotoPurchaseKeys.has(photoPurchaseKey(purchase)),
  );
  const paidPhotoCount = visiblePhotoPurchases
    .filter(({ payment }) => payment.status === "PAID")
    .reduce(
      (total, purchase) =>
        total + purchase.items.reduce((sum, item) => sum + item.quantity, 0),
      0,
    );
  const pendingPhotoPurchases = visiblePhotoPurchases.filter(({ payment }) =>
    ["PENDING", "UNDER_REVIEW"].includes(payment.status),
  );
  const pendingPhotoCount = pendingPhotoPurchases.reduce(
    (total, purchase) =>
      total + purchase.items.reduce((sum, item) => sum + item.quantity, 0),
    0,
  );
  const pendingPhotoAmount = pendingPhotoPurchases.reduce(
    (total, purchase) =>
      total +
      purchase.items.reduce(
        (sum, item) => sum + item.quantity * item.unit_price_cents,
        0,
      ),
    0,
  );
  const photoBuyerCount = new Set(
    visiblePhotoPurchases
      .filter(({ payment }) => payment.status === "PAID")
      .map(
        ({ purchaser, order }) =>
          purchaser?.email?.trim().toLowerCase() || order.order_number,
      ),
  ).size;
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
                <Link
                  className="admin-card-hit"
                  href={`/admin/hikes/${id}?tab=inscripciones`}
                  aria-label="Ver detalle de personas"
                />
                <span>PERSONAS</span>
                <strong>{people}</strong>
                <small>
                  {occupiedSpots} lugares ocupados · {available} libres
                  {freeChildren > 0
                    ? ` · ${freeChildren} menores de 5 sin ocupar lugar`
                    : ""}
                </small>
                <span className="kpi-card-action">VER DETALLE →</span>
              </article>
              <article>
                <Link
                  className="admin-card-hit"
                  href={`/admin/hikes/${id}?tab=perritos`}
                  aria-label="Ver detalle de perritos"
                />
                <span>PERRITOS</span>
                <strong>{dogs}</strong>
                <small>de {hike.max_dogs ?? "—"}</small>
                <span className="kpi-card-action">VER DETALLE →</span>
              </article>
              <article>
                <Link
                  className="admin-card-hit"
                  href={`/admin/hikes/${id}?tab=transporte`}
                  aria-label="Ver detalle de transporte"
                />
                <span>TRANSPORTE</span>
                <strong>{transport}</strong>
                <small>de {trans?.capacity ?? "—"}</small>
                <span className="kpi-card-action">VER DETALLE →</span>
              </article>
              <article>
                <Link
                  className="admin-card-hit"
                  href={`/admin/hikes/${id}?tab=pagos`}
                  aria-label="Ver detalle de pagos"
                />
                <span>RECAUDADO</span>
                <strong>
                  {money(
                    hikeRevenue +
                      transportRevenue +
                      photoRevenue +
                      productRevenue,
                  )}
                </strong>
                <small>{money(pending)} pendiente</small>
                <span className="kpi-card-action">VER DETALLE →</span>
              </article>
              <article>
                <Link
                  className="admin-card-hit"
                  href={`/admin/hikes/${id}?tab=productos`}
                  aria-label="Ver productos comprados"
                />
                <span>PRODUCTOS</span>
                <strong>{productsSold}</strong>
                <small>{money(productRevenue)} vendidos</small>
                <span className="kpi-card-action">VER DETALLE →</span>
              </article>
              <article>
                <Link
                  className="admin-card-hit"
                  href={`/admin/hikes/${id}?tab=fotos#compras-fotos`}
                  aria-label="Ver fotografías compradas"
                />
                <span>FOTOGRAFÍAS</span>
                <strong>{paidPhotoCount}</strong>
                <small>
                  {photoBuyerCount} compradores · {pendingPhotoCount} pendientes
                </small>
                <span className="kpi-card-action">VER COMPRAS →</span>
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
                  {
                    (waitlist ?? []).filter(
                      (entry) => entry.status === "WAITING",
                    ).length
                  }{" "}
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
                    <dt>Productos</dt>
                    <dd>{money(productRevenue)}</dd>
                  </div>
                  <div>
                    <dt>Reembolsado</dt>
                    <dd>{money(refunded)}</dd>
                  </div>
                  <div>
                    <dt>Total generado</dt>
                    <dd>
                      {money(
                        hikeRevenue +
                          transportRevenue +
                          photoRevenue +
                          productRevenue,
                      )}
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
            {active.map((b) => {
              const bookingFreeChildren = b.booking_participants.filter(
                (participant) =>
                  participantIsFreeChild(participant.snapshot, hikeDate),
              ).length;
              return (
                <article key={b.id}>
                  <Link
                    className="admin-card-hit"
                    href={`/admin/reservaciones/${b.id}`}
                    aria-label={`Abrir ${b.booking_number}`}
                  />
                  <div>
                    <span>{b.booking_number}</span>
                    <strong>{profileName(b.profile)}</strong>
                    <small>
                      {b.booking_participants.length} personas ·{" "}
                      {b.booking_dogs.length} perritos
                      {bookingFreeChildren > 0
                        ? ` · ${bookingFreeChildren} menores de 5 sin ocupar lugar`
                        : ""}
                    </small>
                    <div className="hike-registration-contacts">
                      {b.booking_participants.map((participant) => (
                        <span key={participant.id}>
                          <b>{participantName(participant.snapshot)}</b>
                          <small>
                            {participantPhone(participant.snapshot)}
                          </small>
                        </span>
                      ))}
                    </div>
                  </div>
                  <b>{money(b.total_cents)}</b>
                  <em>{bookingStatus(b.status)}</em>
                </article>
              );
            })}
            {!active.length && (
              <p>No hay inscripciones activas para este hike.</p>
            )}
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
          <section className="admin-panel transport-detail transport-manifest">
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

              {trans?.mode !== "NONE" && trans && (
                <div className="transport-passenger-list">
                  <header>
                    <span>LISTA DE PASAJEROS</span>
                    <strong>{transportPassengers.length}</strong>
                  </header>
                  {transportPassengers.map(
                    ({ booking, reservation, participant, dogNames }) => (
                      <article key={reservation.id}>
                        <div>
                          <strong>
                            {participant
                              ? participantName(participant.snapshot)
                              : "Persona no encontrada"}
                          </strong>
                          <span>
                            {booking.booking_number} ·{" "}
                            {profileName(booking.profile)}
                          </span>
                          {dogNames.length > 0 && (
                            <small>Perritos: {dogNames.join(", ")}</small>
                          )}
                        </div>
                        <Link href={`/admin/reservaciones/${booking.id}`}>
                          VER RESERVACIÓN
                        </Link>
                      </article>
                    ),
                  )}
                  {!transportPassengers.length && (
                    <p>No hay pasajeros registrados en transporte.</p>
                  )}
                </div>
              )}
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
              const purchaser = Array.isArray(order?.profile)
                ? order.profile[0]
                : order?.profile;
              return (
                <article key={p.id}>
                  <div>
                    <span>
                      {order?.order_number ?? "ORDEN"} ·{" "}
                      {adminDate(p.created_at)}
                    </span>
                    <strong>
                      {order?.order_items
                        .map((i) => i.description)
                        .join(", ") || "Pago"}
                    </strong>
                    <small>
                      {profileName(purchaser)} · {p.method}
                    </small>
                  </div>
                  <b>
                    {money(p.amount_cents)}
                    {p.received_amount_cents !== null
                      ? ` · recibido ${money(p.received_amount_cents)}`
                      : ""}
                  </b>
                  <em>{p.status}</em>
                </article>
              );
            })}
          </section>
        )}
        {tab === "productos" && (
          <section className="admin-panel hike-product-purchases">
            <div className="admin-section-head">
              <div>
                <p>ENTREGA DURANTE EL HIKE</p>
                <h2>Productos comprados</h2>
              </div>
              <strong>
                {productsSold} artículos · {money(productRevenue)}
              </strong>
            </div>
            <div className="hike-product-purchase-list">
              {productPurchases.map(
                ({ order, purchaser, item, fulfillment }) => {
                  const fulfillmentStatus =
                    fulfillment?.status === "DELIVERED"
                      ? "ENTREGADO"
                      : fulfillment?.status === "PREPARED"
                        ? "PREPARADO"
                        : fulfillment?.status === "CANCELLED"
                          ? "CANCELADO"
                          : "PENDIENTE DE ENTREGA";
                  return (
                    <article key={item.id}>
                      <PackageCheck />
                      <div>
                        <span>
                          {order.order_number} · {profileName(purchaser)}
                        </span>
                        <strong>{item.description}</strong>
                        <small>
                          {item.quantity} × {money(item.unit_price_cents)} ·
                          Total {money(item.quantity * item.unit_price_cents)}
                        </small>
                        {fulfillment?.delivery_location && (
                          <small>{fulfillment.delivery_location}</small>
                        )}
                      </div>
                      <em
                        className={
                          fulfillment?.status === "DELIVERED"
                            ? "delivered"
                            : fulfillment?.status === "PREPARED"
                              ? "prepared"
                              : ""
                        }
                      >
                        {fulfillmentStatus}
                      </em>
                      {order.booking_id ? (
                        <Link href={`/admin/reservaciones/${order.booking_id}`}>
                          VER RESERVACIÓN
                        </Link>
                      ) : (
                        <span className="product-pickup-label">
                          COMPRA DE TIENDA
                        </span>
                      )}
                    </article>
                  );
                },
              )}
              {!productPurchases.length && (
                <div className="hike-product-empty">
                  <PackageCheck />
                  <strong>Aún no hay productos pagados para este hike.</strong>
                  <p>Cuando alguien compre un artículo, aparecerá aquí.</p>
                </div>
              )}
            </div>
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
            <div className="hike-photo-purchases" id="compras-fotos">
              <div className="hike-photo-purchase-head">
                <div>
                  <p>VENTAS DE ESTA GALERÍA</p>
                  <h2>Compras de fotografías</h2>
                  <span>
                    Consulta quién compró, cuáles fotos eligió y el estado de
                    cada pago.
                  </span>
                </div>
                <strong>{money(photoRevenue)} recaudados</strong>
              </div>
              <div className="hike-photo-purchase-kpis">
                <article>
                  <span>FOTOS PAGADAS</span>
                  <strong>{paidPhotoCount}</strong>
                </article>
                <article>
                  <span>COMPRADORES</span>
                  <strong>{photoBuyerCount}</strong>
                </article>
                <article>
                  <span>FOTOS PENDIENTES</span>
                  <strong>{pendingPhotoCount}</strong>
                </article>
                <article>
                  <span>IMPORTE PENDIENTE</span>
                  <strong>{money(pendingPhotoAmount)}</strong>
                </article>
              </div>
              <div className="hike-photo-purchase-list">
                {visiblePhotoPurchases.map(
                  ({ payment, order, purchaser, items }) => {
                    const itemCount = items.reduce(
                      (sum, item) => sum + item.quantity,
                      0,
                    );
                    const total = items.reduce(
                      (sum, item) =>
                        sum + item.quantity * item.unit_price_cents,
                      0,
                    );
                    const statusClass = payment.status
                      .toLowerCase()
                      .replaceAll("_", "-");
                    return (
                      <details key={payment.id}>
                        <summary>
                          <span className="hike-photo-order-icon">
                            <ImageIcon />
                          </span>
                          <span className="hike-photo-order-buyer">
                            <small>
                              {order.order_number} ·{" "}
                              {adminDate(payment.created_at)}
                            </small>
                            <strong>{profileName(purchaser)}</strong>
                            <small>{purchaser?.email ?? "Sin correo"}</small>
                          </span>
                          <span className="hike-photo-order-count">
                            <strong>{itemCount}</strong>
                            <small>{itemCount === 1 ? "FOTO" : "FOTOS"}</small>
                          </span>
                          <span className="hike-photo-order-total">
                            <strong>{money(total)}</strong>
                            <small>{payment.method}</small>
                          </span>
                          <em className={statusClass}>
                            {paymentStatusLabel(payment.status)}
                          </em>
                          <span className="hike-photo-order-toggle">
                            VER FOTOS
                          </span>
                        </summary>
                        <div className="hike-photo-order-detail">
                          {items.map((item) => {
                            const photo = item.reference_id
                              ? photoById.get(item.reference_id)
                              : undefined;
                            const position = item.reference_id
                              ? photoPositionById.get(item.reference_id)
                              : undefined;
                            return (
                              <article key={item.id}>
                                {photo?.url ? (
                                  <img
                                    src={photo.url}
                                    alt={
                                      photo.title ??
                                      `Fotografía ${position ?? ""}`.trim()
                                    }
                                  />
                                ) : (
                                  <span className="hike-photo-missing-preview">
                                    <ImageIcon />
                                  </span>
                                )}
                                <div>
                                  <strong>
                                    {photo?.title ??
                                      item.description ??
                                      `Foto ${position ?? ""}`.trim()}
                                  </strong>
                                  <small>
                                    {position ? `Foto ${position} · ` : ""}
                                    {money(item.unit_price_cents)}
                                  </small>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </details>
                    );
                  },
                )}
                {!visiblePhotoPurchases.length && (
                  <div className="hike-photo-purchase-empty">
                    <ImageIcon />
                    <strong>Aún no hay compras de fotografías.</strong>
                    <p>
                      En cuanto alguien inicie una compra, aquí aparecerán sus
                      fotos y el estado del pago.
                    </p>
                  </div>
                )}
              </div>
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
                  <small>
                    {entry.people_count} personas · {entry.dog_count} perritos
                  </small>
                </div>
                <b>
                  {entry.status === "OFFERED" ? "OFERTA 24 H" : entry.status}
                </b>
                <em>
                  {entry.offer_expires_at
                    ? `Vence ${adminDate(entry.offer_expires_at)}`
                    : "ORDEN DE LLEGADA"}
                </em>
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
                <b>
                  RUTA {review.route_rating}/5 · GUÍAS {review.guide_rating}/5
                </b>
                <em>{review.published ? "PUBLICADA" : "OCULTA"}</em>
              </article>
            ))}
            {!reviews?.length && (
              <p>Las reseñas aparecerán después de la aventura.</p>
            )}
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

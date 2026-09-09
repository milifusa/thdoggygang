import Link from "next/link";
import {
  ArrowLeft,
  BusFront,
  CheckCircle2,
  Clock,
  Download,
  FileSignature,
  History,
  Mail,
  PackageCheck,
  QrCode,
  Users,
} from "lucide-react";
import { notFound } from "next/navigation";
import { requireStaffSession } from "../../../lib/auth/guards";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { AdminMobileNav, AdminNav } from "../../admin-nav";
import {
  adminDate,
  bookingStatus,
  money,
  profileName,
} from "../../admin-utils";
import {
  AdminBookingActions,
  BookingNote,
  CheckinCorrection,
  DetailReminder,
  FulfillmentControl,
  ReservationQr,
} from "./reservation-detail-actions";
export const dynamic = "force-dynamic";
const one = <T,>(value: T | T[] | null | undefined) =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
type Item = {
  id: string;
  item_type: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  orderStatus?: string;
  order_item_fulfillments:
    | {
        id: string;
        status: string;
        delivery_location: string | null;
        delivered_at: string | null;
        note: string | null;
      }
    | Array<{
        id: string;
        status: string;
        delivery_location: string | null;
        delivered_at: string | null;
        note: string | null;
      }>
    | null;
};
export default async function ReservationDetail({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  await requireStaffSession(`/admin/reservaciones/${bookingId}`);
  const supabase = await createSupabaseServerClient();
  const [
    { data: booking },
    { data: communications },
    { data: notes },
    { data: audit },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id,booking_number,status,subtotal_cents,total_cents,currency,current_step,created_at,updated_at,last_activity_at,last_reminder_at,expires_at,confirmed_at,cancelled_at,profile:profiles(id,first_name,last_name,email,phone,emergency_contact_name,emergency_contact_phone),hike:hikes(id,name,slug,starts_at,location_name,meeting_point),booking_participants(id,guardian_booking_participant_id,snapshot),booking_dogs(id,snapshot),transport_reservations(id,booking_participant_id,price_cents,dog_ids),signed_waivers(id,booking_participant_id,signed_at,pdf_path,document_hash),check_ins(id,booking_participant_id,checked_in_at,method),booking_cancellation_requests(id,status,reason,refundable_amount_cents,created_at,resolution_note),orders(id,order_number,status,total_cents,fulfillment_mode,pickup_hike_id,shipping_address,tracking_number,payments(id,status,method,amount_cents,paid_at,provider,raw_status,payment_receipts(id,storage_path,created_at)),order_items(id,item_type,description,quantity,unit_price_cents,order_item_fulfillments(id,status,delivery_location,delivered_at,note)))",
      )
      .eq("id", bookingId)
      .maybeSingle(),
    supabase
      .from("booking_communications")
      .select(
        "id,channel,kind,recipient,status,provider_id,metadata,sent_at,created_at",
      )
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false }),
    supabase
      .from("admin_notes")
      .select("id,body,created_at,author:profiles(first_name,last_name)")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false }),
    supabase
      .from("audit_logs")
      .select(
        "id,action,metadata,created_at,actor:profiles(first_name,last_name)",
      )
      .eq("entity_type", "booking")
      .eq("entity_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (!booking) notFound();
  const hike = one(booking.hike);
  const orders = Array.isArray(booking.orders)
    ? booking.orders
    : booking.orders
      ? [booking.orders]
      : [];
  const payments = orders.flatMap((order) => order.payments ?? []);
  const payment =
    payments.find((item) => item.status === "PAID") ??
    payments.find((item) => item.status === "UNDER_REVIEW") ??
    payments[0];
  const items = orders.flatMap((order) =>
    (order.order_items ?? []).map((item) => ({
      ...item,
      orderStatus: order.status,
    })),
  ) as Item[];
  const waivers = booking.signed_waivers ?? [];
  const waiverFor = (participantId: string) =>
    waivers.find((waiver) => waiver.booking_participant_id === participantId);
  const checkinFor = (participantId: string) =>
    booking.check_ins.find(
      (checkin) => checkin.booking_participant_id === participantId,
    );
  const qrEligible =
    booking.status === "CONFIRMED" &&
    booking.booking_participants.length > 0 &&
    waivers.length >= booking.booking_participants.length &&
    booking.check_ins.length < booking.booking_participants.length;
  const cancellation = (booking.booking_cancellation_requests ?? []).find(
    (request) => request.status === "REQUESTED",
  );
  return (
    <main className="admin-page">
      <AdminNav active="/admin/reservaciones" hikeId={hike?.id} />
      <section className="admin-content reservation-detail">
        <AdminMobileNav />
        <header>
          <div>
            <Link className="admin-back" href="/admin/reservaciones">
              <ArrowLeft />
              RESERVACIONES
            </Link>
            <p>{booking.booking_number}</p>
            <h1>{profileName(booking.profile)}</h1>
            <span
              className={`reservation-status ${booking.status.toLowerCase()}`}
            >
              {bookingStatus(booking.status)}
            </span>
          </div>
          <div className="reservation-detail-head-actions">
            {["DRAFT", "PENDING_PAYMENT"].includes(booking.status) && (
              <DetailReminder bookingId={booking.id} />
            )}
            <Link href={`/admin/hike-mode?hike=${hike?.id}`}>
              <QrCode />
              ABRIR MODO HIKE
            </Link>
          </div>
        </header>
        <section className="reservation-detail-summary">
          <article>
            <span>HIKE</span>
            <strong>{hike?.name}</strong>
            <small>
              {hike ? adminDate(hike.starts_at) : "Sin fecha"} ·{" "}
              {hike?.location_name}
            </small>
          </article>
          <article>
            <span>MANADA</span>
            <strong>
              {booking.booking_participants.length} personas ·{" "}
              {booking.booking_dogs.length} perritos
            </strong>
            <small>
              {booking.transport_reservations.length} lugares de transporte
            </small>
          </article>
          <article>
            <span>PAGO</span>
            <strong>{money(booking.total_cents)}</strong>
            <small>
              {payment
                ? `${payment.method} · ${payment.status}`
                : "Sin pago registrado"}
            </small>
          </article>
          <article>
            <span>ACTIVIDAD</span>
            <strong>{adminDate(booking.last_activity_at)}</strong>
            <small>
              {booking.status === "DRAFT"
                ? `Borrador en ${booking.current_step}`
                : "Última actualización"}
            </small>
          </article>
        </section>
        <div className="reservation-detail-grid">
          <div>
            <section className="reservation-panel">
              <header>
                <Users />
                <div>
                  <span>PERSONAS</span>
                  <h2>Asistentes y responsivas</h2>
                </div>
              </header>
              {booking.booking_participants.map((participant) => {
                const snapshot = participant.snapshot as {
                  first_name?: string;
                  last_name?: string;
                  email?: string;
                  phone?: string;
                  is_minor?: boolean;
                  emergency_contact_name?: string;
                  emergency_contact_phone?: string;
                };
                const waiver = waiverFor(participant.id);
                const checkin = checkinFor(participant.id);
                return (
                  <article className="participant-detail" key={participant.id}>
                    <div>
                      <strong>
                        {snapshot.first_name} {snapshot.last_name}
                      </strong>
                      <small>
                        {snapshot.is_minor ? "Menor" : "Adulto"} ·{" "}
                        {snapshot.email ?? snapshot.phone ?? "Sin contacto"}
                      </small>
                      {snapshot.emergency_contact_phone && (
                        <span>
                          Emergencia: {snapshot.emergency_contact_name} ·{" "}
                          <a href={`tel:${snapshot.emergency_contact_phone}`}>
                            {snapshot.emergency_contact_phone}
                          </a>
                        </span>
                      )}
                    </div>
                    <div>
                      {waiver ? (
                        <Link href={`/api/admin/waivers/${waiver.id}/download`}>
                          <FileSignature />
                          FIRMADA · DESCARGAR PDF
                        </Link>
                      ) : (
                        <em>RESPONSIVA PENDIENTE</em>
                      )}
                      {checkin ? (
                        <>
                          <span>
                            <CheckCircle2 />
                            CHECK-IN · {adminDate(checkin.checked_in_at)}
                          </span>
                          <CheckinCorrection checkinId={checkin.id} />
                        </>
                      ) : (
                        <small>Sin check-in</small>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
            <section className="reservation-panel">
              <header>
                <BusFront />
                <div>
                  <span>PERRITOS Y TRANSPORTE</span>
                  <h2>Datos operativos</h2>
                </div>
              </header>
              {booking.booking_dogs.map((dog) => {
                const snapshot = dog.snapshot as {
                  name?: string;
                  breed?: string;
                  sociability?: string;
                  reactivity?: string;
                  medical_conditions?: string;
                  medications?: string;
                  notes?: string;
                };
                return (
                  <article className="dog-detail" key={dog.id}>
                    <strong>
                      {snapshot.name ?? "Perrito"} ·{" "}
                      {snapshot.breed ?? "Sin raza"}
                    </strong>
                    {snapshot.sociability && (
                      <span>Sociabilidad: {snapshot.sociability}</span>
                    )}
                    {snapshot.reactivity && (
                      <span>Reactividad: {snapshot.reactivity}</span>
                    )}
                    {snapshot.medical_conditions && (
                      <span>Condiciones: {snapshot.medical_conditions}</span>
                    )}
                    {snapshot.medications && (
                      <span>Medicamentos: {snapshot.medications}</span>
                    )}
                    {snapshot.notes && <p>{snapshot.notes}</p>}
                  </article>
                );
              })}
              {!booking.booking_dogs.length && (
                <p>Esta reservación no incluye perritos.</p>
              )}
              <div className="transport-detail">
                <strong>
                  {booking.transport_reservations.length} lugares solicitados
                </strong>
                <span>
                  {hike?.meeting_point ?? "Punto de encuentro por confirmar"}
                </span>
              </div>
            </section>
            <section className="reservation-panel">
              <header>
                <PackageCheck />
                <div>
                  <span>COMPRAS</span>
                  <h2>Productos y cumplimiento</h2>
                </div>
              </header>
              {items.length ? (
                items.map((item) => {
                  const fulfillment = one(item.order_item_fulfillments);
                  return (
                    <article className="order-item-detail" key={item.id}>
                      <div>
                        <strong>
                          {item.quantity} × {item.description}
                        </strong>
                        <small>
                          {item.item_type} ·{" "}
                          {money(item.unit_price_cents * item.quantity)}
                        </small>
                      </div>
                      {item.item_type === "PRODUCT" && fulfillment ? (
                        <FulfillmentControl
                          id={fulfillment.id}
                          status={fulfillment.status}
                          location={fulfillment.delivery_location}
                          note={fulfillment.note}
                        />
                      ) : (
                        <span>{item.orderStatus}</span>
                      )}
                    </article>
                  );
                })
              ) : (
                <p>No hay compras ligadas a esta reservación.</p>
              )}
            </section>
            <section className="reservation-panel">
              <header>
                <FileSignature />
                <div>
                  <span>PAGO Y CANCELACIÓN</span>
                  <h2>Documentos y acciones</h2>
                </div>
              </header>
              {payments
                .flatMap((entry) => entry.payment_receipts ?? [])
                .map((receipt) => (
                  <a
                    className="receipt-download-link"
                    key={receipt.id}
                    target="_blank"
                    rel="noreferrer"
                    href={`/api/admin/payment-receipts/${receipt.id}/download`}
                  >
                    <Download />
                    ABRIR COMPROBANTE · {adminDate(receipt.created_at)}
                  </a>
                ))}
              {cancellation && (
                <div className="cancellation-request">
                  <strong>SOLICITUD DE CANCELACIÓN</strong>
                  <p>{cancellation.reason}</p>
                  <small>
                    {adminDate(cancellation.created_at)} · Reembolso estimado{" "}
                    {money(cancellation.refundable_amount_cents)}
                  </small>
                </div>
              )}
              <AdminBookingActions
                bookingId={booking.id}
                status={booking.status}
                hasPaidPayment={payments.some(
                  (entry) => entry.status === "PAID",
                )}
                hasCancellationRequest={Boolean(cancellation)}
              />
            </section>
            <section className="reservation-panel">
              <header>
                <Mail />
                <div>
                  <span>COMUNICACIONES</span>
                  <h2>Historial de mensajes</h2>
                </div>
              </header>
              {communications?.map((item) => (
                <article className="timeline-row" key={item.id}>
                  <span>{item.status}</span>
                  <div>
                    <strong>{item.kind}</strong>
                    <small>
                      {item.channel} · {item.recipient} ·{" "}
                      {adminDate(item.sent_at ?? item.created_at)}
                    </small>
                  </div>
                </article>
              ))}
              {!communications?.length && (
                <p>No se han enviado comunicaciones administrativas.</p>
              )}
            </section>
          </div>
          <aside>
            <section className="reservation-panel sticky-panel">
              <header>
                <QrCode />
                <div>
                  <span>ACCESO</span>
                  <h2>QR de check-in</h2>
                </div>
              </header>
              <ReservationQr bookingId={booking.id} enabled={qrEligible} />
              <small>
                {qrEligible
                  ? "Al regenerarlo, el código anterior deja de ser válido y se registra en auditoría."
                  : booking.check_ins.length >=
                      booking.booking_participants.length
                    ? "El check-in de esta reservación ya está completo."
                    : "El QR se habilita cuando el pago está confirmado y todas las responsivas están firmadas."}
              </small>
            </section>
            <section className="reservation-panel">
              <header>
                <Clock />
                <div>
                  <span>NOTAS</span>
                  <h2>Seguimiento interno</h2>
                </div>
              </header>
              <BookingNote bookingId={booking.id} />
              {notes?.map((note) => (
                <article className="note-row" key={note.id}>
                  <p>{note.body}</p>
                  <small>
                    {profileName(note.author)} · {adminDate(note.created_at)}
                  </small>
                </article>
              ))}
            </section>
            <section className="reservation-panel">
              <header>
                <History />
                <div>
                  <span>SEGURIDAD</span>
                  <h2>Historial auditable</h2>
                </div>
              </header>
              <article className="timeline-row">
                <span>CREADA</span>
                <div>
                  <strong>{adminDate(booking.created_at)}</strong>
                  <small>{booking.booking_number}</small>
                </div>
              </article>
              {booking.confirmed_at && (
                <article className="timeline-row">
                  <span>CONFIRMADA</span>
                  <div>
                    <strong>{adminDate(booking.confirmed_at)}</strong>
                  </div>
                </article>
              )}
              {audit?.map((entry) => (
                <article className="timeline-row" key={entry.id}>
                  <span>{entry.action}</span>
                  <div>
                    <strong>{adminDate(entry.created_at)}</strong>
                    <small>{profileName(entry.actor)}</small>
                  </div>
                </article>
              ))}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

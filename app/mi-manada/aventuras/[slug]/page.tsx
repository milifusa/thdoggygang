import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock3, FileSignature, PackageCheck } from "lucide-react";
import { requireClientSession } from "../../../lib/auth/guards";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { ensureBookingQrToken } from "../../../lib/domain/checkin-token";
import { AdventureTicket } from "./ticket-client";
import { CancelBookingButton } from "./cancel-booking-button";

export const dynamic = "force-dynamic";

const one = <T,>(value: T | T[] | null | undefined) =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
const date = (value: string) =>
  new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));

export default async function MyAdventurePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireClientSession(`/mi-manada/aventuras/${slug}`);
  if (session.mode !== "live" || !session.profile) return null;
  const supabase = await createSupabaseServerClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id,booking_number,status,current_step,total_cents,profile_id,hike:hikes!inner(id,name,slug,starts_at,location_name,meeting_point,cancellation_policy),booking_participants(id,snapshot),booking_dogs(id,snapshot),signed_waivers(id,booking_participant_id),check_ins(id,booking_participant_id),booking_cancellation_requests(id,status),orders(id,status,order_items(id,item_type,description,quantity,order_item_fulfillments(status)))",
    )
    .eq("profile_id", session.profile.id)
    .eq("hike.slug", slug)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!booking) notFound();
  const hike = one(booking.hike);
  if (!hike) notFound();
  const fullySigned =
    booking.booking_participants.length > 0 &&
    booking.signed_waivers.length >= booking.booking_participants.length;
  const checkedIn =
    booking.booking_participants.length > 0 &&
    booking.check_ins.length >= booking.booking_participants.length;
  const eligible = booking.status === "CONFIRMED" && fullySigned && !checkedIn;
  const token = eligible
    ? await ensureBookingQrToken(booking.id).catch(() => null)
    : null;
  const people = booking.booking_participants
    .map((participant) => {
      const snapshot = participant.snapshot as {
        first_name?: string;
        last_name?: string;
      };
      return `${snapshot.first_name ?? ""} ${snapshot.last_name ?? ""}`.trim();
    })
    .filter(Boolean);
  const dogs = booking.booking_dogs
    .map((dog) => (dog.snapshot as { name?: string }).name)
    .filter(Boolean);
  const orders = Array.isArray(booking.orders)
    ? booking.orders
    : booking.orders
      ? [booking.orders]
      : [];
  const products = orders
    .flatMap((order) => order.order_items ?? [])
    .filter((item) => item.item_type === "PRODUCT");
  const hasCancellationRequest = (
    booking.booking_cancellation_requests ?? []
  ).some((request) => request.status === "REQUESTED");
  return (
    <main className="ticket-page">
      <header>
        <Link href="/mi-manada">← MIS AVENTURAS</Link>
        <Link className="wordmark" href="/">
          THE DOGGY <span>GANG</span>
        </Link>
      </header>
      <section className="ticket-shell">
        <p className="eyebrow">{booking.booking_number}</p>
        <h1>
          Tu pase a la
          <br />
          aventura.
        </h1>
        <p>
          {token
            ? "Sube el brillo de tu pantalla y muestra este código al equipo de The Doggy Gang."
            : checkedIn
              ? "Tu llegada ya quedó registrada."
              : "Completa los pasos pendientes para activar tu código de acceso."}
        </p>
        <div className="ticket">
          <div className="ticket-top">
            <span>
              {checkedIn
                ? "CHECK-IN COMPLETO"
                : booking.status.replaceAll("_", " ")}
            </span>
            <h2>{hike.name}</h2>
            <p>
              {date(hike.starts_at)}
              <br />
              {hike.meeting_point ?? hike.location_name}
            </p>
          </div>
          {token ? (
            <AdventureTicket
              token={token}
              bookingNumber={booking.booking_number}
            />
          ) : (
            <div className="ticket-pending">
              <Clock3 />
              <strong>
                {checkedIn ? "LLEGADA REGISTRADA" : "QR PENDIENTE"}
              </strong>
              <span>
                {checkedIn
                  ? "El equipo ya confirmó a todas las personas de esta reservación."
                  : booking.status !== "CONFIRMED"
                    ? "El pago todavía no está confirmado."
                    : "Falta completar la responsiva de todas las personas."}
              </span>
              {!checkedIn && booking.status !== "CANCELLED" && (
                <Link href={`/reservar/${hike.slug}`}>
                  CONTINUAR RESERVACIÓN
                </Link>
              )}
            </div>
          )}
          <div className="ticket-members">
            <div>
              <span>PERSONAS</span>
              <strong>{people.join(" · ") || "Sin asistentes"}</strong>
            </div>
            <div>
              <span>PERRITOS</span>
              <strong>{dogs.join(" · ") || "Sin perritos"}</strong>
            </div>
          </div>
          {products.length > 0 && (
            <div className="ticket-products">
              <PackageCheck />
              <div>
                <strong>PRODUCTOS PARA ESTE HIKE</strong>
                {products.map((item) => (
                  <span key={item.id}>
                    {item.quantity} × {item.description} ·{" "}
                    {one(item.order_item_fulfillments)?.status ?? "PENDING"}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="ticket-signature">
            <FileSignature />
            <span>
              {booking.signed_waivers.length}/
              {booking.booking_participants.length} responsivas firmadas
            </span>
          </div>
        </div>
        <div className="ticket-cancellation-policy">
          <strong>POLÍTICA DE CANCELACIÓN</strong>
          <p>
            {hike.cancellation_policy ??
              "El equipo revisará tu solicitud conforme a las condiciones de esta aventura."}
          </p>
        </div>
        <CancelBookingButton
          bookingId={booking.id}
          status={booking.status}
          hasRequest={hasCancellationRequest}
        />
      </section>
    </main>
  );
}

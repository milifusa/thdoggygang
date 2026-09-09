import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3, FileSignature, PackageCheck } from "lucide-react";
import { requireClientSession } from "../../../lib/auth/guards";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { ensureBookingQrToken } from "../../../lib/domain/checkin-token";
import { AdventureTicket } from "./ticket-client";
import { CancelBookingButton } from "./cancel-booking-button";
import { AdventureCenter } from "./adventure-center";
import { assessDogSuitability } from "../../../lib/dog-suitability";

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
      "id,booking_number,status,current_step,total_cents,profile_id,hike:hikes!inner(id,name,slug,starts_at,location_name,meeting_point,cancellation_policy,distance_km,elevation_m,duration_minutes,difficulty),booking_participants(id,snapshot),booking_dogs(id,snapshot),signed_waivers(id,booking_participant_id),check_ins(id,booking_participant_id),booking_cancellation_requests(id,status),orders(id,status,order_items(id,item_type,description,quantity,order_item_fulfillments(status))),adventure_checklist_items(item_key),hike_reviews(route_rating,guide_rating,transport_rating,body)",
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
  const dogAssessments = booking.booking_dogs.map((dog) => {
    const snapshot = dog.snapshot as {
      name?: string; birth_date?: string | null; size?: string | null; sociability?: string | null;
      reactivity?: string | null; medical_conditions?: string | null; activity_level?: string | null;
      hiking_experience?: string | null; vaccination_current?: boolean | null; vet_cleared?: boolean | null;
    };
    return {
      name: snapshot.name || "Tu perrito",
      result: assessDogSuitability(
        {
          name: snapshot.name || "Tu perrito", birthDate: snapshot.birth_date, size: snapshot.size,
          sociability: snapshot.sociability, reactivity: snapshot.reactivity, medicalConditions: snapshot.medical_conditions,
          activityLevel: snapshot.activity_level, hikingExperience: snapshot.hiking_experience,
          vaccinationCurrent: snapshot.vaccination_current, vetCleared: snapshot.vet_cleared,
        },
        { distanceKm: hike.distance_km, elevationM: hike.elevation_m, durationMinutes: hike.duration_minutes, difficulty: hike.difficulty },
      ),
    };
  });
  const review = one(booking.hike_reviews);
  const canReview = ["CONFIRMED", "COMPLETED"].includes(booking.status) && new Date(hike.starts_at) < new Date();
  const daysUntil = Math.max(
    0,
    Math.ceil(
      (new Date(hike.starts_at).getTime() - new Date().getTime()) / 86_400_000,
    ),
  );
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
        {dogAssessments.length > 0 && (
          <section className="dog-suitability-results">
            <div>
              <p className="eyebrow">COMPATIBILIDAD ORIENTATIVA</p>
              <h2>¿Esta ruta va con mi perrito?</h2>
              <p>Usamos el perfil guardado y la exigencia del hike. No sustituye una valoración veterinaria.</p>
            </div>
            {dogAssessments.map(({ name, result }) => (
              <article className={result.level.toLowerCase()} key={name}>
                {result.level === "GOOD" ? <CheckCircle2 /> : <AlertTriangle />}
                <div><strong>{name} · {result.label}</strong><span>{result.score}/100</span><p>{result.notes.join(" ")}</p></div>
              </article>
            ))}
          </section>
        )}
        <AdventureCenter
          bookingId={booking.id}
          status={booking.status}
          signed={booking.signed_waivers.length}
          participants={booking.booking_participants.length}
          checkedIn={booking.check_ins.length}
          daysUntil={daysUntil}
          meetingPoint={hike.meeting_point ?? hike.location_name}
          completedKeys={(booking.adventure_checklist_items ?? []).map((item) => item.item_key)}
          shopUrl={`/tienda?hike=${hike.id}`}
          canReview={canReview}
          initialReview={review ?? null}
        />
        <CancelBookingButton
          bookingId={booking.id}
          status={booking.status}
          hasRequest={hasCancellationRequest}
        />
      </section>
    </main>
  );
}

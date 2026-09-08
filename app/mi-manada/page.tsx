import Link from "next/link";
import {
  CalendarDays,
  CircleCheck,
  Dog,
  Images,
  ShoppingBag,
  Users,
} from "lucide-react";
import { requireClientSession } from "../lib/auth/guards";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { GangManager, type DogRecord, type PersonRecord } from "./gang-manager";
import { hikeCoverUrl } from "../lib/data";

export const dynamic = "force-dynamic";

type PersonRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  is_minor: boolean;
};
type DogRow = {
  id: string;
  name: string;
  breed: string | null;
  birth_date: string | null;
  sex: DogRecord["sex"] | null;
  size: DogRecord["size"] | null;
  sterilized: boolean | null;
  sociability: string | null;
  reactivity: string | null;
  medical_conditions: string | null;
  medications: string | null;
  notes: string | null;
  photo_path: string | null;
};
type HikeSummary = {
  id: string;
  slug: string;
  name: string;
  starts_at: string;
  location_name: string;
  cover_path: string | null;
};
type BookingRow = {
  id: string;
  status: string;
  created_at: string;
  total_cents: number;
  hike: HikeSummary | HikeSummary[] | null;
  booking_participants: Array<{ id: string }>;
  booking_dogs: Array<{ id: string }>;
};

const initials = (first: string, last: string) =>
  `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
const date = (value: string) =>
  new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Mexico_City",
  })
    .format(new Date(value))
    .toUpperCase();

export default async function MyGangPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; returnTo?: string }>;
}) {
  const session = await requireClientSession("/mi-manada");
  const query = await searchParams;
  if (session.mode !== "live" || !session.profile) return null;
  const supabase = await createSupabaseServerClient();
  const [{ data: peopleData }, { data: dogsData }, { data: bookingsData }] =
    await Promise.all([
      supabase
        .from("person_profiles")
        .select(
          "id, first_name, last_name, email, phone, birth_date, emergency_contact_name, emergency_contact_phone, is_minor",
        )
        .eq("owner_profile_id", session.profile.id)
        .is("deleted_at", null)
        .order("created_at"),
      supabase
        .from("dogs")
        .select(
          "id, name, breed, birth_date, sex, size, sterilized, sociability, reactivity, medical_conditions, medications, notes, photo_path",
        )
        .eq("owner_profile_id", session.profile.id)
        .is("deleted_at", null)
        .order("created_at"),
      supabase
        .from("bookings")
        .select(
          "id, status, created_at, total_cents, hike:hikes(id, slug, name, starts_at, location_name, cover_path), booking_participants(id), booking_dogs(id)",
        )
        .eq("profile_id", session.profile.id)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

  const people: PersonRecord[] = ((peopleData ?? []) as PersonRow[]).map(
    (person) => ({
      id: person.id,
      firstName: person.first_name,
      lastName: person.last_name,
      email: person.email ?? "",
      phone: person.phone ?? "",
      birthDate: person.birth_date ?? "",
      emergencyContactName: person.emergency_contact_name ?? "",
      emergencyContactPhone: person.emergency_contact_phone ?? "",
      isMinor: person.is_minor,
    }),
  );
  const dogs: DogRecord[] = await Promise.all(
    ((dogsData ?? []) as DogRow[]).map(async (dog) => {
      let photoUrl = "";
      if (dog.photo_path) {
        const { data: signedPhoto } = await supabase.storage
          .from("dog-photos")
          .createSignedUrl(dog.photo_path, 60 * 60);
        photoUrl = signedPhoto?.signedUrl ?? "";
      }
      return {
        id: dog.id,
        name: dog.name,
        breed: dog.breed ?? "",
        birthDate: dog.birth_date ?? "",
        sex: dog.sex ?? "UNKNOWN",
        size: dog.size ?? "MEDIUM",
        sterilized: dog.sterilized,
        sociability: dog.sociability ?? "",
        reactivity: dog.reactivity ?? "",
        medicalConditions: dog.medical_conditions ?? "",
        medications: dog.medications ?? "",
        notes: dog.notes ?? "",
        photoPath: dog.photo_path ?? "",
        photoUrl,
      };
    }),
  );
  const bookings = (bookingsData ?? []) as BookingRow[];
  const hikeOf = (booking: BookingRow) =>
    Array.isArray(booking.hike) ? booking.hike[0] : booking.hike;
  const nextBooking = bookings.find((booking) => {
    const hike = hikeOf(booking);
    return (
      hike &&
      new Date(hike.starts_at) >= new Date() &&
      ["PENDING_PAYMENT", "CONFIRMED"].includes(booking.status)
    );
  });
  const history = bookings.filter((booking) => booking !== nextBooking);
  const galleryHikeIds = bookings
    .filter((booking) => ["CONFIRMED", "COMPLETED"].includes(booking.status))
    .map((booking) => hikeOf(booking)?.id)
    .filter((id): id is string => Boolean(id));
  const { data: galleries } = galleryHikeIds.length
    ? await supabase
        .from("hike_galleries")
        .select(
          "id,hike_id,photos:photos!photos_gallery_id_fkey(thumbnail_path,watermarked_path,access)",
        )
        .in("hike_id", galleryHikeIds)
        .not("published_at", "is", null)
    : { data: [] };
  const recentGallery = galleries?.[0];
  const recentPhoto = recentGallery?.photos?.[0];
  let recentPhotoUrl = "";
  if (recentPhoto) {
    const { data: signed } = await supabase.storage
      .from(
        recentPhoto.access === "PAID" ? "hike-watermarked" : "hike-previews",
      )
      .createSignedUrl(
        recentPhoto.access === "PAID"
          ? recentPhoto.watermarked_path
          : recentPhoto.thumbnail_path,
        3600,
      );
    recentPhotoUrl = signed?.signedUrl ?? "";
  }
  const firstName = session.profile.first_name || "aventurero";
  const fullName =
    `${session.profile.first_name} ${session.profile.last_name}`.trim();
  const userInitials = initials(
    session.profile.first_name,
    session.profile.last_name,
  );

  return (
    <main className="account-page">
      <aside className="account-sidebar">
        <Link className="wordmark" href="/">
          THE DOGGY <span>GANG</span>
        </Link>
        <nav>
          <Link className="active" href="/mi-manada">
            <span>IN</span> Inicio
          </Link>
          <a href="#aventuras">
            <span>AV</span> Mis aventuras
          </a>
          <a href="#personas">
            <span>PE</span> Personas
          </a>
          <a href="#perritos">
            <span>DG</span> Perritos
          </a>
          <Link href="/mis-fotos">
            <span>FO</span> Mis fotos
          </Link>
        </nav>
        <div className="account-user">
          <div>{userInitials}</div>
          <span>
            <strong>{fullName}</strong>
            <small>{session.profile.email}</small>
          </span>
        </div>
      </aside>
      <section className="account-content">
        <header className="account-mobile-header">
          <Link className="wordmark" href="/">
            THE DOGGY <span>GANG</span>
          </Link>
          <span>{userInitials}</span>
        </header>
        <div className="welcome">
          <div>
            <p className="eyebrow">MI MANADA</p>
            <h1>¡Hola, {firstName}!</h1>
            <p>La próxima aventura ya se siente cerca.</p>
          </div>
          <Link className="button button-primary" href="/#aventuras">
            BUSCAR AVENTURA →
          </Link>
        </div>
        <nav className="account-quick-actions" aria-label="Accesos rápidos">
          <a href="#aventuras">
            <CalendarDays />
            <span>
              <strong>Mis aventuras</strong>
              <small>Reservas y accesos</small>
            </span>
          </a>
          <a href="#personas">
            <Users />
            <span>
              <strong>Personas</strong>
              <small>{people.length} en tu manada</small>
            </span>
          </a>
          <a href="#perritos">
            <Dog />
            <span>
              <strong>Perritos</strong>
              <small>{dogs.length} perfiles</small>
            </span>
          </a>
          <Link href="/mis-fotos">
            <Images />
            <span>
              <strong>Mis fotos</strong>
              <small>{galleries?.length ?? 0} galerías</small>
            </span>
          </Link>
        </nav>
        <section
          className={`next-adventure ${nextBooking ? "" : "empty-adventure"}`}
          id="aventuras"
        >
          {nextBooking && hikeOf(nextBooking) ? (
            <>
              <div className="next-photo">
                <img
                  src={hikeCoverUrl(
                    hikeOf(nextBooking)!.id,
                    hikeOf(nextBooking)!.cover_path,
                  )}
                  alt={hikeOf(nextBooking)!.name}
                />
                <span>PRÓXIMA AVENTURA</span>
              </div>
              <div className="next-details">
                <p>{date(hikeOf(nextBooking)!.starts_at)}</p>
                <h2>{hikeOf(nextBooking)!.name}</h2>
                <span>{hikeOf(nextBooking)!.location_name}</span>
                <div className="next-counts">
                  <div>
                    <strong>{nextBooking.booking_participants.length}</strong>
                    <small>PERSONAS</small>
                  </div>
                  <div>
                    <strong>{nextBooking.booking_dogs.length}</strong>
                    <small>PERRITOS</small>
                  </div>
                  <div>
                    <strong>
                      {nextBooking.status === "CONFIRMED" ? (
                        <CircleCheck aria-label="Confirmada" />
                      ) : (
                        "…"
                      )}
                    </strong>
                    <small>
                      {nextBooking.status === "CONFIRMED"
                        ? "CONFIRMADA"
                        : "PAGO PENDIENTE"}
                    </small>
                  </div>
                </div>
                <div className="next-adventure-actions">
                  <Link
                    className="button button-dark"
                    href={`/mi-manada/aventuras/${hikeOf(nextBooking)!.slug}`}
                  >
                    {nextBooking.status === "CONFIRMED"
                      ? "VER MI QR →"
                      : "VER DETALLE →"}
                  </Link>
                  {nextBooking.status === "CONFIRMED" && (
                    <Link
                      className="button next-shop-button"
                      href={`/tienda?hike=${hikeOf(nextBooking)!.id}`}
                    >
                      <ShoppingBag aria-hidden="true" /> COMPRAR ARTÍCULOS
                    </Link>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-adventure-copy">
              <span>PRÓXIMA AVENTURA</span>
              <h2>Tu siguiente historia empieza aquí.</h2>
              <p>
                Aún no tienes una reservación activa. Explora los próximos hikes
                y arma tu manada.
              </p>
              <Link className="button button-dark" href="/#aventuras">
                VER AVENTURAS →
              </Link>
            </div>
          )}
        </section>

        <GangManager
          profileId={session.profile.id}
          people={people}
          dogs={dogs}
          initialDialog={
            query.new === "person"
              ? "person"
              : query.new === "dog"
                ? "dog"
                : undefined
          }
          returnTo={
            query.returnTo?.startsWith("/") ? query.returnTo : undefined
          }
        />

        <section className="history">
          <div className="account-heading">
            <div>
              <p className="eyebrow">HUELLAS QUE YA DEJARON</p>
              <h2>Mis aventuras</h2>
            </div>
          </div>
          {history.length ? (
            history.slice(0, 3).map((booking) => {
              const hike = hikeOf(booking);
              return hike ? (
                <div className="history-row" key={booking.id}>
                  <span>{date(hike.starts_at)}</span>
                  <strong>{hike.name}</strong>
                  <em className={booking.status === "CONFIRMED" ? "paid" : ""}>
                    {booking.status.replaceAll("_", " ")}
                  </em>
                  <small>
                    {booking.booking_participants.length} personas ·{" "}
                    {booking.booking_dogs.length} perritos
                  </small>
                  <Link href={`/aventuras/${hike.slug}`}>VER →</Link>
                </div>
              ) : null;
            })
          ) : (
            <div className="history-empty">
              Tus aventuras aparecerán aquí después de reservar.
            </div>
          )}
        </section>
        <section className="recent-photo-preview">
          <div>
            <p className="eyebrow">RECUERDOS RECIENTES</p>
            <h2>Tus aventuras, siempre contigo.</h2>
            <p>
              Consulta las galerías publicadas de los hikes en los que
              participaste.
            </p>
            <Link href="/mis-fotos">VER MIS FOTOS →</Link>
          </div>
          <img
            src={recentPhotoUrl || "/brand/profile-trail-sun.png"}
            alt="Recuerdo reciente de la manada"
          />
        </section>
      </section>
      <nav className="mobile-tabbar">
        <Link className="active" href="/mi-manada">
          IN<span>Inicio</span>
        </Link>
        <a href="#aventuras">
          AV<span>Aventuras</span>
        </a>
        <a href="#perritos">
          DG<span>Perritos</span>
        </a>
        <Link href="/mis-fotos">
          FO<span>Fotos</span>
        </Link>
      </nav>
    </main>
  );
}

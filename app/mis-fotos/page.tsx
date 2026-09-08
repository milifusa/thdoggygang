import Link from "next/link";
import { Camera, ChevronRight, Images } from "lucide-react";
import { requireClientSession } from "../lib/auth/guards";
import { createSupabaseServerClient } from "../lib/supabase/server";

export const dynamic = "force-dynamic";
const date = (value: string) =>
  new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
export default async function MyPhotosPage() {
  const session = await requireClientSession("/mis-fotos");
  if (session.mode !== "live" || !session.profile) return null;
  const supabase = await createSupabaseServerClient();
  const { data: bookings } = await supabase
    .from("bookings")
    .select("hike:hikes(id,slug,name,starts_at)")
    .eq("profile_id", session.profile.id)
    .in("status", ["CONFIRMED", "COMPLETED"]);
  const hikes = (bookings ?? [])
    .map((row) => (Array.isArray(row.hike) ? row.hike[0] : row.hike))
    .filter(Boolean);
  const ids = hikes.map((h) => h!.id);
  const { data: galleries } = ids.length
    ? await supabase
        .from("hike_galleries")
        .select(
          "id,hike_id,title,published_at,cover_photo_id,photos:photos!photos_gallery_id_fkey(id,thumbnail_path,watermarked_path,access)",
        )
        .in("hike_id", ids)
        .not("published_at", "is", null)
    : { data: [] };
  const cards = await Promise.all(
    (galleries ?? []).map(async (gallery) => {
      const hike = hikes.find((item) => item!.id === gallery.hike_id)!;
      const photos = gallery.photos ?? [];
      const cover =
        photos.find((photo) => photo.id === gallery.cover_photo_id) ??
        photos[0];
      let image = "/brand/profile-trail-sun.png";
      if (cover) {
        const bucket =
          cover.access === "PAID" ? "hike-watermarked" : "hike-previews";
        const photoPath =
          cover.access === "PAID"
            ? cover.watermarked_path
            : cover.thumbnail_path;
        const { data } = await supabase.storage
          .from(bucket)
          .createSignedUrl(photoPath, 3600);
        image = data?.signedUrl ?? image;
      }
      return { gallery, hike, image };
    }),
  );
  return (
    <main className="my-photos-page">
      <header>
        <Link className="wordmark" href="/">
          THE DOGGY <span>GANG</span>
        </Link>
        <Link href="/mi-manada">MI MANADA</Link>
      </header>
      <section className="my-photos-intro">
        <p className="eyebrow">RECUERDOS DE TU MANADA</p>
        <h1>Mis fotos.</h1>
        <p>
          Aquí aparecen únicamente las galerías de las aventuras en las que
          participaste.
        </p>
      </section>
      {cards.length ? (
        <section className="my-gallery-grid">
          {cards.map(({ gallery, hike, image }) => (
            <Link href={`/galeria/${hike.slug}`} key={gallery.id}>
              <img src={image} alt={hike.name} />
              <div>
                <span>{date(hike.starts_at)}</span>
                <h2>{hike.name}</h2>
                <p>
                  <Images /> {gallery.photos.length} fotografías
                </p>
                <b>
                  ABRIR GALERÍA <ChevronRight />
                </b>
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <section className="my-photos-empty">
          <Camera />
          <h2>Tus recuerdos aparecerán aquí.</h2>
          <p>
            Cuando una galería de una aventura confirmada sea publicada, podrás
            verla y descargar tus fotos desde esta sección.
          </p>
          <Link className="button button-primary" href="/aventuras">
            VER AVENTURAS
          </Link>
        </section>
      )}
    </main>
  );
}

import Link from "next/link";
import { requireStaffSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { PhotoManager, type AdminPhoto } from "./photo-manager";

export const dynamic = "force-dynamic";

export default async function PhotosAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ hike?: string }>;
}) {
  await requireStaffSession("/admin/fotos");
  const supabase = await createSupabaseServerClient();
  const query = await searchParams;
  const { data: hikes } = await supabase
    .from("hikes")
    .select("id,name,slug,starts_at")
    .is("deleted_at", null)
    .order("starts_at", { ascending: false });
  const selected =
    hikes?.find((hike) => hike.id === query.hike) ?? hikes?.[0] ?? null;
  const { data: gallery } = selected
    ? await supabase
        .from("hike_galleries")
        .select("id,published_at")
        .eq("hike_id", selected.id)
        .maybeSingle()
    : { data: null };
  const { data: rows } = gallery
    ? await supabase
        .from("photos")
        .select(
          "id,title,caption,access,price_cents,preview_path,watermarked_path,processing_status,processing_error",
        )
        .eq("gallery_id", gallery.id)
        .is("deleted_at", null)
        .order("sort_order")
        .order("created_at")
    : { data: [] };
  const photos: AdminPhoto[] = await Promise.all(
    (rows ?? []).map(async (photo) => {
      const bucket =
        photo.access === "PAID" ? "hike-watermarked" : "hike-previews";
      const path =
        photo.access === "PAID" ? photo.watermarked_path : photo.preview_path;
      const { data } =
        photo.processing_status === "READY"
          ? await supabase.storage.from(bucket).createSignedUrl(path, 3600)
          : { data: null };
      return {
        id: photo.id,
        title: photo.title,
        caption: photo.caption,
        access: photo.access,
        price_cents: photo.price_cents,
        url: data?.signedUrl ?? "",
        processingStatus: photo.processing_status,
        processingError: photo.processing_error,
      };
    }),
  );
  const next = [...(hikes ?? [])]
    .reverse()
    .find((hike) => new Date(hike.starts_at) >= new Date());
  return (
    <main className="admin-page">
      <AdminNav active="/admin/fotos" hikeId={next?.id} />
      <section className="admin-content">
        <AdminMobileNav />
        <header>
          <div>
            <p>RECUERDOS POR AVENTURA</p>
            <h1>Fotografías.</h1>
          </div>
          {selected && (
            <div className="admin-head-actions">
              <Link href={`/galeria/${selected.slug}`}>VER GALERÍA</Link>
            </div>
          )}
        </header>
        <section className="admin-hike-tabs" aria-label="Seleccionar hike">
          {hikes?.map((hike) => (
            <Link
              className={selected?.id === hike.id ? "active" : ""}
              href={`/admin/fotos?hike=${hike.id}`}
              key={hike.id}
            >
              {hike.name}
            </Link>
          ))}
        </section>
        {selected ? (
          <section className="admin-panel admin-module-panel">
            <div className="admin-section-head">
              <div>
                <p>{selected.name}</p>
                <h2>{photos.length} fotos en esta galería</h2>
              </div>
            </div>
            <PhotoManager hikeId={selected.id} photos={photos} />
          </section>
        ) : (
          <section className="admin-empty-state">
            <p>Primero crea un hike para poder cargar fotografías.</p>
          </section>
        )}
      </section>
    </main>
  );
}

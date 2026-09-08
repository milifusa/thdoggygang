import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { requireClientSession } from "../../lib/auth/guards";
import { PhotoGallery, type GalleryPhoto } from "./photo-gallery";

export const dynamic = "force-dynamic";

export default async function GalleryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireClientSession(`/galeria/${slug}`);
  if (session.mode !== "live" || !session.profile) return null;
  const supabase = await createSupabaseServerClient();
  const { data: hike } = await supabase
    .from("hikes")
    .select("id,name,starts_at")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!hike) notFound();
  if (session.profile.role === "CLIENT") {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id")
      .eq("profile_id", session.profile.id)
      .eq("hike_id", hike.id)
      .in("status", ["CONFIRMED", "COMPLETED"])
      .limit(1)
      .maybeSingle();
    if (!booking) notFound();
  }
  const { data: gallery } = await supabase
    .from("hike_galleries")
    .select("id,title,published_at")
    .eq("hike_id", hike.id)
    .not("published_at", "is", null)
    .maybeSingle();
  const { data: rows } = gallery
    ? await supabase
        .from("photos")
        .select(
          "id,title,caption,access,price_cents,preview_path,watermarked_path",
        )
        .eq("gallery_id", gallery.id)
        .is("deleted_at", null)
        .order("sort_order")
        .order("created_at")
    : { data: [] };
  const { data: purchases } = await supabase
    .from("photo_purchases")
    .select("photo_id,order_item:order_items!inner(order:orders!inner(status))")
    .eq("profile_id", session.profile.id);
  const purchasedIds = new Set(
    (purchases ?? [])
      .filter((item) => {
        const oi = Array.isArray(item.order_item)
          ? item.order_item[0]
          : item.order_item;
        const order = Array.isArray(oi?.order) ? oi.order[0] : oi?.order;
        return order?.status === "PAID";
      })
      .map((item) => item.photo_id),
  );
  const photos: GalleryPhoto[] = await Promise.all(
    (rows ?? []).map(async (photo) => {
      const purchased = purchasedIds.has(photo.id);
      const bucket =
        photo.access === "FREE_ORIGINAL" || purchased
          ? "hike-previews"
          : "hike-watermarked";
      const path =
        photo.access === "FREE_ORIGINAL" || purchased
          ? photo.preview_path
          : photo.watermarked_path;
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 3600);
      return {
        id: photo.id,
        title: photo.title,
        caption: photo.caption,
        access: photo.access,
        priceCents: photo.price_cents ?? 0,
        url: data?.signedUrl ?? "",
        purchased,
      };
    }),
  );
  return (
    <PhotoGallery
      hikeName={hike.name}
      hikeSlug={slug}
      hikeDate={hike.starts_at}
      photos={photos}
    />
  );
}

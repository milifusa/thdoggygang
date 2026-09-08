import { z } from "zod";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../../lib/supabase/service";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Foto inválida." }, { status: 400 });
  const service = createSupabaseServiceClient();
  const { data: photo } = await service
    .from("photos")
    .select(
      "id,access,original_path,watermarked_path,gallery:hike_galleries!photos_gallery_id_fkey(hike_id)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (!photo)
    return Response.json({ error: "Foto no disponible." }, { status: 404 });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return Response.redirect(
      new URL(
        `/ingresar?next=${encodeURIComponent(new URL(_.url).pathname)}`,
        _.url,
      ),
    );
  const { data: profile } = await service
    .from("profiles")
    .select("id,role,active")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile?.active)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const gallery = Array.isArray(photo.gallery)
    ? photo.gallery[0]
    : photo.gallery;
  const { data: booking } =
    profile.role === "CLIENT"
      ? await service
          .from("bookings")
          .select("id")
          .eq("profile_id", profile.id)
          .eq("hike_id", gallery.hike_id)
          .in("status", ["CONFIRMED", "COMPLETED"])
          .limit(1)
          .maybeSingle()
      : { data: { id: "staff" } };
  if (!booking)
    return Response.json(
      { error: "Esta galería es exclusiva para asistentes." },
      { status: 403 },
    );
  let purchased = photo.access !== "PAID";
  if (photo.access === "PAID") {
    const { data: purchases } = await service
      .from("photo_purchases")
      .select("order_item:order_items(order:orders(status))")
      .eq("profile_id", profile.id)
      .eq("photo_id", id);
    purchased = (purchases ?? []).some((purchase) => {
      const item = Array.isArray(purchase.order_item)
        ? purchase.order_item[0]
        : purchase.order_item;
      const order = Array.isArray(item?.order) ? item.order[0] : item?.order;
      return order?.status === "PAID";
    });
  }
  if (!purchased)
    return Response.json(
      { error: "Esta foto requiere una compra confirmada." },
      { status: 403 },
    );
  const watermarked = photo.access === "FREE_WATERMARKED";
  const { data, error } = await service.storage
    .from(watermarked ? "hike-watermarked" : "hike-originals")
    .createSignedUrl(
      watermarked ? photo.watermarked_path : photo.original_path,
      300,
      { download: true },
    );
  if (error || !data)
    return Response.json(
      { error: "No pudimos preparar la descarga." },
      { status: 500 },
    );
  return Response.redirect(data.signedUrl);
}

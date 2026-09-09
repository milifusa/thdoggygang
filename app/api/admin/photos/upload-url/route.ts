import { z } from "zod";
import { adminClient } from "../../hikes/route";
import { createSupabaseServiceClient } from "../../../../lib/supabase/service";

const schema = z.object({
  hikeId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(240),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(50 * 1024 * 1024),
  access: z.enum(["FREE_WATERMARKED", "FREE_ORIGINAL", "PAID"]),
  priceCents: z.number().int().min(0),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      {
        error:
          "La foto debe ser JPG, PNG o WebP y pesar como máximo 50 MB.",
      },
      { status: 400 },
    );
  if (!(await adminClient()))
    return Response.json({ error: "No autorizado." }, { status: 403 });

  const service = createSupabaseServiceClient();
  const { data: hike } = await service
    .from("hikes")
    .select("id,name")
    .eq("id", parsed.data.hikeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!hike)
    return Response.json(
      { error: "No encontramos ese hike." },
      { status: 404 },
    );

  const { data: gallery, error: galleryError } = await service
    .from("hike_galleries")
    .upsert(
      { hike_id: hike.id, title: `Fotos · ${hike.name}` },
      { onConflict: "hike_id" },
    )
    .select("id")
    .single();
  if (galleryError || !gallery)
    return Response.json(
      { error: "No pudimos preparar la galería." },
      { status: 500 },
    );

  const id = crypto.randomUUID();
  const extension =
    parsed.data.contentType === "image/png"
      ? "png"
      : parsed.data.contentType === "image/webp"
        ? "webp"
        : "jpg";
  const originalPath = `${hike.id}/${id}.${extension}`;
  const previewPath = `${hike.id}/${id}.jpg`;
  const thumbnailPath = `${hike.id}/${id}-thumb.jpg`;
  const { error: photoError } = await service.from("photos").insert({
    id,
    gallery_id: gallery.id,
    original_path: originalPath,
    thumbnail_path: thumbnailPath,
    preview_path: previewPath,
    watermarked_path: previewPath,
    access: parsed.data.access,
    price_cents: parsed.data.access === "PAID" ? parsed.data.priceCents : 0,
    title: parsed.data.fileName.replace(/\.[^.]+$/, ""),
    processing_status: "UPLOADING",
  });
  if (photoError)
    return Response.json(
      { error: "No pudimos registrar la fotografía." },
      { status: 500 },
    );

  const { data: signed, error: signedError } = await service.storage
    .from("hike-originals")
    .createSignedUploadUrl(originalPath);
  if (signedError || !signed?.token) {
    await service.from("photos").delete().eq("id", id);
    return Response.json(
      { error: "No pudimos preparar la carga privada." },
      { status: 500 },
    );
  }

  return Response.json({
    photoId: id,
    path: originalPath,
    token: signed.token,
  });
}

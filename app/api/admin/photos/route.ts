import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { adminClient } from "../hikes/route";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";

const accessSchema = z.enum(["FREE_WATERMARKED", "FREE_ORIGINAL", "PAID"]);

export async function POST(request: Request) {
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const form = await request.formData();
  const hikeId = z.string().uuid().safeParse(form.get("hikeId"));
  const access = accessSchema.safeParse(form.get("access"));
  const priceCents = Math.round(Number(form.get("price") ?? 0) * 100);
  const files = form
    .getAll("photos")
    .filter((value): value is File => value instanceof File && value.size > 0);
  if (
    !hikeId.success ||
    !access.success ||
    !Number.isFinite(priceCents) ||
    priceCents < 0
  )
    return Response.json(
      { error: "Revisa el hike, el acceso y el precio." },
      { status: 400 },
    );
  if (!files.length || files.length > 100)
    return Response.json(
      { error: "Selecciona entre 1 y 100 fotos." },
      { status: 400 },
    );
  if (
    files.some(
      (file) =>
        file.size > 20 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type),
    )
  )
    return Response.json(
      { error: "Cada foto debe ser JPG, PNG o WebP y pesar máximo 20 MB." },
      { status: 400 },
    );
  const service = createSupabaseServiceClient();
  const { data: hike } = await service
    .from("hikes")
    .select("id,name")
    .eq("id", hikeId.data)
    .is("deleted_at", null)
    .single();
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
      { error: galleryError?.message ?? "No pudimos crear la galería." },
      { status: 500 },
    );
  const saved = [];
  const logo = await readFile(
    path.join(process.cwd(), "public/brand/logo-circular-blue.png"),
  );
  for (const file of files) {
    const id = crypto.randomUUID();
    const originalExt =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";
    const originalPath = `${hike.id}/${id}.${originalExt}`;
    const previewPath = `${hike.id}/${id}.jpg`;
    const thumbnailPath = `${hike.id}/${id}-thumb.jpg`;
    try {
      const { error: pendingError } = await service.from("photos").insert({
        id,
        gallery_id: gallery.id,
        original_path: originalPath,
        thumbnail_path: thumbnailPath,
        preview_path: previewPath,
        watermarked_path: previewPath,
        access: access.data,
        price_cents: access.data === "PAID" ? priceCents : 0,
        title: file.name.replace(/\.[^.]+$/, ""),
        processing_status: "PROCESSING",
      });
      if (pendingError) throw pendingError;
      const original = Buffer.from(await file.arrayBuffer());
      const originalUpload = await service.storage
        .from("hike-originals")
        .upload(originalPath, original, {
          contentType: file.type,
          upsert: false,
        });
      if (originalUpload.error) throw originalUpload.error;
      const image = sharp(original, { failOn: "error" }).rotate();
      const metadata = await image.metadata();
      const preview = await image
        .clone()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 82 })
        .toBuffer();
      const thumbnail = await image
        .clone()
        .resize({
          width: 520,
          height: 520,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 76 })
        .toBuffer();
      const previewInfo = await sharp(preview).metadata();
      const watermarkWidth = Math.max(
        220,
        Math.round((previewInfo.width ?? 1200) * 0.34),
      );
      const { data: watermarkPixels, info: watermarkInfo } = await sharp(logo)
        .resize({ width: watermarkWidth })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (let index = 3; index < watermarkPixels.length; index += 4)
        watermarkPixels[index] = Math.round(watermarkPixels[index] * 0.58);
      const watermark = await sharp(watermarkPixels, {
        raw: watermarkInfo,
      })
        .png()
        .toBuffer();
      const watermarked = await sharp(preview)
        .composite([{ input: watermark, gravity: "centre", blend: "over" }])
        .jpeg({ quality: 82 })
        .toBuffer();
      await Promise.all([
        service.storage.from("hike-previews").upload(previewPath, preview, {
          contentType: "image/jpeg",
          upsert: false,
        }),
        service.storage.from("hike-previews").upload(thumbnailPath, thumbnail, {
          contentType: "image/jpeg",
          upsert: false,
        }),
        service.storage
          .from("hike-watermarked")
          .upload(previewPath, watermarked, {
            contentType: "image/jpeg",
            upsert: false,
          }),
      ]).then((results) => {
        const failed = results.find((result) => result.error);
        if (failed?.error) throw failed.error;
      });
      const { data, error } = await service
        .from("photos")
        .update({
          width: metadata.width ?? null,
          height: metadata.height ?? null,
          processing_status: "READY",
          processing_error: null,
        })
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
      saved.push(data);
    } catch (error) {
      await service
        .from("photos")
        .update({
          processing_status: "ERROR",
          processing_error:
            error instanceof Error ? error.message : "Error de procesamiento",
        })
        .eq("id", id);
      return Response.json(
        {
          error:
            error instanceof Error
              ? `No pudimos procesar ${file.name}: ${error.message}`
              : `No pudimos procesar ${file.name}.`,
          uploaded: saved.length,
        },
        { status: 500 },
      );
    }
  }
  return Response.json({ ok: true, uploaded: saved.length });
}

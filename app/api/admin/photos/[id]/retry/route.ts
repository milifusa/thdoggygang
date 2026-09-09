import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { adminClient } from "../../../hikes/route";
import { createSupabaseServiceClient } from "../../../../../lib/supabase/service";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Foto inválida." }, { status: 400 });
  if (!(await adminClient()))
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const service = createSupabaseServiceClient();
  const { data: photo } = await service
    .from("photos")
    .select(
      "id,original_path,preview_path,thumbnail_path,watermarked_path,processing_status",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (!photo)
    return Response.json({ error: "No encontramos la foto." }, { status: 404 });
  await service
    .from("photos")
    .update({ processing_status: "PROCESSING", processing_error: null })
    .eq("id", id);
  try {
    const { data, error } = await service.storage
      .from("hike-originals")
      .download(photo.original_path);
    if (error || !data)
      throw new Error(
        "El original no está disponible; vuelve a cargar esta foto.",
      );
    const original = Buffer.from(await data.arrayBuffer());
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
    const info = await sharp(preview).metadata();
    const logo = await readFile(
      path.join(process.cwd(), "public/brand/logo-circular-blue.png"),
    );
    const watermark = await sharp(logo)
      .resize({ width: Math.max(220, Math.round((info.width ?? 1200) * 0.34)) })
      .ensureAlpha(0.58)
      .png()
      .toBuffer();
    const watermarked = await sharp(preview)
      .composite([{ input: watermark, gravity: "centre", blend: "over" }])
      .jpeg({ quality: 82 })
      .toBuffer();
    const results = await Promise.all([
      service.storage
        .from("hike-previews")
        .upload(photo.preview_path, preview, {
          contentType: "image/jpeg",
          upsert: true,
        }),
      service.storage
        .from("hike-previews")
        .upload(photo.thumbnail_path, thumbnail, {
          contentType: "image/jpeg",
          upsert: true,
        }),
      service.storage
        .from("hike-watermarked")
        .upload(photo.watermarked_path, watermarked, {
          contentType: "image/jpeg",
          upsert: true,
        }),
    ]);
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
    await service
      .from("photos")
      .update({
        processing_status: "READY",
        processing_error: null,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
      })
      .eq("id", id);
    return Response.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error de procesamiento";
    await service
      .from("photos")
      .update({ processing_status: "ERROR", processing_error: message })
      .eq("id", id);
    return Response.json({ error: message }, { status: 500 });
  }
}

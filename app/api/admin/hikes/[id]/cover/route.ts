import { z } from "zod";
import { adminClient } from "../../route";

const idSchema = z.string().uuid();
const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Hike inválido." }, { status: 400 });
  }
  const supabase = await adminClient();
  if (!supabase) return Response.json({ error: "No autorizado." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const cover = form?.get("cover");
  if (!(cover instanceof File)) {
    return Response.json({ error: "Selecciona una imagen de portada." }, { status: 400 });
  }
  const extension = allowedTypes.get(cover.type);
  if (!extension) {
    return Response.json({ error: "Usa una imagen JPG, PNG o WebP." }, { status: 400 });
  }
  if (cover.size > 10 * 1024 * 1024) {
    return Response.json({ error: "La imagen no puede superar 10 MB." }, { status: 400 });
  }
  const { data: hike } = await supabase
    .from("hikes")
    .select("cover_path")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!hike) return Response.json({ error: "No encontramos el hike." }, { status: 404 });

  const path = `${id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("hike-covers")
    .upload(path, await cover.arrayBuffer(), {
      contentType: cover.type,
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError) {
    return Response.json({ error: "No pudimos subir la portada." }, { status: 400 });
  }
  const { error: updateError } = await supabase
    .from("hikes")
    .update({ cover_path: path })
    .eq("id", id);
  if (updateError) {
    await supabase.storage.from("hike-covers").remove([path]);
    return Response.json({ error: "La portada subió, pero no pudo guardarse." }, { status: 400 });
  }
  if (hike.cover_path?.startsWith(`${id}/`)) {
    await supabase.storage.from("hike-covers").remove([hike.cover_path]);
  }
  const { data } = supabase.storage.from("hike-covers").getPublicUrl(path);
  return Response.json({ coverUrl: data.publicUrl, path });
}

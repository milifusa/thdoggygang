import { z } from "zod";
import { adminClient } from "../../hikes/route";

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(request: Request) {
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const kind = z.enum(["hero", "how"]).safeParse(form?.get("kind"));
  const image = form?.get("image");
  if (!kind.success || !(image instanceof File))
    return Response.json(
      { error: "Selecciona la sección y una imagen." },
      { status: 400 },
    );
  const extension = allowedTypes.get(image.type);
  if (!extension)
    return Response.json(
      { error: "Usa una imagen JPG, PNG o WebP." },
      { status: 400 },
    );
  if (image.size > 15 * 1024 * 1024)
    return Response.json(
      { error: "La imagen no puede superar 15 MB." },
      { status: 400 },
    );
  const column = kind.data === "hero" ? "hero_image_path" : "how_image_path";
  const { data: current } = await supabase
    .from("site_content")
    .select(column)
    .eq("id", "landing")
    .maybeSingle();
  const path = `landing/${kind.data}-${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("site-assets")
    .upload(path, await image.arrayBuffer(), {
      contentType: image.type,
      cacheControl: "31536000",
    });
  if (uploadError)
    return Response.json(
      { error: "No pudimos subir la imagen." },
      { status: 400 },
    );
  const { error: updateError } = await supabase
    .from("site_content")
    .upsert(
      { id: "landing", [column]: path, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
  if (updateError) {
    await supabase.storage.from("site-assets").remove([path]);
    return Response.json(
      { error: "La imagen subió, pero no pudo guardarse." },
      { status: 400 },
    );
  }
  const oldPath = (current as Record<string, unknown> | null)?.[column];
  if (
    typeof oldPath === "string" &&
    oldPath.startsWith(`landing/${kind.data}-`)
  )
    await supabase.storage.from("site-assets").remove([oldPath]);
  const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
  return Response.json({ ok: true, url: data.publicUrl });
}

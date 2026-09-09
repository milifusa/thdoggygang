import sharp from "sharp";
import { z } from "zod";
import { adminClient } from "../../../hikes/route";

const types = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
export async function POST(request: Request) {
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const kind = z.enum(["desktop", "mobile"]).safeParse(form?.get("kind"));
  const image = form?.get("image");
  if (!kind.success || !(image instanceof File))
    return Response.json({ error: "Selecciona una imagen." }, { status: 400 });
  const extension = types.get(image.type);
  if (!extension || image.size > 15 * 1024 * 1024)
    return Response.json(
      { error: "Usa JPG, PNG o WebP de máximo 15 MB." },
      { status: 400 },
    );
  const buffer = Buffer.from(await image.arrayBuffer());
  let info;
  try {
    info = await sharp(buffer).metadata();
  } catch {
    return Response.json(
      { error: "El archivo no es una imagen válida." },
      { status: 400 },
    );
  }
  const column =
    kind.data === "desktop" ? "hero_image_path" : "mobile_image_path";
  const { data: current } = await supabase
    .from("site_content")
    .select(`${column},image_metadata`)
    .eq("id", "login")
    .maybeSingle();
  const path = `login/${kind.data}-${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("site-assets")
    .upload(path, buffer, {
      contentType: image.type,
      cacheControl: "31536000",
    });
  if (uploadError)
    return Response.json(
      { error: "No pudimos subir la imagen." },
      { status: 400 },
    );
  const oldMeta =
    current?.image_metadata && typeof current.image_metadata === "object"
      ? (current.image_metadata as Record<string, unknown>)
      : {};
  const metadata = {
    ...oldMeta,
    [`${kind.data}Name`]: image.name,
    [`${kind.data}Bytes`]: image.size,
    [`${kind.data}Width`]: info.width,
    [`${kind.data}Height`]: info.height,
  };
  const { error } = await supabase.from("site_content").upsert(
    {
      id: "login",
      [column]: path,
      image_metadata: metadata,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) {
    await supabase.storage.from("site-assets").remove([path]);
    return Response.json(
      { error: "La imagen subió, pero no pudo publicarse." },
      { status: 400 },
    );
  }
  const previous = (current as Record<string, unknown> | null)?.[column];
  if (
    typeof previous === "string" &&
    previous.startsWith(`login/${kind.data}-`)
  )
    await supabase.storage.from("site-assets").remove([previous]);
  return Response.json({ ok: true, metadata });
}

export async function DELETE(request: Request) {
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const kind = z
    .enum(["desktop", "mobile"])
    .safeParse(new URL(request.url).searchParams.get("kind"));
  if (!kind.success)
    return Response.json({ error: "Imagen inválida." }, { status: 400 });
  const column =
    kind.data === "desktop" ? "hero_image_path" : "mobile_image_path";
  const { data: current } = await supabase
    .from("site_content")
    .select(column)
    .eq("id", "login")
    .maybeSingle();
  const previous = (current as Record<string, unknown> | null)?.[column];
  const { error } = await supabase
    .from("site_content")
    .update({ [column]: null, updated_at: new Date().toISOString() })
    .eq("id", "login");
  if (error) return Response.json({ error: error.message }, { status: 400 });
  if (
    typeof previous === "string" &&
    previous.startsWith(`login/${kind.data}-`)
  )
    await supabase.storage.from("site-assets").remove([previous]);
  return Response.json({ ok: true });
}

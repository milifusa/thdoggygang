import sharp from "sharp";
import { isEmailTemplateKey } from "../../../../../lib/email-template-config";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

const types = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

async function adminClient() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return profile?.active && profile.role === "ADMIN" ? supabase : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!isEmailTemplateKey(key))
    return Response.json({ error: "Plantilla inválida." }, { status: 404 });
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof File))
    return Response.json({ error: "Selecciona una imagen." }, { status: 400 });
  const extension = types.get(image.type);
  if (!extension || image.size > 8 * 1024 * 1024)
    return Response.json(
      { error: "Usa JPG, PNG o WebP de máximo 8 MB." },
      { status: 400 },
    );
  const buffer = Buffer.from(await image.arrayBuffer());
  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) throw new Error("invalid");
  } catch {
    return Response.json(
      { error: "El archivo no es una imagen válida." },
      { status: 400 },
    );
  }
  const { data: current } = await supabase
    .from("email_templates")
    .select("image_path")
    .eq("key", key)
    .maybeSingle();
  const path = `${key.toLowerCase()}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("email-assets")
    .upload(path, buffer, {
      contentType: image.type,
      cacheControl: "31536000",
    });
  if (uploadError)
    return Response.json(
      { error: "No pudimos subir la fotografía." },
      { status: 400 },
    );
  const { error } = await supabase
    .from("email_templates")
    .update({ image_path: path, updated_at: new Date().toISOString() })
    .eq("key", key);
  if (error) {
    await supabase.storage.from("email-assets").remove([path]);
    return Response.json(
      { error: "La imagen subió, pero no pudo publicarse." },
      { status: 400 },
    );
  }
  if (current?.image_path)
    await supabase.storage.from("email-assets").remove([current.image_path]);
  const { data } = supabase.storage.from("email-assets").getPublicUrl(path);
  return Response.json({ ok: true, imagePath: path, imageUrl: data.publicUrl });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!isEmailTemplateKey(key))
    return Response.json({ error: "Plantilla inválida." }, { status: 404 });
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { data: current } = await supabase
    .from("email_templates")
    .select("image_path")
    .eq("key", key)
    .maybeSingle();
  const { error } = await supabase
    .from("email_templates")
    .update({ image_path: null, updated_at: new Date().toISOString() })
    .eq("key", key);
  if (error)
    return Response.json({ error: "No pudimos restaurar la imagen." }, { status: 400 });
  if (current?.image_path)
    await supabase.storage.from("email-assets").remove([current.image_path]);
  return Response.json({ ok: true });
}

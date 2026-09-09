import { z } from "zod";
import { adminClient } from "../hikes/route";

const schema = z.object({
  name: z.string().min(2).max(140),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().min(10).max(2000),
  category: z.string().min(2).max(100),
  priceCents: z.number().int().min(0),
  stock: z.number().int().min(0),
  variants: z.array(z.string().min(1).max(80)).max(30),
  pickupEnabled: z.boolean(),
  shippingEnabled: z.boolean(),
  shippingFeeCents: z.number().int().min(0),
  active: z.boolean(),
});

async function parseProductForm(request: Request) {
  const form = await request.formData();
  const values = String(form.get("variants") ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const parsed = schema.safeParse({
    name: form.get("name"),
    slug: form.get("slug"),
    description: form.get("description"),
    category: form.get("category"),
    priceCents: Math.round(Number(form.get("price")) * 100),
    stock: Number(form.get("stock")),
    variants: values,
    pickupEnabled: form.get("pickupEnabled") === "on",
    shippingEnabled: form.get("shippingEnabled") === "on",
    shippingFeeCents: Math.round(Number(form.get("shippingFee") ?? 0) * 100),
    active: form.get("active") === "on",
  });
  return { form, parsed };
}
async function uploadImage(
  supabase: NonNullable<Awaited<ReturnType<typeof adminClient>>>,
  image: FormDataEntryValue | null,
  productId: string,
) {
  if (!(image instanceof File) || !image.size) return null;
  const ext =
    image.type === "image/png"
      ? "png"
      : image.type === "image/webp"
        ? "webp"
        : image.type === "image/jpeg"
          ? "jpg"
          : null;
  if (!ext || image.size > 10 * 1024 * 1024)
    throw new Error("Usa una imagen JPG, PNG o WebP de máximo 10 MB.");
  const path = `${productId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, await image.arrayBuffer(), {
      contentType: image.type,
      cacheControl: "31536000",
    });
  if (error) throw new Error("No pudimos subir la imagen.");
  return path;
}
export async function POST(request: Request) {
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { form, parsed } = await parseProductForm(request);
  if (!parsed.success)
    return Response.json(
      { error: "Revisa los datos del producto." },
      { status: 400 },
    );
  const id = crypto.randomUUID();
  let imagePath: string | null = null;
  try {
    imagePath = await uploadImage(supabase, form.get("image"), id);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Imagen inválida." },
      { status: 400 },
    );
  }
  const v = parsed.data;
  const { data, error } = await supabase
    .from("products")
    .insert({
      id,
      name: v.name,
      slug: v.slug,
      description: v.description,
      category: v.category,
      price_cents: v.priceCents,
      stock: v.stock,
      variants: v.variants,
      image_path: imagePath,
      pickup_enabled: v.pickupEnabled,
      shipping_enabled: v.shippingEnabled,
      shipping_fee_cents: v.shippingFeeCents,
      active: v.active,
    })
    .select("id")
    .single();
  return error
    ? Response.json(
        {
          error: error.code === "23505" ? "Ese slug ya existe." : error.message,
        },
        { status: 400 },
      )
    : Response.json({ product: data }, { status: 201 });
}
export { parseProductForm, uploadImage };

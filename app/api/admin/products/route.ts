import { z } from "zod";
import { adminClient } from "../hikes/route";
import { productImageUrl } from "../../../lib/products";

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

function normalizeSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function productFormError(error: z.ZodError) {
  const field = String(error.issues[0]?.path[0] ?? "producto");
  const messages: Record<string, string> = {
    name: "Escribe un nombre de al menos 2 caracteres.",
    slug: "El nombre no permite crear una dirección válida.",
    description: "La descripción debe tener entre 10 y 2,000 caracteres.",
    category: "Escribe una categoría válida.",
    priceCents: "El precio debe ser un número válido mayor o igual a cero.",
    stock: "El inventario debe ser un número entero mayor o igual a cero.",
    variants: "Revisa las variantes; sepáralas con comas.",
    shippingFeeCents: "El costo de envío debe ser un número válido.",
  };
  return messages[field] ?? "Revisa los datos del producto.";
}

async function parseProductForm(request: Request) {
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const requestedSlug = String(form.get("slug") ?? "").trim();
  const values = String(form.get("variants") ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const parsed = schema.safeParse({
    name,
    slug: normalizeSlug(requestedSlug || name),
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

function productResponse(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: String(row.description),
    category: String(row.category),
    price_cents: Number(row.price_cents),
    stock: Number(row.stock),
    variants: Array.isArray(row.variants) ? row.variants.map(String) : [],
    image: productImageUrl(
      typeof row.image_path === "string" ? row.image_path : null,
    ),
    pickup_enabled: Boolean(row.pickup_enabled),
    shipping_enabled: Boolean(row.shipping_enabled),
    shipping_fee_cents: Number(row.shipping_fee_cents ?? 0),
    active: Boolean(row.active),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}
export async function POST(request: Request) {
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { form, parsed } = await parseProductForm(request);
  if (!parsed.success)
    return Response.json(
      { error: productFormError(parsed.error) },
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
    .select("*")
    .single();
  if (error && imagePath)
    await supabase.storage.from("product-images").remove([imagePath]);
  return error
    ? Response.json(
        {
          error:
            error.code === "23505"
              ? "Ya existe un producto con ese nombre o dirección. Cambia uno de los dos."
              : error.message,
        },
        { status: 400 },
      )
    : Response.json(
        { product: productResponse(data as Record<string, unknown>) },
        { status: 201 },
      );
}
export {
  normalizeSlug,
  parseProductForm,
  productFormError,
  productResponse,
  uploadImage,
};

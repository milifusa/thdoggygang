import { z } from "zod";
import { adminClient } from "../../hikes/route";
const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum([
    "FREE_WATERMARKED",
    "FREE_ORIGINAL",
    "PAID",
    "HIDE",
    "PUBLISH",
    "DELETE",
  ]),
  priceCents: z.number().int().min(0).optional(),
});
export async function PATCH(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Selecciona fotos y una acción válida." },
      { status: 400 },
    );
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { data: photos } =
    parsed.data.action === "DELETE"
      ? await supabase
          .from("photos")
          .select(
            "original_path,preview_path,thumbnail_path,watermarked_path",
          )
          .in("id", parsed.data.ids)
          .is("deleted_at", null)
      : { data: null };
  const map: Record<string, unknown> =
    parsed.data.action === "DELETE"
      ? { deleted_at: new Date().toISOString() }
      : parsed.data.action === "HIDE"
        ? { hidden: true }
        : parsed.data.action === "PUBLISH"
          ? { hidden: false }
          : parsed.data.action === "PAID"
            ? { access: "PAID", price_cents: parsed.data.priceCents ?? 9000 }
            : { access: parsed.data.action, price_cents: 0, hidden: false };
  const { error } = await supabase
    .from("photos")
    .update(map)
    .in("id", parsed.data.ids);
  if (!error && parsed.data.action === "DELETE" && photos?.length)
    await Promise.all([
      supabase.storage
        .from("hike-originals")
        .remove(photos.map((photo) => photo.original_path)),
      supabase.storage.from("hike-previews").remove(
        photos.flatMap((photo) => [
          photo.preview_path,
          photo.thumbnail_path,
        ]),
      ),
      supabase.storage
        .from("hike-watermarked")
        .remove(photos.map((photo) => photo.watermarked_path)),
    ]);
  return error
    ? Response.json({ error: error.message }, { status: 400 })
    : Response.json({ ok: true });
}

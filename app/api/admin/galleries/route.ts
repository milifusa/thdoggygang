import { z } from "zod";
import { adminClient } from "../hikes/route";
const schema = z.object({
  hikeId: z.string().uuid(),
  published: z.boolean(),
  defaultPriceCents: z.number().int().min(0),
  package5Cents: z.number().int().min(0).nullable(),
  package10Cents: z.number().int().min(0).nullable(),
  fullGalleryCents: z.number().int().min(0).nullable(),
  coverPhotoId: z.string().uuid().nullable(),
});
export async function PATCH(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Revisa la configuración de galería." },
      { status: 400 },
    );
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { error } = await supabase.from("hike_galleries").upsert(
    {
      hike_id: parsed.data.hikeId,
      title: "Galería The Doggy Gang",
      published_at: parsed.data.published ? new Date().toISOString() : null,
      default_photo_price_cents: parsed.data.defaultPriceCents,
      package_5_price_cents: parsed.data.package5Cents,
      package_10_price_cents: parsed.data.package10Cents,
      full_gallery_price_cents: parsed.data.fullGalleryCents,
      cover_photo_id: parsed.data.coverPhotoId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "hike_id" },
  );
  return error
    ? Response.json({ error: error.message }, { status: 400 })
    : Response.json({ ok: true });
}

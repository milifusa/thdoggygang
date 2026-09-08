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
  return error
    ? Response.json({ error: error.message }, { status: 400 })
    : Response.json({ ok: true });
}

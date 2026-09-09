import { z } from "zod";
import { adminClient } from "../hikes/route";
const schema = z.object({
  shippingFeeCents: z.number().int().min(0).max(1000000),
  freeShippingThresholdCents: z.number().int().min(0).max(10000000).nullable(),
  shippingNote: z.string().trim().min(5).max(500),
});
export async function PATCH(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Revisa los costos y el texto de envío." },
      { status: 400 },
    );
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { error } = await supabase
    .from("shop_settings")
    .upsert({
      id: 1,
      shipping_fee_cents: parsed.data.shippingFeeCents,
      free_shipping_threshold_cents: parsed.data.freeShippingThresholdCents,
      shipping_note: parsed.data.shippingNote,
      updated_at: new Date().toISOString(),
    });
  return error
    ? Response.json(
        { error: "No pudimos guardar la configuración." },
        { status: 400 },
      )
    : Response.json({ ok: true });
}

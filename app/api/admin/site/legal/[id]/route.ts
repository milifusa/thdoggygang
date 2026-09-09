import { z } from "zod";
import { adminClient } from "../../../hikes/route";
const schema = z.object({
  eyebrow: z.string().trim().min(2).max(80),
  title: z.string().trim().min(3).max(160),
  intro: z.string().trim().min(20).max(3000),
  sections: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(160),
        body: z.string().trim().min(20).max(5000),
      }),
    )
    .min(1)
    .max(8),
});
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!["terms", "privacy"].includes(id))
    return Response.json({ error: "Página inválida." }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Revisa todos los textos legales." },
      { status: 400 },
    );
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { error } = await supabase
    .from("site_content")
    .upsert({ id, content: parsed.data, updated_at: new Date().toISOString() });
  return error
    ? Response.json({ error: "No pudimos guardar la página." }, { status: 400 })
    : Response.json({ ok: true });
}

import { z } from "zod";
import { adminClient } from "../../hikes/route";

const idSchema = z.string().uuid();
const schema = z.object({ title: z.string().max(160).nullable(), caption: z.string().max(1000).nullable(), access: z.enum(["FREE_WATERMARKED","FREE_ORIGINAL","PAID"]), priceCents: z.number().int().min(0) });

export async function PATCH(request: Request, { params }: { params: Promise<{id:string}> }) {
  const { id } = await params; if (!idSchema.safeParse(id).success) return Response.json({ error: "Foto inválida." }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Revisa los datos de la foto." }, { status: 400 });
  const supabase = await adminClient(); if (!supabase) return Response.json({ error: "No autorizado." }, { status: 403 });
  const { error } = await supabase.from("photos").update({ title: parsed.data.title, caption: parsed.data.caption, access: parsed.data.access, price_cents: parsed.data.access === "PAID" ? parsed.data.priceCents : 0 }).eq("id", id).is("deleted_at", null);
  return error ? Response.json({ error: error.message }, { status: 400 }) : Response.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{id:string}> }) {
  const { id } = await params; if (!idSchema.safeParse(id).success) return Response.json({ error: "Foto inválida." }, { status: 400 });
  const supabase = await adminClient(); if (!supabase) return Response.json({ error: "No autorizado." }, { status: 403 });
  const { error } = await supabase.from("photos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  return error ? Response.json({ error: error.message }, { status: 400 }) : Response.json({ ok: true });
}

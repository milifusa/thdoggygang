import { z } from "zod";
import { createSupabaseServerClient } from "../../lib/supabase/server";

const schema = z.object({
  bookingId: z.string().uuid(),
  itemKey: z.enum(["GEAR","WATER","FOOD","ID","DOG_TAG","VACCINES","ROUTE_SAVED"]),
  completed: z.boolean(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Elemento inválido." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Tu sesión expiró." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();
  if (!profile) return Response.json({ error: "Perfil no encontrado." }, { status: 404 });
  if (parsed.data.completed) {
    const { error } = await supabase.from("adventure_checklist_items").upsert({ booking_id: parsed.data.bookingId, profile_id: profile.id, item_key: parsed.data.itemKey });
    if (error) return Response.json({ error: "No pudimos guardar el avance." }, { status: 400 });
  } else {
    const { error } = await supabase.from("adventure_checklist_items").delete().eq("booking_id", parsed.data.bookingId).eq("profile_id", profile.id).eq("item_key", parsed.data.itemKey);
    if (error) return Response.json({ error: "No pudimos actualizar el avance." }, { status: 400 });
  }
  return Response.json({ ok: true });
}

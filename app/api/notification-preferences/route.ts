import { z } from "zod";
import { createSupabaseServerClient } from "../../lib/supabase/server";

const schema = z.object({
  emailEnabled: z.boolean(), reminder7d: z.boolean(), reminder1d: z.boolean(), routeChanges: z.boolean(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Preferencias inválidas." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Tu sesión expiró." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();
  if (!profile) return Response.json({ error: "Perfil no encontrado." }, { status: 404 });
  const { error } = await supabase.from("member_notification_preferences").upsert({ profile_id: profile.id, email_enabled: parsed.data.emailEnabled, reminder_7d: parsed.data.reminder7d, reminder_1d: parsed.data.reminder1d, route_changes: parsed.data.routeChanges });
  if (error) return Response.json({ error: "No pudimos guardar tus preferencias." }, { status: 400 });
  return Response.json({ ok: true });
}

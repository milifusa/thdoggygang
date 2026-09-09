import { z } from "zod";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../lib/supabase/service";

const schema = z.object({ code: z.string().trim().min(6).max(20).transform((value) => value.toUpperCase()) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Código inválido." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Inicia sesión." }, { status: 401 });
  const service = createSupabaseServiceClient();
  const [{ data: member }, { data: referrer }] = await Promise.all([
    service.from("profiles").select("id,referred_by").eq("auth_user_id", user.id).single(),
    service.from("profiles").select("id").eq("referral_code", parsed.data.code).eq("active", true).is("deleted_at", null).maybeSingle(),
  ]);
  if (!member || !referrer) return Response.json({ error: "No encontramos ese código." }, { status: 404 });
  if (member.id === referrer.id) return Response.json({ error: "No puedes usar tu propio código." }, { status: 409 });
  if (member.referred_by) return Response.json({ error: "Tu cuenta ya tiene una invitación registrada." }, { status: 409 });
  const { count } = await service.from("bookings").select("id", { count: "exact", head: true }).eq("profile_id", member.id).eq("status", "COMPLETED");
  if ((count ?? 0) > 0) return Response.json({ error: "El código debe registrarse antes de completar tu primera aventura." }, { status: 409 });
  const { error } = await service.from("profiles").update({ referred_by: referrer.id }).eq("id", member.id).is("referred_by", null);
  if (error) return Response.json({ error: "No pudimos registrar la invitación." }, { status: 400 });
  return Response.json({ ok: true });
}

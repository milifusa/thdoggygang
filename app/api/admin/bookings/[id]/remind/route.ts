import { sendBookingReminder } from "../../../../../lib/server/booking-reminder";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("id,role,active").eq("auth_user_id", user.id).single();
  if (!profile?.active || profile.role !== "ADMIN") return Response.json({ error: "No autorizado." }, { status: 403 });
  try { return Response.json(await sendBookingReminder(id, profile.id)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No pudimos enviar el recordatorio." }, { status: 409 }); }
}

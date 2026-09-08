import { z } from "zod";
import { sendBookingReminder } from "../../../../lib/server/booking-reminder";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

const schema = z.object({ bookingIds: z.array(z.string().uuid()).min(1).max(100) });
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Selección inválida." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("id,role,active").eq("auth_user_id", user.id).single();
  if (!profile?.active || profile.role !== "ADMIN") return Response.json({ error: "No autorizado." }, { status: 403 });
  const results=[];
  for (const bookingId of parsed.data.bookingIds) {
    try { results.push({ bookingId, ...(await sendBookingReminder(bookingId,profile.id)) }); }
    catch (error) { results.push({ bookingId,ok:false,error:error instanceof Error?error.message:"No enviado" }); }
  }
  return Response.json({ ok:results.every((item)=>item.ok),results });
}

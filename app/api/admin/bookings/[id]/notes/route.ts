import { z } from "zod";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
const schema = z.object({ body: z.string().trim().min(2).max(2000) });
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Escribe una nota válida." },
      { status: 400 },
    );
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,role,active")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile?.active || profile.role !== "ADMIN")
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { id } = await params;
  const { error } = await supabase
    .from("admin_notes")
    .insert({
      booking_id: id,
      author_profile_id: profile.id,
      body: parsed.data.body,
    });
  if (error)
    return Response.json(
      { error: "No pudimos guardar la nota." },
      { status: 400 },
    );
  return Response.json({ ok: true });
}

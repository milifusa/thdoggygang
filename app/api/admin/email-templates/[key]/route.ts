import { z } from "zod";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

const schema = z.object({
  subject: z.string().min(3).max(180),
  heading: z.string().min(3).max(180),
  body: z.string().min(10).max(5000),
  buttonLabel: z.string().min(2).max(100),
  active: z.boolean(),
});
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Revisa todos los textos de la plantilla." },
      { status: 400 },
    );
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile?.active || profile.role !== "ADMIN")
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { key } = await params;
  if (key !== "BOOKING_REMINDER")
    return Response.json({ error: "Plantilla inválida." }, { status: 404 });
  const { error } = await supabase
    .from("email_templates")
    .update({
      subject: parsed.data.subject,
      heading: parsed.data.heading,
      body: parsed.data.body,
      button_label: parsed.data.buttonLabel,
      active: parsed.data.active,
      updated_at: new Date().toISOString(),
    })
    .eq("key", key);
  return error
    ? Response.json(
        { error: "No pudimos guardar la plantilla." },
        { status: 400 },
      )
    : Response.json({ ok: true });
}

import { z } from "zod";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";

const schema = z.object({
  minimumNoticeHours: z.number().int().min(1).max(720),
  policyText: z.string().trim().min(20).max(3000),
  lateMessage: z.string().trim().min(20).max(1000),
});

export async function PATCH(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Revisa el plazo y los textos." }, { status: 400 });
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });
  const { data: admin } = await client.from("profiles").select("id,role,active").eq("auth_user_id", user.id).single();
  if (!admin?.active || admin.role !== "ADMIN")
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { error } = await createSupabaseServiceClient().from("cancellation_settings").upsert({
    id: 1,
    minimum_notice_hours: parsed.data.minimumNoticeHours,
    policy_text: parsed.data.policyText,
    late_message: parsed.data.lateMessage,
    updated_by: admin.id,
    updated_at: new Date().toISOString(),
  });
  if (error) return Response.json({ error: "No pudimos guardar la política." }, { status: 500 });
  return Response.json({ ok: true });
}

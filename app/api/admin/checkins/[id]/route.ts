import { z } from "zod";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../../lib/supabase/service";

const schema = z.object({ reason: z.string().min(5).max(500) });
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Escribe un motivo de al menos 5 caracteres." },
      { status: 400 },
    );
  const userClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });
  const { data: profile } = await userClient
    .from("profiles")
    .select("id,role,active")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile?.active || profile.role !== "ADMIN")
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Check-in inválido." }, { status: 400 });
  const service = createSupabaseServiceClient();
  const { data: checkin } = await service
    .from("check_ins")
    .select("id,booking_id,hike_id,booking_participant_id,checked_in_at,method")
    .eq("id", id)
    .single();
  if (!checkin)
    return Response.json(
      { error: "No encontramos el check-in." },
      { status: 404 },
    );
  const { error } = await service.from("check_ins").delete().eq("id", id);
  if (error)
    return Response.json(
      { error: "No pudimos corregir el check-in." },
      { status: 400 },
    );
  await Promise.all([
    service
      .from("booking_checkin_tokens")
      .update({ used_at: null })
      .eq("booking_id", checkin.booking_id)
      .is("revoked_at", null),
    service
      .from("audit_logs")
      .insert({
        actor_profile_id: profile.id,
        action: "CHECKIN_CORRECTED",
        entity_type: "booking",
        entity_id: checkin.booking_id,
        metadata: { reason: parsed.data.reason, removed_checkin: checkin },
      }),
  ]);
  return Response.json({ ok: true });
}

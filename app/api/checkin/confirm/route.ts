import { z } from "zod";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";
const schema = z.object({
  hikeId: z.string().uuid(),
  bookingId: z.string().uuid(),
  participantIds: z.array(z.string().uuid()).min(1),
  method: z.enum(["QR", "MANUAL"]),
  clientOperationId: z.string().uuid(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Datos de check-in inválidos" },
      { status: 400 },
    );
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, active")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile?.active || !["GUIDE", "ADMIN"].includes(profile.role))
    return Response.json({ error: "Perfil no autorizado" }, { status: 403 });
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, hike_id,status,booking_participants(id),signed_waivers(id,booking_participant_id)",
    )
    .eq("id", parsed.data.bookingId)
    .eq("hike_id", parsed.data.hikeId)
    .single();
  const allowedParticipantIds = new Set(
    booking?.booking_participants.map((participant) => participant.id) ?? [],
  );
  if (
    !booking ||
    booking.status !== "CONFIRMED" ||
    booking.signed_waivers.length < booking.booking_participants.length ||
    parsed.data.participantIds.some((id) => !allowedParticipantIds.has(id))
  )
    return Response.json(
      {
        error:
          "La reservación debe estar confirmada y tener todas sus responsivas.",
      },
      { status: 403 },
    );
  const rows = parsed.data.participantIds.map((participantId, index) => ({
    hike_id: parsed.data.hikeId,
    booking_id: parsed.data.bookingId,
    booking_participant_id: participantId,
    checked_in_by: profile.id,
    method: parsed.data.method,
    client_operation_id:
      index === 0 ? parsed.data.clientOperationId : crypto.randomUUID(),
  }));
  const { error } = await supabase
    .from("check_ins")
    .upsert(rows, {
      onConflict: "hike_id,booking_participant_id",
      ignoreDuplicates: true,
    });
  if (error)
    return Response.json(
      { error: "No pudimos registrar el check-in" },
      { status: 403 },
    );
  const service = createSupabaseServiceClient();
  const { count: checkedCount } = await service
    .from("check_ins")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", parsed.data.bookingId);
  if ((checkedCount ?? 0) >= booking.booking_participants.length)
    await service
      .from("booking_checkin_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("booking_id", parsed.data.bookingId)
      .is("revoked_at", null)
      .is("used_at", null);
  return Response.json({ ok: true, count: rows.length });
}

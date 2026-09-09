import { ensureBookingQrToken } from "../../../../../lib/domain/checkin-token";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../../../lib/supabase/service";

async function adminProfile() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,role,active")
    .eq("auth_user_id", user.id)
    .single();
  return profile?.active && profile.role === "ADMIN" ? profile : null;
}
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await adminProfile();
  if (!profile)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { id } = await params;
  try {
    return Response.json({ token: await ensureBookingQrToken(id) });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "No pudimos generar el QR.",
      },
      { status: 400 },
    );
  }
}
export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await adminProfile();
  if (!profile)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { id } = await params;
  const service = createSupabaseServiceClient();
  try {
    const eligibility = await service
      .from("bookings")
      .select("id,status,booking_participants(id),signed_waivers(id)")
      .eq("id", id)
      .single();
    if (
      !eligibility.data ||
      eligibility.data.status !== "CONFIRMED" ||
      eligibility.data.signed_waivers.length <
        eligibility.data.booking_participants.length
    )
      throw new Error(
        "La reservación debe estar confirmada y tener todas sus responsivas.",
      );
    await service
      .from("booking_checkin_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("booking_id", id)
      .is("revoked_at", null);
    const token = await ensureBookingQrToken(id);
    await service
      .from("audit_logs")
      .insert({
        actor_profile_id: profile.id,
        action: "BOOKING_QR_REGENERATED",
        entity_type: "booking",
        entity_id: id,
      });
    return Response.json({ token });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos regenerar el QR.",
      },
      { status: 400 },
    );
  }
}

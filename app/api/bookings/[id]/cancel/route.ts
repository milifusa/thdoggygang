import { z } from "zod";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../../lib/supabase/service";
import { getCancellationSettings } from "../../../../lib/server/member-credit";
import { closePendingPaymentsForBooking } from "../../../../lib/server/stripe-payment-reconciliation";

const schema = z.object({ reason: z.string().trim().min(10).max(1200) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Reservación inválida." }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Cuéntanos brevemente el motivo de la cancelación." },
      { status: 400 },
    );
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return Response.json({ error: "Tu sesión expiró." }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile)
    return Response.json(
      { error: "No encontramos tu perfil." },
      { status: 404 },
    );
  const { data: booking } = await supabase
    .from("bookings")
    .select("id,status,total_cents,hike:hikes(starts_at)")
    .eq("id", id)
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!booking)
    return Response.json(
      { error: "No encontramos esa reservación." },
      { status: 404 },
    );
  if (["CANCELLED", "COMPLETED"].includes(booking.status))
    return Response.json(
      { error: "Esta reservación ya no puede cancelarse." },
      { status: 409 },
    );
  const settings = await getCancellationSettings();
  const hike = Array.isArray(booking.hike) ? booking.hike[0] : booking.hike;
  const hoursRemaining = hike
    ? (new Date(hike.starts_at).getTime() - Date.now()) / 3_600_000
    : 0;
  if (hoursRemaining < settings.minimumNoticeHours)
    return Response.json(
      {
        error: `${settings.lateMessage} Faltan ${Math.max(0, Math.ceil(hoursRemaining))} horas para la aventura.`,
        code: "CANCELLATION_DEADLINE_PASSED",
      },
      { status: 409 },
    );
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc("cancel_booking_to_credit", {
    p_booking_id: booking.id,
    p_profile_id: profile.id,
    p_reason: parsed.data.reason,
    p_actor_profile_id: profile.id,
    p_enforce_deadline: true,
  });
  if (error)
    return Response.json(
      { error: "No pudimos completar la cancelación." },
      { status: 400 },
    );
  await closePendingPaymentsForBooking(booking.id).catch(() => null);
  const result = Array.isArray(data) ? data[0] : data;
  return Response.json({
    ok: true,
    status: "CANCELLED",
    creditAmountCents: result?.credit_amount_cents ?? 0,
  });
}

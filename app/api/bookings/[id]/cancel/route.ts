import { z } from "zod";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

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
    .select("id,status,total_cents,orders(payments(status,amount_cents))")
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
  const paid = (booking.orders ?? [])
    .flatMap((order) => order.payments ?? [])
    .filter((payment) => payment.status === "PAID")
    .reduce((sum, payment) => sum + payment.amount_cents, 0);
  if (
    booking.status === "DRAFT" ||
    (booking.status === "PENDING_PAYMENT" && paid === 0)
  ) {
    await supabase
      .from("bookings")
      .update({ status: "CANCELLED", cancelled_at: new Date().toISOString() })
      .eq("id", booking.id);
    return Response.json({ ok: true, status: "CANCELLED" });
  }
  const { error } = await supabase
    .from("booking_cancellation_requests")
    .insert({
      booking_id: booking.id,
      requested_by: profile.id,
      reason: parsed.data.reason,
      refundable_amount_cents: paid,
    });
  if (error?.code === "23505")
    return Response.json(
      { error: "Ya existe una solicitud de cancelación pendiente." },
      { status: 409 },
    );
  if (error)
    return Response.json(
      { error: "No pudimos registrar la solicitud." },
      { status: 400 },
    );
  return Response.json({ ok: true, status: "REQUESTED" });
}

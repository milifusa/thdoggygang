import { z } from "zod";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../../../lib/supabase/service";
import { sendWaitlistOfferForHike } from "../../../../../lib/server/booking-reminder";
import { closePendingPaymentsForBooking } from "../../../../../lib/server/stripe-payment-reconciliation";

const bodySchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  receivedAmountCents: z.number().int().min(0).max(100_000_000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success)
    return Response.json(
      { error: "Indica el importe recibido y el motivo del rechazo." },
      { status: 400 },
    );

  const userClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  const { data: admin } = user
    ? await userClient
        .from("profiles")
        .select("id,role,active")
        .eq("auth_user_id", user.id)
        .single()
    : { data: null };
  if (!admin?.active || admin.role !== "ADMIN")
    return Response.json({ error: "No autorizado." }, { status: 403 });

  const service = createSupabaseServiceClient();
  const { data: payment } = await service
    .from("payments")
    .select("id,method,status,amount_cents")
    .eq("id", id)
    .maybeSingle();
  if (!payment || payment.method !== "TRANSFER")
    return Response.json(
      { error: "La transferencia no está disponible para revisión." },
      { status: 409 },
    );
  if (payment.status !== "UNDER_REVIEW")
    return Response.json(
      { error: "Esta transferencia ya fue resuelta." },
      { status: 409 },
    );
  if (body.data.receivedAmountCents >= payment.amount_cents)
    return Response.json(
      {
        error:
          "Si recibiste el importe completo, usa APROBAR PAGO. El rechazo sólo admite importes menores.",
      },
      { status: 409 },
    );

  const { data, error } = await service.rpc(
    "reject_transfer_payment_to_credit",
    {
      p_payment_id: payment.id,
      p_received_amount_cents: body.data.receivedAmountCents,
      p_reason: body.data.reason,
      p_actor_profile_id: admin.id,
    },
  );
  if (error)
    return Response.json(
      { error: "No pudimos rechazar y conciliar la transferencia." },
      { status: 409 },
    );

  const result = Array.isArray(data) ? data[0] : data;
  if (result?.result_booking_id)
    await closePendingPaymentsForBooking(result.result_booking_id).catch(
      () => null,
    );
  if (result?.result_hike_id)
    await sendWaitlistOfferForHike(result.result_hike_id).catch(() => null);

  return Response.json({
    ok: true,
    creditAmountCents: result?.credit_amount_cents ?? 0,
  });
}

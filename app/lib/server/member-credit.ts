import "server-only";

import { createSupabaseServiceClient } from "../supabase/service";

export type CancellationSettings = {
  minimumNoticeHours: number;
  policyText: string;
  lateMessage: string;
};

const defaults: CancellationSettings = {
  minimumNoticeHours: 48,
  policyText:
    "Puedes cancelar hasta 48 horas antes del inicio. El importe pagado no se devuelve en efectivo: se acredita a tu cuenta para reservar otro hike.",
  lateMessage:
    "¡Ups! Por ahora ya no podemos darte la pata. Cuando faltan menos de 48 horas ya no podemos cancelar, porque toda la aventura se organizó contando contigo.",
};

export async function getCancellationSettings(): Promise<CancellationSettings> {
  const { data, error } = await createSupabaseServiceClient()
    .from("cancellation_settings")
    .select("minimum_notice_hours,policy_text,late_message")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return defaults;
  return {
    minimumNoticeHours: data.minimum_notice_hours,
    policyText: data.policy_text,
    lateMessage: data.late_message,
  };
}

export async function getMemberCreditBalance(profileId: string) {
  const { data, error } = await createSupabaseServiceClient()
    .from("member_credit_transactions")
    .select("amount_cents")
    .eq("profile_id", profileId)
    .in("status", ["RESERVED", "POSTED"]);
  if (error) return 0;
  return Math.max(
    0,
    (data ?? []).reduce((sum, transaction) => sum + transaction.amount_cents, 0),
  );
}

export async function reserveMemberCredit({
  bookingId,
  profileId,
  maximumCents,
  enabled,
}: {
  bookingId: string;
  profileId: string;
  maximumCents: number;
  enabled: boolean;
}) {
  const service = createSupabaseServiceClient();
  const { data, error } = enabled
    ? await service.rpc("reserve_booking_credit", {
        p_booking_id: bookingId,
        p_profile_id: profileId,
        p_max_amount_cents: Math.max(0, Math.floor(maximumCents)),
      })
    : await service.rpc("release_booking_credit", {
        p_booking_id: bookingId,
      });
  if (error) throw new Error("No pudimos aplicar el crédito de tu manada.");
  return typeof data === "number" ? data : 0;
}

export async function commitMemberCredit(bookingId: string) {
  const { data, error } = await createSupabaseServiceClient().rpc(
    "commit_booking_credit",
    { p_booking_id: bookingId },
  );
  if (error) throw new Error("No pudimos confirmar el crédito utilizado.");
  return typeof data === "number" ? data : 0;
}

import { z } from "zod";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../../../lib/supabase/service";
import { resendTrackedEmail } from "../../../../../lib/server/email-resend";
import { executeIdempotentJson } from "../../../../../lib/server/idempotency";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Correo inválido." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: admin } = user
    ? await supabase
        .from("profiles")
        .select("id,role,active")
        .eq("auth_user_id", user.id)
        .single()
    : { data: null };
  if (!admin?.active || admin.role !== "ADMIN")
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const service = createSupabaseServiceClient();
  const { data: delivery } = await service
    .from("email_deliveries")
    .select("id,template_key,recipient,booking_id,profile_id,metadata")
    .eq("id", id)
    .single();
  if (!delivery)
    return Response.json(
      { error: "No encontramos ese correo." },
      { status: 404 },
    );
  const requestKey =
    request.headers.get("idempotency-key") ?? crypto.randomUUID();
  return executeIdempotentJson({
    request,
    operation: "email.resend",
    actorProfileId: admin.id,
    payload: { deliveryId: id },
    handler: async () => {
      try {
        const result = await resendTrackedEmail({
          delivery: {
            ...delivery,
            metadata: (delivery.metadata ?? {}) as Record<string, unknown>,
          },
          actorProfileId: admin.id,
          idempotencyKey: requestKey,
        });
        return Response.json({
          ok: true,
          recipient: delivery.recipient,
          result,
        });
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "No pudimos reenviar el correo.",
          },
          { status: 409 },
        );
      }
    },
  });
}

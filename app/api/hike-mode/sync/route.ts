import { z } from "zod";
import { hashSignedToken, verifySignedPayload } from "../../../lib/security/signed-token";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";

const operationSchema = z.object({
  operationId: z.string().uuid(),
  hikeId: z.string().uuid(),
  bookingId: z.string().uuid().optional(),
  participantId: z.string().uuid().optional(),
  orderItemId: z.string().uuid().optional(),
  type: z.enum(["CHECK_IN", "PRODUCT_DELIVERY", "TRANSPORT_COMPLETE", "NOTE"]),
  deviceId: z.string().min(8).max(160),
  clientTimestamp: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()).optional(),
});
const bodySchema = z.object({ authorization: z.string().min(80), operations: z.array(operationSchema).min(1).max(100) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Operaciones inválidas." }, { status: 400 });
  const userClient = await createSupabaseServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });
  const { data: profile } = await userClient.from("profiles").select("id,role,active").eq("auth_user_id", user.id).single();
  if (!profile?.active || !["ADMIN", "GUIDE"].includes(profile.role)) return Response.json({ error: "No autorizado." }, { status: 403 });

  const authPayload = await verifySignedPayload(parsed.data.authorization);
  if (!authPayload || authPayload.purpose !== "hike-offline" || authPayload.profileId !== profile.id) return Response.json({ error: "La autorización offline venció o no es válida." }, { status: 403 });
  if (parsed.data.operations.some((operation) => operation.hikeId !== authPayload.hikeId || operation.deviceId !== authPayload.deviceId)) return Response.json({ error: "El paquete no corresponde a este dispositivo o hike." }, { status: 403 });

  const service = createSupabaseServiceClient();
  const { data: storedAuthorization } = await service.from("hike_offline_authorizations").select("id,revoked_at,expires_at").eq("id", authPayload.authorizationId).eq("token_hash", await hashSignedToken(parsed.data.authorization)).single();
  if (!storedAuthorization || storedAuthorization.revoked_at || new Date(storedAuthorization.expires_at).getTime() < Date.now()) return Response.json({ error: "La autorización offline ya no está activa." }, { status: 403 });

  const results = [];
  for (const operation of parsed.data.operations) {
    const { data, error } = await service.rpc("apply_hike_offline_operation", { p_operation: operation, p_actor: profile.id });
    results.push({ operationId: operation.operationId, ok: !error, result: data, error: error?.message });
  }
  await service.from("hike_offline_authorizations").update({ last_synced_at: new Date().toISOString() }).eq("id", authPayload.authorizationId);
  return Response.json({ ok: results.every((result) => result.ok), results, syncedAt: new Date().toISOString() });
}

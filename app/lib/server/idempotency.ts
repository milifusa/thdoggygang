import "server-only";

import { createSupabaseServiceClient } from "../supabase/service";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  return value;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function responsePayload(response: Response) {
  const text = await response.clone().text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text.slice(0, 4000) };
  }
}

export async function executeIdempotentJson({
  request,
  operation,
  actorProfileId,
  payload,
  handler,
}: {
  request: Request;
  operation: string;
  actorProfileId?: string | null;
  payload: unknown;
  handler: () => Promise<Response>;
}) {
  const requestHash = await sha256(
    JSON.stringify(stableValue(payload)) ?? "null",
  );
  const suppliedKey = request.headers.get("idempotency-key")?.trim();
  if (suppliedKey && !/^[A-Za-z0-9._:/-]{8,240}$/u.test(suppliedKey))
    return Response.json(
      { error: "La clave de operación no es válida." },
      { status: 400 },
    );
  const fiveMinuteBucket = Math.floor(Date.now() / 300_000);
  const key =
    suppliedKey ??
    `auto:${await sha256(
      `${operation}|${actorProfileId ?? "anonymous"}|${requestHash}|${fiveMinuteBucket}`,
    )}`;
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc("claim_idempotent_operation", {
    p_operation: operation,
    p_idempotency_key: key,
    p_request_hash: requestHash,
    p_actor_profile_id: actorProfileId ?? null,
  });
  const claim = Array.isArray(data) ? data[0] : data;
  if (error || !claim?.operation_id)
    return Response.json(
      { error: "No pudimos proteger esta operación. Intenta de nuevo." },
      { status: 503 },
    );
  if (claim.claim_state === "MISMATCH")
    return Response.json(
      { error: "Esta acción cambió. Vuelve a intentarla desde la pantalla." },
      { status: 409 },
    );
  if (claim.claim_state === "IN_PROGRESS")
    return Response.json(
      { error: "Esta acción ya se está procesando. Espera un momento." },
      { status: 409 },
    );
  if (claim.claim_state === "REPLAY")
    return Response.json(claim.stored_response_body ?? {}, {
      status: claim.stored_response_status ?? 200,
      headers: { "x-idempotent-replay": "true" },
    });

  try {
    const response = await handler();
    const body = await responsePayload(response);
    const rpc = response.ok
      ? "complete_idempotent_operation"
      : "fail_idempotent_operation";
    await service.rpc(rpc, {
      p_operation_id: claim.operation_id,
      p_response_status: response.status,
      p_response_body: body,
      ...(response.ok
        ? {}
        : {
            p_error_message:
              typeof body.error === "string" ? body.error : "Request failed",
          }),
    });
    return response;
  } catch (error) {
    await service.rpc("fail_idempotent_operation", {
      p_operation_id: claim.operation_id,
      p_response_status: 500,
      p_response_body: { error: "La operación no terminó." },
      p_error_message:
        error instanceof Error ? error.message : "Unhandled operation error",
    });
    throw error;
  }
}

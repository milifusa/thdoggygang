import { z } from "zod";
import { safeReturnPath } from "../../../lib/auth/destination";
import { sendBrandedEmail } from "../../../lib/server/email-renderer";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  next: z.string().max(500).optional(),
});

async function hash(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Escribe un correo válido." }, { status: 400 });
  const service = createSupabaseServiceClient();
  const emailHash = await hash(parsed.data.email);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ipHash = forwarded ? await hash(forwarded) : null;
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const [{ data: recent }, { count: recentFromIp }] = await Promise.all([
    service
      .from("email_access_requests")
      .select("id")
      .eq("email_hash", emailHash)
      .gte("created_at", oneMinuteAgo)
      .limit(1)
      .maybeSingle(),
    ipHash
      ? service
          .from("email_access_requests")
          .select("id", { count: "exact", head: true })
          .eq("ip_hash", ipHash)
          .gte("created_at", oneMinuteAgo)
      : Promise.resolve({ count: 0 }),
  ]);
  if (recent || (recentFromIp ?? 0) >= 10)
    return Response.json(
      { error: "Espera 60 segundos antes de pedir otro acceso." },
      { status: 429 },
    );
  await service.from("email_access_requests").insert({ email_hash: emailHash, ip_hash: ipHash });

  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
  ).replace(/\/$/u, "");
  const next = safeReturnPath(parsed.data.next) ?? "/mi-manada";
  const { data, error } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: parsed.data.email,
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.properties.hashed_token)
    return Response.json(
      { error: "No pudimos preparar el enlace. Intenta de nuevo." },
      { status: 400 },
    );
  const accessUrl = new URL("/auth/confirm", origin);
  accessUrl.searchParams.set("token_hash", data.properties.hashed_token);
  accessUrl.searchParams.set("type", data.properties.verification_type);
  accessUrl.searchParams.set("next", next);
  const firstName =
    typeof data.user.user_metadata?.first_name === "string"
      ? data.user.user_metadata.first_name
      : "amigo";
  try {
    await sendBrandedEmail({
      key: "AUTH_ACCESS",
      to: parsed.data.email,
      variables: { nombre_cliente: firstName || "amigo", url_acceso: accessUrl.toString() },
      actionUrl: accessUrl.toString(),
      note: "El enlace vence pronto y sólo puede utilizarse una vez. Si tú no lo pediste, ignora este mensaje.",
    });
  } catch (sendError) {
    console.error("Could not send access email", sendError);
    return Response.json(
      { error: "No pudimos enviar el enlace. Intenta de nuevo." },
      { status: 400 },
    );
  }
  return Response.json({ ok: true });
}

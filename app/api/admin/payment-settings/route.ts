import { z } from "zod";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";
import { encryptSecret } from "../../../lib/security/secret";

const schema = z
  .object({
    bankEnabled: z.boolean(),
    bankName: z.string().trim().max(120),
    accountName: z.string().trim().max(180),
    clabe: z.string().transform((value) => value.replace(/\s/g, "")),
    referencePrefix: z
      .string()
      .trim()
      .min(2)
      .max(20)
      .regex(/^[A-Za-z0-9-]+$/),
    stripeEnabled: z.boolean(),
    stripePublishableKey: z.string().trim().max(255),
    stripeSecretKey: z.string().trim().max(500),
    stripeWebhookSecret: z.string().trim().max(500),
  })
  .superRefine((value, context) => {
    if (value.bankEnabled) {
      if (!value.bankName || !value.accountName)
        context.addIssue({
          code: "custom",
          message: "Completa el banco y el titular.",
        });
      if (!/^\d{18}$/.test(value.clabe))
        context.addIssue({
          code: "custom",
          message: "La CLABE debe tener exactamente 18 dígitos.",
        });
    }
    if (
      value.stripePublishableKey &&
      !/^pk_(test|live)_/.test(value.stripePublishableKey)
    )
      context.addIssue({
        code: "custom",
        message: "La llave pública de Stripe no es válida.",
      });
    if (
      value.stripeSecretKey &&
      !/^sk_(test|live)_/.test(value.stripeSecretKey)
    )
      context.addIssue({
        code: "custom",
        message: "La llave secreta de Stripe no es válida.",
      });
    if (
      value.stripeWebhookSecret &&
      !value.stripeWebhookSecret.startsWith("whsec_")
    )
      context.addIssue({
        code: "custom",
        message: "El secreto del webhook de Stripe no es válido.",
      });
  });

export async function PATCH(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Revisa la configuración." },
      { status: 400 },
    );
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,role,active")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile?.active || profile.role !== "ADMIN")
    return Response.json({ error: "No autorizado." }, { status: 403 });

  const service = createSupabaseServiceClient();
  const { data: current } = await service
    .from("payment_settings")
    .select("stripe_secret_ciphertext,stripe_webhook_ciphertext")
    .eq("id", 1)
    .maybeSingle();
  const stripeSecretCiphertext = parsed.data.stripeSecretKey
    ? await encryptSecret(parsed.data.stripeSecretKey)
    : (current?.stripe_secret_ciphertext ?? null);
  const stripeWebhookCiphertext = parsed.data.stripeWebhookSecret
    ? await encryptSecret(parsed.data.stripeWebhookSecret)
    : (current?.stripe_webhook_ciphertext ?? null);
  if (
    parsed.data.stripeEnabled &&
    !stripeSecretCiphertext &&
    !process.env.STRIPE_SECRET_KEY
  )
    return Response.json(
      { error: "Agrega la llave secreta de Stripe antes de activarlo." },
      { status: 400 },
    );
  if (
    parsed.data.stripeEnabled &&
    !stripeWebhookCiphertext &&
    !process.env.STRIPE_WEBHOOK_SECRET
  )
    return Response.json(
      { error: "Agrega el secreto del webhook antes de activar Stripe." },
      { status: 400 },
    );

  const { error } = await service.from("payment_settings").upsert({
    id: 1,
    bank_enabled: parsed.data.bankEnabled,
    bank_name: parsed.data.bankName || null,
    bank_account_name: parsed.data.accountName || null,
    bank_clabe: parsed.data.clabe || null,
    bank_reference_prefix: parsed.data.referencePrefix.toUpperCase(),
    stripe_enabled: parsed.data.stripeEnabled,
    stripe_publishable_key: parsed.data.stripePublishableKey || null,
    stripe_secret_ciphertext: stripeSecretCiphertext,
    stripe_webhook_ciphertext: stripeWebhookCiphertext,
    updated_by: profile.id,
    updated_at: new Date().toISOString(),
  });
  if (error)
    return Response.json(
      { error: "No pudimos guardar la configuración." },
      { status: 500 },
    );
  await service
    .from("audit_logs")
    .insert({
      actor_profile_id: profile.id,
      action: "PAYMENT_SETTINGS_UPDATED",
      entity_type: "payment_settings",
      entity_id: null,
      metadata: {
        bank_enabled: parsed.data.bankEnabled,
        stripe_enabled: parsed.data.stripeEnabled,
        stripe_keys_updated: Boolean(
          parsed.data.stripeSecretKey || parsed.data.stripeWebhookSecret,
        ),
      },
    });
  return Response.json({
    ok: true,
    hasStripeSecret: Boolean(
      stripeSecretCiphertext || process.env.STRIPE_SECRET_KEY,
    ),
    hasStripeWebhookSecret: Boolean(
      stripeWebhookCiphertext || process.env.STRIPE_WEBHOOK_SECRET,
    ),
  });
}

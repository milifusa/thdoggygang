import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../../lib/supabase/service";
import {
  getPaymentSettingsForAdmin,
  getStripeSecretKey,
  getStripeWebhookSecret,
} from "../../../../lib/payment-config";

type StripeError = { error?: { message?: string } };

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("auth_user_id", user.id)
    .single();
  return Boolean(profile?.active && profile.role === "ADMIN");
}

function stripeMode(key: string) {
  if (key.startsWith("sk_test_")) return "test" as const;
  if (key.startsWith("sk_live_")) return "live" as const;
  return "unknown" as const;
}

function sameHost(left: string, right: string) {
  return left.replace(/^www\./, "") === right.replace(/^www\./, "");
}

async function stripeRequest(
  path: string,
  key: string,
  init?: RequestInit,
) {
  return fetch(`https://api.stripe.com${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(12_000),
  });
}

async function signWebhook(body: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  return `t=${timestamp},v1=${Buffer.from(signature).toString("hex")}`;
}

export async function POST(request: Request) {
  if (!(await requireAdmin()))
    return Response.json({ error: "No autorizado." }, { status: 403 });

  const [settings, secretKey, webhookSecret] = await Promise.all([
    getPaymentSettingsForAdmin(),
    getStripeSecretKey(),
    getStripeWebhookSecret(),
  ]);
  if (!settings.stripeEnabled || !secretKey || !webhookSecret)
    return Response.json(
      {
        ok: false,
        error:
          "Stripe está incompleto o no fue posible descifrar sus credenciales.",
      },
      { status: 409 },
    );

  const mode = stripeMode(secretKey);
  const publishableMode = settings.stripePublishableKey.startsWith("pk_test_")
    ? "test"
    : settings.stripePublishableKey.startsWith("pk_live_")
      ? "live"
      : "unknown";
  if (mode === "unknown")
    return Response.json(
      { ok: false, error: "La llave secreta de Stripe no es válida." },
      { status: 409 },
    );

  try {
    const accountResponse = await stripeRequest("/v1/account", secretKey);
    const account = (await accountResponse.json()) as StripeError & {
      country?: string;
      charges_enabled?: boolean;
      details_submitted?: boolean;
    };
    if (!accountResponse.ok)
      return Response.json(
        {
          ok: false,
          mode,
          error:
            account.error?.message ?? "Stripe rechazó la llave secreta.",
        },
        { status: 409 },
      );

    const origin = new URL(
      process.env.APP_ORIGIN ?? new URL(request.url).origin,
    );
    const webhookUrl = new URL("/api/webhooks/stripe", origin);
    const endpointsResponse = await stripeRequest(
      "/v1/webhook_endpoints?limit=100",
      secretKey,
    );
    const endpointPayload = (await endpointsResponse.json()) as StripeError & {
      data?: Array<{
        url: string;
        status: string;
        enabled_events: string[];
      }>;
    };
    const endpoint = endpointPayload.data?.find((candidate) => {
      try {
        const candidateUrl = new URL(candidate.url);
        return (
          candidateUrl.protocol === "https:" &&
          sameHost(candidateUrl.hostname, webhookUrl.hostname) &&
          candidateUrl.pathname.replace(/\/$/, "") === webhookUrl.pathname
        );
      } catch {
        return false;
      }
    });
    const listensForCheckout = Boolean(
      endpoint?.enabled_events.some(
        (event) => event === "*" || event === "checkout.session.completed",
      ),
    );

    const sessionForm = new URLSearchParams({
      mode: "payment",
      success_url: `${origin.origin}/admin/configuracion-pagos?prueba=ok`,
      cancel_url: `${origin.origin}/admin/configuracion-pagos?prueba=cancelada`,
      "payment_method_types[0]": "card",
      "line_items[0][price_data][currency]": "mxn",
      "line_items[0][price_data][unit_amount]": "2000",
      "line_items[0][price_data][product_data][name]":
        "Prueba de configuración — no cobrar",
      "line_items[0][quantity]": "1",
      "metadata[purchase_type]": "configuration_test",
    });
    const sessionResponse = await stripeRequest(
      "/v1/checkout/sessions",
      secretKey,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": `tdg-settings-${crypto.randomUUID()}`,
        },
        body: sessionForm,
      },
    );
    const session = (await sessionResponse.json()) as StripeError & {
      id?: string;
      livemode?: boolean;
    };
    const checkoutReady = sessionResponse.ok && Boolean(session.id);
    let checkoutCleanup = false;
    if (checkoutReady && session.id) {
      const expireResponse = await stripeRequest(
        `/v1/checkout/sessions/${encodeURIComponent(session.id)}/expire`,
        secretKey,
        { method: "POST" },
      );
      checkoutCleanup = expireResponse.ok;
    }

    const diagnosticEventId = `evt_tdg_diagnostic_${crypto.randomUUID()}`;
    const diagnosticBody = JSON.stringify({
      id: diagnosticEventId,
      type: "tdg.webhook.test",
      data: { object: { id: `diag_${crypto.randomUUID()}` } },
    });
    const handlerResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": await signWebhook(
          diagnosticBody,
          webhookSecret,
        ),
      },
      body: diagnosticBody,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    await createSupabaseServiceClient()
      .from("payment_webhook_events")
      .delete()
      .eq("provider", "stripe")
      .eq("event_id", diagnosticEventId);

    const keyModesMatch = publishableMode === mode;
    const webhookRegistered = Boolean(endpoint);
    const webhookEnabled = endpoint?.status === "enabled";
    const webhookHandlerReady = handlerResponse.ok;
    const accountReady =
      mode === "test" ||
      Boolean(account.charges_enabled && account.details_submitted);
    const ok =
      accountReady &&
      keyModesMatch &&
      checkoutReady &&
      checkoutCleanup &&
      webhookRegistered &&
      webhookEnabled &&
      listensForCheckout &&
      webhookHandlerReady;

    return Response.json({
      ok,
      mode,
      account: {
        connected: true,
        country: account.country ?? null,
        chargesEnabled: Boolean(account.charges_enabled),
        detailsSubmitted: Boolean(account.details_submitted),
        ready: accountReady,
      },
      keys: { modesMatch: keyModesMatch },
      checkout: {
        ready: checkoutReady,
        cleanedUp: checkoutCleanup,
        error: checkoutReady ? null : session.error?.message ?? null,
      },
      webhook: {
        registered: webhookRegistered,
        enabled: webhookEnabled,
        listensForCheckout,
        handlerReady: webhookHandlerReady,
        listPermission: endpointsResponse.ok,
        listError: endpointsResponse.ok
          ? null
          : endpointPayload.error?.message ?? null,
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? `No fue posible completar la prueba: ${error.message}`
            : "No fue posible completar la prueba.",
      },
      { status: 502 },
    );
  }
}

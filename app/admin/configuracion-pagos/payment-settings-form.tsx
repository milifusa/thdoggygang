"use client";
import { useState, type FormEvent } from "react";
import {
  Check,
  CircleCheck,
  CircleX,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

export type PaymentSettingsView = {
  bankEnabled: boolean;
  bankName: string;
  accountName: string;
  clabe: string;
  referencePrefix: string;
  stripeEnabled: boolean;
  stripePublishableKey: string;
  hasStripeSecret: boolean;
  hasStripeWebhookSecret: boolean;
};

type StripeDiagnostics = {
  ok: boolean;
  mode?: "test" | "live";
  error?: string;
  account?: {
    connected: boolean;
    country: string | null;
    chargesEnabled: boolean;
    detailsSubmitted: boolean;
  };
  keys?: { modesMatch: boolean };
  checkout?: { ready: boolean; cleanedUp: boolean; error: string | null };
  webhook?: {
    registered: boolean;
    enabled: boolean;
    listensForCheckout: boolean;
    handlerReady: boolean;
    listPermission: boolean;
    listError: string | null;
  };
};

function DiagnosticLine({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li className={ok ? "is-ready" : "has-error"}>
      {ok ? <CircleCheck /> : <CircleX />}
      <span>{children}</span>
    </li>
  );
}

export function PaymentSettingsForm({
  initial,
}: {
  initial: PaymentSettingsView;
}) {
  const [value, setValue] = useState(initial);
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [showSecrets, setShowSecrets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [diagnostics, setDiagnostics] = useState<StripeDiagnostics | null>(
    null,
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/admin/payment-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...value, stripeSecretKey, stripeWebhookSecret }),
        signal: controller.signal,
      });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        hasStripeSecret?: boolean;
        hasStripeWebhookSecret?: boolean;
      };
      if (!response.ok)
        throw new Error(
          result.error ?? "No pudimos guardar la configuración.",
        );
      setValue((current) => ({
        ...current,
        hasStripeSecret: Boolean(result.hasStripeSecret),
        hasStripeWebhookSecret: Boolean(result.hasStripeWebhookSecret),
      }));
      setStripeSecretKey("");
      setStripeWebhookSecret("");
      setMessage("Configuración guardada de forma segura.");
    } catch (error) {
      setMessage(
        error instanceof DOMException && error.name === "AbortError"
          ? "El guardado tardó demasiado. Intenta nuevamente."
          : error instanceof Error
            ? error.message
            : "No pudimos guardar la configuración.",
      );
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }
  async function testStripe() {
    setTesting(true);
    setDiagnostics(null);
    try {
      const response = await fetch(
        "/api/admin/payment-settings/diagnostics",
        { method: "POST" },
      );
      const result = (await response.json().catch(() => ({}))) as
        | StripeDiagnostics
        | { error?: string };
      if (!response.ok && !("account" in result))
        throw new Error(result.error ?? "No pudimos completar la prueba.");
      setDiagnostics(result as StripeDiagnostics);
    } catch (error) {
      setDiagnostics({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No pudimos completar la prueba.",
      });
    } finally {
      setTesting(false);
    }
  }
  return (
    <form className="payment-settings-form" onSubmit={save}>
      <section>
        <div className="payment-settings-heading">
          <div>
            <span>TRANSFERENCIAS</span>
            <h2>Cuenta bancaria</h2>
            <p>
              Estos datos serán visibles para el cliente sólo cuando este método
              esté activo.
            </p>
          </div>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={value.bankEnabled}
              onChange={(e) =>
                setValue({ ...value, bankEnabled: e.target.checked })
              }
            />
            <i>{value.bankEnabled && <Check />}</i>
            <span>{value.bankEnabled ? "ACTIVO" : "INACTIVO"}</span>
          </label>
        </div>
        <div className="payment-settings-grid">
          <label>
            BANCO
            <input
              value={value.bankName}
              onChange={(e) => setValue({ ...value, bankName: e.target.value })}
              placeholder="Nombre del banco"
            />
          </label>
          <label>
            TITULAR DE LA CUENTA
            <input
              value={value.accountName}
              onChange={(e) =>
                setValue({ ...value, accountName: e.target.value })
              }
              placeholder="Razón social o persona titular"
            />
          </label>
          <label>
            CLABE DE 18 DÍGITOS
            <input
              inputMode="numeric"
              maxLength={18}
              value={value.clabe}
              onChange={(e) =>
                setValue({ ...value, clabe: e.target.value.replace(/\D/g, "") })
              }
              placeholder="000000000000000000"
            />
          </label>
          <label>
            PREFIJO DE REFERENCIA
            <input
              maxLength={20}
              value={value.referencePrefix}
              onChange={(e) =>
                setValue({
                  ...value,
                  referencePrefix: e.target.value
                    .replace(/[^a-zA-Z0-9-]/g, "")
                    .toUpperCase(),
                })
              }
            />
          </label>
        </div>
      </section>
      <section>
        <div className="payment-settings-heading">
          <div>
            <span>STRIPE</span>
            <h2>Pago con tarjeta</h2>
            <p>
              Los secretos se cifran antes de guardarse y nunca vuelven a
              mostrarse.
            </p>
          </div>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={value.stripeEnabled}
              onChange={(e) =>
                setValue({ ...value, stripeEnabled: e.target.checked })
              }
            />
            <i>{value.stripeEnabled && <Check />}</i>
            <span>{value.stripeEnabled ? "ACTIVO" : "INACTIVO"}</span>
          </label>
        </div>
        <div className="secure-settings-note">
          <LockKeyhole />
          <p>
            Configura en Stripe el webhook <strong>/api/webhooks/stripe</strong>{" "}
            y escucha el evento <strong>checkout.session.completed</strong>.
          </p>
          <button
            type="button"
            onClick={() => setShowSecrets((current) => !current)}
          >
            {showSecrets ? <EyeOff /> : <Eye />}
            {showSecrets ? "OCULTAR" : "MOSTRAR AL ESCRIBIR"}
          </button>
        </div>
        <div className="payment-settings-grid">
          <label>
            LLAVE PÚBLICA
            <input
              value={value.stripePublishableKey}
              onChange={(e) =>
                setValue({ ...value, stripePublishableKey: e.target.value })
              }
              placeholder="pk_live_…"
              autoComplete="off"
            />
          </label>
          <label>
            LLAVE SECRETA{" "}
            <small>{value.hasStripeSecret ? "CONFIGURADA" : "PENDIENTE"}</small>
            <input
              type={showSecrets ? "text" : "password"}
              value={stripeSecretKey}
              onChange={(e) => setStripeSecretKey(e.target.value)}
              placeholder={
                value.hasStripeSecret
                  ? "Déjala vacía para conservarla"
                  : "sk_live_…"
              }
              autoComplete="new-password"
            />
          </label>
          <label>
            SECRETO DEL WEBHOOK{" "}
            <small>
              {value.hasStripeWebhookSecret ? "CONFIGURADO" : "PENDIENTE"}
            </small>
            <input
              type={showSecrets ? "text" : "password"}
              value={stripeWebhookSecret}
              onChange={(e) => setStripeWebhookSecret(e.target.value)}
              placeholder={
                value.hasStripeWebhookSecret
                  ? "Déjalo vacío para conservarlo"
                  : "whsec_…"
              }
              autoComplete="new-password"
            />
          </label>
        </div>
        <div className="stripe-diagnostics">
          <div>
            <ShieldCheck />
            <div>
              <strong>PRUEBA DE CONEXIÓN</strong>
              <p>
                Valida las llaves, crea y cancela un checkout sin cobrar, y
                comprueba el endpoint del webhook.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="button button-secondary"
            disabled={testing || busy || !value.stripeEnabled}
            onClick={testStripe}
          >
            {testing && <LoaderCircle className="spin" />}
            {testing ? "PROBANDO…" : "PROBAR STRIPE"}
          </button>
          {diagnostics && (
            <div className="stripe-diagnostics-result" role="status">
              <strong>
                {diagnostics.ok
                  ? "Stripe está listo para cobrar"
                  : "Hay puntos por corregir"}
              </strong>
              {diagnostics.error ? (
                <p>{diagnostics.error}</p>
              ) : (
                <ul>
                  <DiagnosticLine ok={Boolean(diagnostics.account?.connected)}>
                    Credenciales aceptadas por Stripe
                  </DiagnosticLine>
                  <DiagnosticLine ok={Boolean(diagnostics.keys?.modesMatch)}>
                    Llaves pública y secreta en el mismo modo
                  </DiagnosticLine>
                  <DiagnosticLine ok={Boolean(diagnostics.checkout?.ready)}>
                    Checkout de compra creado correctamente
                  </DiagnosticLine>
                  <DiagnosticLine
                    ok={Boolean(
                      diagnostics.webhook?.registered &&
                        diagnostics.webhook?.enabled &&
                        diagnostics.webhook?.listensForCheckout,
                    )}
                  >
                    Webhook registrado y escuchando pagos completados
                  </DiagnosticLine>
                  <DiagnosticLine
                    ok={Boolean(diagnostics.webhook?.handlerReady)}
                  >
                    Firma y recepción del webhook verificadas
                  </DiagnosticLine>
                </ul>
              )}
              {diagnostics.mode && (
                <small>
                  MODO {diagnostics.mode === "live" ? "PRODUCCIÓN" : "PRUEBA"}
                </small>
              )}
              {diagnostics.checkout?.error && (
                <p>{diagnostics.checkout.error}</p>
              )}
              {diagnostics.webhook?.listError && (
                <p>{diagnostics.webhook.listError}</p>
              )}
            </div>
          )}
        </div>
      </section>
      {message && (
        <p className="settings-message" role="status">
          {message}
        </p>
      )}
      <button className="button button-primary" disabled={busy}>
        {busy ? "GUARDANDO…" : "GUARDAR CONFIGURACIÓN"}
      </button>
    </form>
  );
}

"use client";
import { useState, type FormEvent } from "react";
import { Check, Eye, EyeOff, LockKeyhole } from "lucide-react";

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
  const [message, setMessage] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/payment-settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...value, stripeSecretKey, stripeWebhookSecret }),
    });
    const result = (await response.json()) as {
      ok?: boolean;
      error?: string;
      hasStripeSecret?: boolean;
      hasStripeWebhookSecret?: boolean;
    };
    setBusy(false);
    if (!response.ok)
      return setMessage(result.error ?? "No pudimos guardar la configuración.");
    setValue((current) => ({
      ...current,
      hasStripeSecret: Boolean(result.hasStripeSecret),
      hasStripeWebhookSecret: Boolean(result.hasStripeWebhookSecret),
    }));
    setStripeSecretKey("");
    setStripeWebhookSecret("");
    setMessage("Configuración guardada de forma segura.");
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

"use client";

import { useState, type FormEvent } from "react";
import { Clock3, Save, ShieldCheck } from "lucide-react";

export function CancellationSettingsForm({
  initial,
}: {
  initial: {
    minimumNoticeHours: number;
    policyText: string;
    lateMessage: string;
  };
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/cancellation-settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setSaving(false);
    setMessage(
      response.ok
        ? "Política guardada. Ya está visible para clientes."
        : result.error ?? "No pudimos guardar la política.",
    );
  };
  return (
    <form className="cancellation-settings-form" onSubmit={save}>
      <div className="cancellation-policy-heading">
        <div>
          <span>REGLA GENERAL</span>
          <h2>Política de cancelación</h2>
          <p>
            El dinero no se devuelve: una cancelación elegible genera crédito
            para otra aventura.
          </p>
        </div>
        <ShieldCheck />
      </div>
      <label className="cancellation-hours-field">
        <span>ANTICIPACIÓN MÍNIMA</span>
        <div>
          <Clock3 />
          <input
            type="number"
            min={1}
            max={720}
            value={value.minimumNoticeHours}
            onChange={(event) =>
              setValue({
                ...value,
                minimumNoticeHours: Number(event.target.value),
              })
            }
          />
          <strong>HORAS ANTES DEL HIKE</strong>
        </div>
      </label>
      <label>
        TEXTO DE LA POLÍTICA
        <textarea
          rows={5}
          value={value.policyText}
          onChange={(event) =>
            setValue({ ...value, policyText: event.target.value })
          }
        />
      </label>
      <label>
        MENSAJE CUANDO YA CERRÓ EL PLAZO
        <textarea
          rows={4}
          value={value.lateMessage}
          onChange={(event) =>
            setValue({ ...value, lateMessage: event.target.value })
          }
        />
      </label>
      <div className="cancellation-save-row">
        {message && <p role="status">{message}</p>}
        <button disabled={saving}>
          <Save /> {saving ? "GUARDANDO…" : "GUARDAR POLÍTICA"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Eye, ImageIcon, Mail, RotateCcw, Save, Upload } from "lucide-react";
import {
  EMAIL_TEMPLATE_DEFINITIONS,
  type EmailTemplateKey,
  type EmailTemplateValue,
} from "../../lib/email-template-config";
import {
  prepareImageForUpload,
  readJsonResponse,
} from "../../lib/client-image-upload";

const sampleVariables: Record<string, string> = {
  nombre_cliente: "Michelle",
  hike: "Ex Hacienda San Benito",
  fecha_hike: "4 de octubre de 2026, 8:00 a.m.",
  paso_pendiente: "Pago",
  punto_encuentro: "Cholula, Puebla",
  cambios: "horario y punto de encuentro",
  rol: "Guía",
  url_acceso: "#",
  url_continuar: "#",
  url_aventura: "#",
  url_reserva: "#",
};

function previewText(value: string) {
  return Object.entries(sampleVariables).reduce(
    (text, [key, replacement]) => text.replaceAll(`{${key}}`, replacement),
    value,
  );
}

export function EmailTemplateManager({
  initialTemplates,
}: {
  initialTemplates: EmailTemplateValue[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedKey, setSelectedKey] = useState<EmailTemplateKey>(
    initialTemplates[0]?.key ?? "AUTH_ACCESS",
  );
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mobilePreview, setMobilePreview] = useState(false);
  const template =
    templates.find((item) => item.key === selectedKey) ?? templates[0];
  const definition = EMAIL_TEMPLATE_DEFINITIONS[selectedKey];
  const localPreview = useMemo(
    () => (photo ? URL.createObjectURL(photo) : template.imageUrl),
    [photo, template.imageUrl],
  );

  function update(change: Partial<EmailTemplateValue>) {
    setTemplates((current) =>
      current.map((item) =>
        item.key === selectedKey ? { ...item, ...change } : item,
      ),
    );
  }

  function choose(key: EmailTemplateKey) {
    setSelectedKey(key);
    setPhoto(null);
    setMessage("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/email-templates/${selectedKey}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: template.subject,
          eyebrow: template.eyebrow,
          heading: template.heading,
          body: template.body,
          buttonLabel: template.buttonLabel,
          active: template.active,
        }),
      });
      const result = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok)
        throw new Error(result.error ?? "No pudimos guardar el correo.");
      if (photo) {
        const body = new FormData();
        body.set(
          "image",
          await prepareImageForUpload(photo, {
            maxBytes: 2 * 1024 * 1024,
            maxDimension: 1800,
          }),
        );
        const upload = await fetch(
          `/api/admin/email-templates/${selectedKey}/image`,
          { method: "POST", body },
        );
        const uploaded = await readJsonResponse<{
          error?: string;
          imagePath?: string;
          imageUrl?: string;
        }>(upload);
        if (!upload.ok)
          throw new Error(uploaded.error ?? "No pudimos subir la imagen.");
        update({
          imagePath: uploaded.imagePath ?? null,
          imageUrl: uploaded.imageUrl ?? template.imageUrl,
        });
        setPhoto(null);
      }
      setMessage("Correo guardado y publicado correctamente.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No pudimos guardar el correo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function restorePhoto() {
    if (!template.imagePath && !photo) return;
    setBusy(true);
    setMessage("");
    if (template.imagePath) {
      const response = await fetch(
        `/api/admin/email-templates/${selectedKey}/image`,
        { method: "DELETE" },
      );
      const result = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        setBusy(false);
        return setMessage(result.error ?? "No pudimos restaurar la imagen.");
      }
    }
    setPhoto(null);
    update({
      imagePath: null,
      imageUrl: EMAIL_TEMPLATE_DEFINITIONS[selectedKey].imageUrl,
    });
    setBusy(false);
    setMessage("Se restauró la fotografía original.");
  }

  if (!template) return null;
  return (
    <div className="email-admin-layout">
      <aside className="email-template-list" aria-label="Tipos de email">
        {(["ACCESO", "RESERVACIONES", "AVENTURAS"] as const).map((group) => (
          <section key={group}>
            <p>{group}</p>
            {templates
              .filter(
                (item) => EMAIL_TEMPLATE_DEFINITIONS[item.key].group === group,
              )
              .map((item) => {
                const itemDefinition = EMAIL_TEMPLATE_DEFINITIONS[item.key];
                return (
                  <button
                    type="button"
                    className={item.key === selectedKey ? "active" : ""}
                    onClick={() => choose(item.key)}
                    key={item.key}
                  >
                    <Mail aria-hidden="true" />
                    <span>
                      <b>{itemDefinition.label}</b>
                      <small>{item.active ? "Activo" : "Pausado"}</small>
                    </span>
                  </button>
                );
              })}
          </section>
        ))}
      </aside>
      <div className="email-editor-column">
        <header className="email-editor-head">
          <div>
            <span>PLANTILLA SELECCIONADA</span>
            <h2>{definition.label}</h2>
            <p>{definition.description}</p>
          </div>
          <button type="button" onClick={() => setMobilePreview(!mobilePreview)}>
            <Eye aria-hidden="true" /> {mobilePreview ? "OCULTAR PREVIEW" : "VER PREVIEW"}
          </button>
        </header>
        <div className="email-editor-grid">
          <form className="email-edit-form" onSubmit={save}>
            <label className="email-photo-field">
              <span>FOTOGRAFÍA DE PORTADA</span>
              <img src={localPreview} alt="Portada del correo" />
              <b><Upload aria-hidden="true" /> CAMBIAR FOTOGRAFÍA</b>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setPhoto(event.target.files?.[0] ?? null);
                  setMessage("");
                }}
              />
              <small>JPG, PNG o WebP. Se optimiza antes de subir.</small>
            </label>
            <button
              className="email-restore-photo"
              type="button"
              disabled={busy || (!template.imagePath && !photo)}
              onClick={() => void restorePhoto()}
            >
              <RotateCcw aria-hidden="true" /> RESTAURAR ORIGINAL
            </button>
            <label>
              ASUNTO DEL CORREO
              <input
                required
                minLength={3}
                maxLength={180}
                value={template.subject}
                onChange={(event) => update({ subject: event.target.value })}
              />
            </label>
            <label>
              TEXTO PEQUEÑO
              <input
                required
                maxLength={100}
                value={template.eyebrow}
                onChange={(event) => update({ eyebrow: event.target.value })}
              />
            </label>
            <label>
              TÍTULO
              <input
                required
                maxLength={180}
                value={template.heading}
                onChange={(event) => update({ heading: event.target.value })}
              />
            </label>
            <label>
              MENSAJE
              <textarea
                required
                minLength={10}
                maxLength={5000}
                value={template.body}
                onChange={(event) => update({ body: event.target.value })}
              />
            </label>
            <label>
              TEXTO DEL BOTÓN
              <input
                required
                maxLength={100}
                value={template.buttonLabel}
                onChange={(event) => update({ buttonLabel: event.target.value })}
              />
            </label>
            <label className="cms-toggle">
              <input
                type="checkbox"
                checked={template.active}
                disabled={selectedKey === "AUTH_ACCESS"}
                onChange={(event) => update({ active: event.target.checked })}
              />
              <i />
              <b>{selectedKey === "AUTH_ACCESS" ? "Siempre activo" : "Correo activo"}</b>
            </label>
            <div className="email-variables">
              <span>VARIABLES DISPONIBLES</span>
              <div>{definition.variables.map((variable) => <code key={variable}>{variable}</code>)}</div>
              <small>Puedes colocarlas en el asunto, título o mensaje.</small>
            </div>
            <button className="button button-primary" disabled={busy}>
              <Save aria-hidden="true" /> {busy ? "GUARDANDO" : "GUARDAR Y PUBLICAR"}
            </button>
            {message && <p className="email-editor-message" role="status">{message}</p>}
          </form>
          <aside className={`email-live-preview ${mobilePreview ? "show" : ""}`}>
            <div className="email-preview-bar">
              <ImageIcon aria-hidden="true" /> VISTA PREVIA DEL EMAIL
            </div>
            <article>
              <img className="email-preview-cover" src={localPreview} alt="" />
              <div className="email-preview-copy">
                <img src="/brand/logo-horizontal-blue.png" alt="The Doggy Gang" />
                <span>{previewText(template.eyebrow)}</span>
                <h3>{previewText(template.heading)}</h3>
                <p>{previewText(template.body)}</p>
                <b>{previewText(template.buttonLabel)}</b>
                <small>El enlace vence pronto y sólo se puede usar una vez.</small>
              </div>
            </article>
          </aside>
        </div>
      </div>
    </div>
  );
}

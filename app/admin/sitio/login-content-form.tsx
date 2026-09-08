"use client";
import { FormEvent, useMemo, useState } from "react";
import { Eye, RotateCcw, Save, Upload } from "lucide-react";
import {
  defaultLoginContent,
  type LoginContent,
} from "../../lib/login-content";

const text = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();
function Field({
  label,
  name,
  value,
  area = false,
}: {
  label: string;
  name: string;
  value: string;
  area?: boolean;
}) {
  return (
    <label>
      {label}
      {area ? (
        <textarea name={name} value={value} onChange={() => {}} />
      ) : (
        <input name={name} value={value} onChange={() => {}} />
      )}
    </label>
  );
}

export function LoginContentForm({
  initial,
  desktopImage,
  mobileImage,
  metadata,
}: {
  initial: LoginContent;
  desktopImage: string;
  mobileImage: string;
  metadata: Record<string, unknown>;
}) {
  const [content, setContent] = useState(initial);
  const [desktop, setDesktop] = useState<File | null>(null);
  const [mobile, setMobile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const desktopPreview = useMemo(
    () => (desktop ? URL.createObjectURL(desktop) : desktopImage),
    [desktop, desktopImage],
  );
  const mobilePreview = useMemo(
    () => (mobile ? URL.createObjectURL(mobile) : mobileImage),
    [mobile, mobileImage],
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const value: LoginContent = {
      quote: text(data, "quote"),
      quoteVisible: data.get("quoteVisible") === "on",
      eyebrow: text(data, "eyebrow"),
      title: text(data, "title"),
      description: text(data, "description"),
      emailTab: text(data, "emailTab"),
      phoneTab: text(data, "phoneTab"),
      emailLabel: text(data, "emailLabel"),
      emailPlaceholder: text(data, "emailPlaceholder"),
      emailCta: text(data, "emailCta"),
      phoneLabel: text(data, "phoneLabel"),
      phonePlaceholder: text(data, "phonePlaceholder"),
      phoneCta: text(data, "phoneCta"),
      codeLabel: text(data, "codeLabel"),
      verifyCta: text(data, "verifyCta"),
      legalText: text(data, "legalText"),
      termsLabel: text(data, "termsLabel"),
      termsUrl: text(data, "termsUrl"),
      privacyLabel: text(data, "privacyLabel"),
      privacyUrl: text(data, "privacyUrl"),
      imagePosition: data.get("imagePosition") as LoginContent["imagePosition"],
    };
    try {
      const response = await fetch("/api/admin/site/login", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? "No pudimos guardar el contenido.");
      for (const [kind, file] of [
        ["desktop", desktop],
        ["mobile", mobile],
      ] as const) {
        if (!file) continue;
        const body = new FormData();
        body.set("kind", kind);
        body.set("image", file);
        const upload = await fetch("/api/admin/site/login/images", {
          method: "POST",
          body,
        });
        const out = (await upload.json()) as { error?: string };
        if (!upload.ok)
          throw new Error(out.error ?? "No pudimos subir la imagen.");
      }
      setContent(value);
      setDirty(false);
      setMessage("Cambios publicados correctamente.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No pudimos guardar.",
      );
    } finally {
      setBusy(false);
    }
  }
  function restore() {
    setContent(defaultLoginContent);
    setDirty(true);
    setMessage("Valores originales cargados. Publica para aplicarlos.");
  }
  return (
    <div className="login-cms-layout">
      <form
        className="site-content-form login-cms-form"
        onSubmit={submit}
        onChange={(event) => {
          setDirty(true);
          const target = event.target as unknown as
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
          const name = target.name;
          if (!name) return;
          if (name === "quoteVisible")
            setContent((current) => ({
              ...current,
              quoteVisible: (target as HTMLInputElement).checked,
            }));
          else if (name in content)
            setContent((current) => ({ ...current, [name]: target.value }));
        }}
      >
        <div className="cms-status">
          <span>
            {dirty ? "Tienes cambios sin guardar" : "Contenido publicado"}
          </span>
          <button type="button" onClick={() => setPreview(!preview)}>
            <Eye /> VER PREVIEW
          </button>
        </div>
        <section>
          <span>IMAGEN DE ACCESO</span>
          <div className="login-image-fields">
            <label>
              IMAGEN DESKTOP
              <img
                src={desktopPreview}
                alt="Preview desktop"
                style={{ objectPosition: content.imagePosition }}
              />
              <b>
                <Upload /> CAMBIAR IMAGEN
              </b>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  setDesktop(e.target.files?.[0] ?? null);
                  setDirty(true);
                }}
              />
              <small>
                {desktop?.name ??
                  String(metadata.desktopName ?? "Imagen actual")}{" "}
                {desktop
                  ? `· ${(desktop.size / 1024 / 1024).toFixed(1)} MB`
                  : ""}
              </small>
            </label>
            <label>
              IMAGEN MOBILE · OPCIONAL
              <img src={mobilePreview} alt="Preview mobile" />
              <b>
                <Upload /> CAMBIAR IMAGEN
              </b>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  setMobile(e.target.files?.[0] ?? null);
                  setDirty(true);
                }}
              />
              <small>
                {mobile?.name ??
                  String(
                    metadata.mobileName ?? "Usa desktop si no se configura",
                  )}
              </small>
            </label>
          </div>
          <label>
            ENCUADRE
            <select
              name="imagePosition"
              value={content.imagePosition}
              onChange={(e) =>
                setContent({
                  ...content,
                  imagePosition: e.target
                    .value as LoginContent["imagePosition"],
                })
              }
            >
              <option value="center">Centro</option>
              <option value="top">Arriba</option>
              <option value="bottom">Abajo</option>
              <option value="left">Izquierda</option>
              <option value="right">Derecha</option>
            </select>
          </label>
        </section>
        <section>
          <span>MENSAJE</span>
          <label className="cms-toggle">
            <input
              name="quoteVisible"
              type="checkbox"
              defaultChecked={content.quoteVisible}
            />
            <i />
            <b>Mostrar frase superior</b>
          </label>
          <div className="form-grid">
            <Field label="FRASE" name="quote" value={content.quote} />
            <Field label="LABEL" name="eyebrow" value={content.eyebrow} />
            <Field label="TÍTULO" name="title" value={content.title} area />
            <Field
              label="DESCRIPCIÓN"
              name="description"
              value={content.description}
              area
            />
          </div>
        </section>
        <section>
          <span>MÉTODOS DE ACCESO</span>
          <div className="form-grid">
            <Field label="TAB EMAIL" name="emailTab" value={content.emailTab} />
            <Field
              label="TAB TELÉFONO"
              name="phoneTab"
              value={content.phoneTab}
            />
            <Field
              label="LABEL EMAIL"
              name="emailLabel"
              value={content.emailLabel}
            />
            <Field
              label="PLACEHOLDER EMAIL"
              name="emailPlaceholder"
              value={content.emailPlaceholder}
            />
            <Field label="CTA EMAIL" name="emailCta" value={content.emailCta} />
            <Field
              label="LABEL TELÉFONO"
              name="phoneLabel"
              value={content.phoneLabel}
            />
            <Field
              label="PLACEHOLDER TELÉFONO"
              name="phonePlaceholder"
              value={content.phonePlaceholder}
            />
            <Field
              label="CTA TELÉFONO"
              name="phoneCta"
              value={content.phoneCta}
            />
            <Field
              label="LABEL CÓDIGO"
              name="codeLabel"
              value={content.codeLabel}
            />
            <Field
              label="CTA VERIFICAR"
              name="verifyCta"
              value={content.verifyCta}
            />
          </div>
        </section>
        <section>
          <span>LEGAL</span>
          <div className="form-grid">
            <Field label="TEXTO" name="legalText" value={content.legalText} />
            <Field
              label="TEXTO TÉRMINOS"
              name="termsLabel"
              value={content.termsLabel}
            />
            <Field
              label="URL TÉRMINOS"
              name="termsUrl"
              value={content.termsUrl}
            />
            <Field
              label="TEXTO PRIVACIDAD"
              name="privacyLabel"
              value={content.privacyLabel}
            />
            <Field
              label="URL PRIVACIDAD"
              name="privacyUrl"
              value={content.privacyUrl}
            />
          </div>
        </section>
        {message && <p className="admin-feedback">{message}</p>}
        <div className="admin-form-actions">
          <button type="button" onClick={restore}>
            <RotateCcw /> RESTAURAR TEXTOS
          </button>
          <button className="button button-primary" disabled={busy}>
            <Save />
            {busy ? "PUBLICANDO…" : "PUBLICAR CAMBIOS"}
          </button>
        </div>
      </form>
      <aside className={`login-cms-preview ${preview ? "show" : ""}`}>
        <div
          className="login-mini-photo"
          style={{
            backgroundImage: `linear-gradient(0deg,rgba(0,0,0,.6),transparent),url(${desktopPreview})`,
            backgroundPosition: content.imagePosition,
          }}
        >
          {content.quoteVisible && <strong>{content.quote}</strong>}
        </div>
        <div>
          <span>{content.eyebrow}</span>
          <h2>{content.title}</h2>
          <p>{content.description}</p>
          <b>
            {content.emailTab} · {content.phoneTab}
          </b>
          <i>{content.emailPlaceholder}</i>
          <button>{content.emailCta}</button>
        </div>
      </aside>
    </div>
  );
}

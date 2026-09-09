"use client";
import { FormEvent, useState } from "react";
import { Save, Upload } from "lucide-react";
import type { LandingContent } from "../../lib/landing-content";
import {
  prepareImageForUpload,
  readJsonResponse,
} from "../../lib/client-image-upload";

function Field({
  label,
  name,
  value,
  area = false,
  required = true,
  placeholder,
}: {
  label: string;
  name: string;
  value: string;
  area?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      {area ? (
        <textarea
          required={required}
          name={name}
          defaultValue={value}
          placeholder={placeholder}
        />
      ) : (
        <input
          required={required}
          name={name}
          defaultValue={value}
          placeholder={placeholder}
        />
      )}
    </label>
  );
}
export function SiteContentForm({
  content,
  heroImage,
  howImage,
}: {
  content: LandingContent;
  heroImage: string;
  howImage: string;
}) {
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [howFile, setHowFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "").trim();
    const payload = {
      heroEyebrow: value("heroEyebrow"),
      heroTitle: value("heroTitle"),
      heroAccent: value("heroAccent"),
      heroIntro: value("heroIntro"),
      heroButton: value("heroButton"),
      introEyebrow: value("introEyebrow"),
      introTitle: value("introTitle"),
      introAccent: value("introAccent"),
      introBody: value("introBody"),
      introLink: value("introLink"),
      adventuresEyebrow: value("adventuresEyebrow"),
      adventuresTitle: value("adventuresTitle"),
      adventuresBody: value("adventuresBody"),
      adventuresButton: value("adventuresButton"),
      howEyebrow: value("howEyebrow"),
      howTitle: value("howTitle"),
      howSteps: [0, 1, 2].map((index) => ({
        title: value(`howStep${index}Title`),
        body: value(`howStep${index}Body`),
      })),
      instagramEyebrow: value("instagramEyebrow"),
      instagramTitle: value("instagramTitle"),
      instagramBody: value("instagramBody"),
      instagramCta: value("instagramCta"),
      instagramUrl: value("instagramUrl"),
      instagramEmbeds: [0, 1, 2].map((index) =>
        value(`instagramEmbed${index}`),
      ),
      quote: value("quote"),
      quoteAttribution: value("quoteAttribution"),
      footerText: value("footerText"),
      footerInstagramUrl: value("footerInstagramUrl"),
      footerWhatsappUrl: value("footerWhatsappUrl"),
      footerTermsUrl: value("footerTermsUrl"),
    };
    try {
      const response = await fetch("/api/admin/site", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? "No pudimos guardar los textos.");
      for (const [kind, file] of [
        ["hero", heroFile],
        ["how", howFile],
      ] as const) {
        if (!file) continue;
        const prepared = await prepareImageForUpload(file);
        const imageData = new FormData();
        imageData.set("kind", kind);
        imageData.set("image", prepared);
        const imageResponse = await fetch("/api/admin/site/images", {
          method: "POST",
          body: imageData,
        });
        const imageResult = await readJsonResponse<{ error?: string }>(
          imageResponse,
        );
        if (!imageResponse.ok)
          throw new Error(
            imageResult.error ?? `No pudimos subir la imagen ${kind}.`,
          );
      }
      setMessage(
        "Landing actualizado correctamente. Los cambios públicos pueden tardar hasta un minuto.",
      );
      setHeroFile(null);
      setHowFile(null);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No pudimos guardar el landing.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="site-content-form" onSubmit={submit}>
      <section>
        <span>01 · PORTADA</span>
        <div className="site-image-grid">
          <label>
            IMAGEN PRINCIPAL
            <img
              src={heroFile ? URL.createObjectURL(heroFile) : heroImage}
              alt="Portada actual"
            />
            <span>
              <Upload />
              CAMBIAR IMAGEN
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setHeroFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <div>
            <Field
              label="CATEGORÍA"
              name="heroEyebrow"
              value={content.heroEyebrow}
            />
            <Field
              label="TÍTULO"
              name="heroTitle"
              value={content.heroTitle}
              area
            />
            <Field
              label="PALABRA DESTACADA"
              name="heroAccent"
              value={content.heroAccent}
            />
            <Field
              label="INTRODUCCIÓN"
              name="heroIntro"
              value={content.heroIntro}
              area
            />
            <Field label="BOTÓN" name="heroButton" value={content.heroButton} />
          </div>
        </div>
      </section>
      <section>
        <span>02 · LA MANADA</span>
        <div className="form-grid">
          <Field
            label="CATEGORÍA"
            name="introEyebrow"
            value={content.introEyebrow}
          />
          <Field label="TÍTULO" name="introTitle" value={content.introTitle} />
          <Field
            label="PALABRA DESTACADA"
            name="introAccent"
            value={content.introAccent}
          />
          <Field
            label="TEXTO"
            name="introBody"
            value={content.introBody}
            area
          />
          <Field label="ENLACE" name="introLink" value={content.introLink} />
        </div>
      </section>
      <section>
        <span>03 · PRÓXIMAS AVENTURAS</span>
        <div className="form-grid">
          <Field
            label="CATEGORÍA"
            name="adventuresEyebrow"
            value={content.adventuresEyebrow}
          />
          <Field
            label="TÍTULO"
            name="adventuresTitle"
            value={content.adventuresTitle}
          />
          <Field
            label="DESCRIPCIÓN"
            name="adventuresBody"
            value={content.adventuresBody}
            area
          />
          <Field
            label="BOTÓN"
            name="adventuresButton"
            value={content.adventuresButton}
          />
        </div>
      </section>
      <section>
        <span>04 · CÓMO FUNCIONA</span>
        <div className="site-image-grid">
          <label>
            IMAGEN DE LA SECCIÓN
            <img
              src={howFile ? URL.createObjectURL(howFile) : howImage}
              alt="Imagen actual de cómo funciona"
            />
            <span>
              <Upload />
              CAMBIAR IMAGEN
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setHowFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <div>
            <Field
              label="CATEGORÍA"
              name="howEyebrow"
              value={content.howEyebrow}
            />
            <Field label="TÍTULO" name="howTitle" value={content.howTitle} />
            {content.howSteps.map((step, index) => (
              <div className="site-step-fields" key={index}>
                <Field
                  label={`PASO ${index + 1}`}
                  name={`howStep${index}Title`}
                  value={step.title}
                />
                <Field
                  label="DESCRIPCIÓN"
                  name={`howStep${index}Body`}
                  value={step.body}
                />
              </div>
            ))}
          </div>
        </div>
      </section>
      <section>
        <span>05 · INSTAGRAM</span>
        <div className="form-grid">
          <Field
            label="CATEGORÍA"
            name="instagramEyebrow"
            value={content.instagramEyebrow}
          />
          <Field
            label="TÍTULO"
            name="instagramTitle"
            value={content.instagramTitle}
          />
          <Field
            label="DESCRIPCIÓN"
            name="instagramBody"
            value={content.instagramBody}
            area
          />
          <Field
            label="BOTÓN"
            name="instagramCta"
            value={content.instagramCta}
          />
          <Field
            label="URL DEL PERFIL"
            name="instagramUrl"
            value={content.instagramUrl}
          />
          {content.instagramEmbeds.map((url, index) => (
            <Field
              key={index}
              label={`URL PUBLICACIÓN ${index + 1}`}
              name={`instagramEmbed${index}`}
              value={url}
            />
          ))}
        </div>
      </section>
      <section>
        <span>06 · CIERRE Y FOOTER</span>
        <div className="form-grid">
          <Field label="FRASE FINAL" name="quote" value={content.quote} area />
          <Field
            label="FIRMA DE LA FRASE"
            name="quoteAttribution"
            value={content.quoteAttribution}
          />
          <Field
            label="TEXTO DEL FOOTER"
            name="footerText"
            value={content.footerText}
          />
          <Field
            label="URL INSTAGRAM"
            name="footerInstagramUrl"
            value={content.footerInstagramUrl}
          />
          <Field
            label="URL WHATSAPP"
            name="footerWhatsappUrl"
            value={content.footerWhatsappUrl}
            required={false}
            placeholder="2221234567 o https://wa.me/522221234567"
          />
          <Field
            label="URL TÉRMINOS"
            name="footerTermsUrl"
            value={content.footerTermsUrl}
            placeholder="/terminos"
          />
        </div>
      </section>
      {message && <p className="admin-feedback">{message}</p>}
      <div className="admin-form-actions">
        <a href="/" target="_blank" rel="noreferrer">
          VER LANDING
        </a>
        <button className="button button-primary" disabled={busy}>
          <Save />
          {busy ? "GUARDANDO…" : "GUARDAR LANDING"}
        </button>
      </div>
    </form>
  );
}

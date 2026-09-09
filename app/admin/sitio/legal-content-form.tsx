"use client";
import { FormEvent, useState } from "react";
import { Save } from "lucide-react";
import type { LegalContent } from "../../lib/legal-content";
export function LegalContentForm({
  id,
  initial,
}: {
  id: "terms" | "privacy";
  initial: LegalContent;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const sections = initial.sections.map((_, index) => ({
      title: String(data.get(`title${index}`) ?? ""),
      body: String(data.get(`body${index}`) ?? ""),
    }));
    const response = await fetch(`/api/admin/site/legal/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eyebrow: data.get("eyebrow"),
        title: data.get("title"),
        intro: data.get("intro"),
        sections,
      }),
    });
    const result = (await response.json()) as { error?: string };
    setBusy(false);
    setMessage(
      response.ok
        ? "Página actualizada."
        : (result.error ?? "No pudimos guardarla."),
    );
  };
  return (
    <form className="legal-content-admin" onSubmit={submit}>
      <label>
        CATEGORÍA
        <input required name="eyebrow" defaultValue={initial.eyebrow} />
      </label>
      <label>
        TÍTULO
        <input required name="title" defaultValue={initial.title} />
      </label>
      <label>
        INTRODUCCIÓN
        <textarea required name="intro" defaultValue={initial.intro} />
      </label>
      {initial.sections.map((section, index) => (
        <div key={index}>
          <label>
            SECCIÓN {index + 1}
            <input
              required
              name={`title${index}`}
              defaultValue={section.title}
            />
          </label>
          <label>
            CONTENIDO
            <textarea
              required
              name={`body${index}`}
              defaultValue={section.body}
            />
          </label>
        </div>
      ))}
      <button disabled={busy}>
        <Save />
        {busy ? "GUARDANDO…" : "GUARDAR PÁGINA"}
      </button>
      {message && <small role="status">{message}</small>}
    </form>
  );
}

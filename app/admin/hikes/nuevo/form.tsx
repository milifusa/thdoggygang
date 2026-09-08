"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { CircleCheck } from "lucide-react";

export type HikeFormInitial = {
  name: string;
  slug: string;
  description: string;
  startsAt: string;
  location: string;
  price: number;
  capacity: number;
  maxDogs: number | null;
  distance: number | null;
  elevation: number | null;
  duration: number | null;
  difficulty: string | null;
  terrain: string | null;
  published: boolean;
};

export function NewHikeForm({
  demo,
  hikeId,
  initial,
}: {
  demo: boolean;
  hikeId?: string;
  initial?: HikeFormInitial;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [createdSlug, setCreatedSlug] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const localDate = String(data.get("startsAt"));
    const startsAt = new Date(localDate).toISOString();
    const payload = {
      name: data.get("name"),
      slug: data.get("slug"),
      description: data.get("description"),
      startsAt,
      locationName: data.get("location"),
      priceCents: Math.round(Number(data.get("price")) * 100),
      capacity: Number(data.get("capacity")),
      maxDogs: Number(data.get("maxDogs")) || null,
      distanceKm: Number(data.get("distance")) || null,
      elevationM: Number(data.get("elevation")) || null,
      durationMinutes: Number(data.get("duration")) || null,
      difficulty: data.get("difficulty"),
      terrain: data.get("terrain"),
      published: data.get("published") === "on",
    };
    try {
      if (demo) {
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        setCreatedSlug(String(payload.slug));
        setMessage(hikeId ? "Cambios guardados en la vista demostrativa." : "Aventura creada en la vista demostrativa.");
        return;
      }
      const response = await fetch(hikeId ? `/api/admin/hikes/${hikeId}` : "/api/admin/hikes", {
        method: hikeId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        hike?: { slug: string };
        error?: string;
      };
      if (!response.ok || !result.hike)
        throw new Error(result.error ?? "No pudimos guardar el hike.");
      setCreatedSlug(result.hike.slug);
      setMessage(hikeId ? "Cambios guardados correctamente." : "Aventura creada correctamente.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No pudimos guardar el hike.",
      );
    } finally {
      setSaving(false);
    }
  };
  if (createdSlug)
    return (
      <div className="admin-form-success">
        <div>
          <CircleCheck aria-hidden="true" />
        </div>
        <h2>{hikeId ? "Cambios guardados" : "¡La aventura está lista!"}</h2>
        <p>{message}</p>
        <Link
          className="button button-primary"
          href={`/aventuras/${createdSlug}`}
        >
          VER AVENTURA →
        </Link>
        <Link href="/admin">VOLVER AL DASHBOARD</Link>
      </div>
    );
  return (
    <form className="admin-hike-form" onSubmit={submit}>
      <div className="form-section">
        <span>01 · GENERAL</span>
        <div className="form-grid">
          <label>
            NOMBRE
            <input required name="name" placeholder="Sendero del Encanto" defaultValue={initial?.name} />
          </label>
          <label>
            SLUG
            <input
              required
              pattern="[a-z0-9-]+"
              name="slug"
              placeholder="sendero-del-encanto"
              defaultValue={initial?.slug}
            />
          </label>
          <label className="full-field">
            DESCRIPCIÓN
            <textarea
              required
              minLength={20}
              name="description"
              placeholder="Cuéntale a la manada qué hace especial esta ruta."
              defaultValue={initial?.description}
            />
          </label>
          <label>
            FECHA Y HORA
            <input required name="startsAt" type="datetime-local" defaultValue={initial?.startsAt} />
          </label>
          <label>
            LUGAR
            <input required name="location" placeholder="Cholula, Puebla" defaultValue={initial?.location} />
          </label>
        </div>
      </div>
      <div className="form-section">
        <span>02 · RUTA Y CUPO</span>
        <div className="form-grid thirds">
          <label>
            PRECIO MXN
            <input
              required
              min="0"
              step="1"
              name="price"
              type="number"
              placeholder="350"
              defaultValue={initial?.price}
            />
          </label>
          <label>
            CUPO PERSONAS
            <input
              required
              min="1"
              name="capacity"
              type="number"
              placeholder="40"
              defaultValue={initial?.capacity}
            />
          </label>
          <label>
            MÁX. PERRITOS
            <input min="1" name="maxDogs" type="number" placeholder="30" defaultValue={initial?.maxDogs ?? ""} />
          </label>
          <label>
            DISTANCIA KM
            <input
              min="0.1"
              step="0.1"
              name="distance"
              type="number"
              placeholder="8"
              defaultValue={initial?.distance ?? ""}
            />
          </label>
          <label>
            ELEVACIÓN M
            <input min="0" name="elevation" type="number" placeholder="320" defaultValue={initial?.elevation ?? ""} />
          </label>
          <label>
            DURACIÓN MIN
            <input min="1" name="duration" type="number" placeholder="150" defaultValue={initial?.duration ?? ""} />
          </label>
          <label>
            DIFICULTAD
            <select name="difficulty" defaultValue={initial?.difficulty ?? "Fácil"}>
              <option>Fácil</option>
              <option>Fácil / media</option>
              <option>Media</option>
              <option>Alta</option>
            </select>
          </label>
          <label>
            TERRENO
            <input name="terrain" placeholder="Bosque y sendero" defaultValue={initial?.terrain ?? ""} />
          </label>
        </div>
      </div>
      <label className="publish-toggle">
        <input type="checkbox" name="published" defaultChecked={initial?.published} />
        <span>Publicar inmediatamente</span>
        <small>La aventura aparecerá en el sitio público.</small>
      </label>
      {message && <p className="wizard-error">{message}</p>}
      <div className="admin-form-actions">
        <Link href="/admin">CANCELAR</Link>
        <button className="button button-primary" disabled={saving}>
          {saving ? "GUARDANDO…" : hikeId ? "GUARDAR CAMBIOS" : "CREAR AVENTURA →"}
        </button>
      </div>
    </form>
  );
}

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
  dogPrice: number;
  pricingMode: "PER_PERSON" | "PERSON_DOG_BUNDLE";
  capacity: number;
  maxDogs: number | null;
  distance: number | null;
  elevation: number | null;
  duration: number | null;
  difficulty: string | null;
  terrain: string | null;
  includes: string[];
  excludes: string[];
  packingList: string[];
  dogSuitability: string;
  rules: string;
  cancellationPolicy: string;
  coverUrl: string | null;
  published: boolean;
  transportMode: "NONE" | "OPTIONAL" | "INCLUDED";
  transportCapacity: number | null;
  transportPrice: number;
  transportDeparturePlace: string;
  transportDepartureAt: string;
  transportReturnDetails: string;
  transportRules: string;
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
  const [pricingMode, setPricingMode] = useState<"PER_PERSON" | "PERSON_DOG_BUNDLE">(
    initial?.pricingMode ?? "PER_PERSON",
  );
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState(initial?.coverUrl ?? "");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const localDate = String(data.get("startsAt"));
    const startsAt = new Date(localDate).toISOString();
    const lines = (name: string) => String(data.get(name) ?? "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const payload = {
      name: data.get("name"),
      slug: data.get("slug"),
      description: data.get("description"),
      startsAt,
      locationName: data.get("location"),
      priceCents: Math.round(Number(data.get("price")) * 100),
      dogPriceCents: Math.round(Number(data.get("dogPrice")) * 100),
      pricingMode,
      capacity: Number(data.get("capacity")),
      maxDogs: Number(data.get("maxDogs")) || null,
      distanceKm: Number(data.get("distance")) || null,
      elevationM: Number(data.get("elevation")) || null,
      durationMinutes: Number(data.get("duration")) || null,
      difficulty: data.get("difficulty"),
      terrain: data.get("terrain"),
      includes: lines("includes"),
      excludes: lines("excludes"),
      packingList: lines("packingList"),
      dogSuitability: data.get("dogSuitability"),
      rules: data.get("rules"),
      cancellationPolicy: data.get("cancellationPolicy"),
      transportMode: data.get("transportMode"),
      transportCapacity: Number(data.get("transportCapacity")) || null,
      transportPriceCents: Math.round(Number(data.get("transportPrice") || 0) * 100),
      transportDeparturePlace: data.get("transportDeparturePlace") || null,
      transportDepartureAt: data.get("transportDepartureAt") ? new Date(String(data.get("transportDepartureAt"))).toISOString() : null,
      transportReturnDetails: data.get("transportReturnDetails") || null,
      transportRules: data.get("transportRules") || null,
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
        hike?: { id: string; slug: string };
        error?: string;
      };
      if (!response.ok || !result.hike)
        throw new Error(result.error ?? "No pudimos guardar el hike.");
      if (coverFile) {
        const coverForm = new FormData();
        coverForm.set("cover", coverFile);
        const coverResponse = await fetch(`/api/admin/hikes/${result.hike.id}/cover`, {
          method: "POST",
          body: coverForm,
        });
        const coverResult = (await coverResponse.json()) as { error?: string };
        if (!coverResponse.ok) {
          throw new Error(coverResult.error ?? "El hike se guardó, pero no pudimos subir la portada.");
        }
      }
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
          <label className="full-field hike-cover-field">
            PORTADA DEL HIKE
            <span>JPG, PNG o WebP · máximo 10 MB. Esta imagen aparecerá en el home y el detalle.</span>
            {coverPreview && <img src={coverPreview} alt="Vista previa de la portada" />}
            <input
              required={!initial?.coverUrl}
              name="cover"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setCoverFile(file);
                if (file) setCoverPreview(URL.createObjectURL(file));
              }}
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
          <label className="full-field">
            MODALIDAD DE COBRO
            <select
              name="pricingMode"
              value={pricingMode}
              onChange={(event) => setPricingMode(event.target.value as "PER_PERSON" | "PERSON_DOG_BUNDLE")}
            >
              <option value="PER_PERSON">Persona y perrito por separado</option>
              <option value="PERSON_DOG_BUNDLE">Paquete: 1 persona + 1 perrito</option>
            </select>
          </label>
          <label>
            {pricingMode === "PERSON_DOG_BUNDLE" ? "PRECIO PERSONA + PERRITO" : "PRECIO POR PERSONA"} MXN
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
            {pricingMode === "PERSON_DOG_BUNDLE" ? "PERRITO ADICIONAL" : "PRECIO POR PERRITO"} MXN
            <input
              required
              min="0"
              step="1"
              name="dogPrice"
              type="number"
              placeholder="100"
              defaultValue={initial?.dogPrice ?? 0}
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
      <div className="form-section">
        <span>03 · CONTENIDO DE LA AVENTURA</span>
        <div className="form-grid">
          <label>
            ESTO INCLUYE
            <textarea required name="includes" placeholder={"Guías de The Doggy Gang\nHidratación\nGalería digital"} defaultValue={initial?.includes.join("\n")} />
            <small>Escribe un elemento por línea.</small>
          </label>
          <label>
            NO INCLUYE
            <textarea name="excludes" placeholder={"Transporte\nAlimentos"} defaultValue={initial?.excludes.join("\n")} />
            <small>Escribe un elemento por línea.</small>
          </label>
          <label className="full-field">
            QUE NO SE TE OLVIDE
            <textarea required name="packingList" placeholder={"Correa fija y placa\nAgua para tu perrito\nCalzado con tracción"} defaultValue={initial?.packingList.join("\n")} />
            <small>Escribe un elemento por línea.</small>
          </label>
          <label className="full-field">
            ¿ESTA RUTA ES PARA MI PERRITO?
            <textarea
              required
              minLength={20}
              name="dogSuitability"
              defaultValue={initial?.dogSuitability ?? "Recomendada para perros sociables, sanos y con condición para caminar al menos 2.5 horas. Tamaños pequeños bien acondicionados también son bienvenidos."}
            />
          </label>
        </div>
      </div>
      <div className="form-section">
        <span>04 · TRANSPORTE</span>
        <div className="form-grid thirds">
          <label>
            MODALIDAD
            <select name="transportMode" defaultValue={initial?.transportMode ?? "NONE"}>
              <option value="NONE">Sin transporte</option>
              <option value="OPTIONAL">Opcional con costo</option>
              <option value="INCLUDED">Incluido en el hike</option>
            </select>
          </label>
          <label>
            CUPO DE TRANSPORTE
            <input min="0" name="transportCapacity" type="number" defaultValue={initial?.transportCapacity ?? ""} placeholder="24" />
          </label>
          <label>
            PRECIO POR PERSONA MXN
            <input min="0" step="1" name="transportPrice" type="number" defaultValue={initial?.transportPrice ?? 0} />
          </label>
          <label>
            LUGAR DE SALIDA
            <input name="transportDeparturePlace" defaultValue={initial?.transportDeparturePlace} placeholder="Angelópolis" />
          </label>
          <label>
            FECHA Y HORA DE SALIDA
            <input name="transportDepartureAt" type="datetime-local" defaultValue={initial?.transportDepartureAt} />
          </label>
          <label>
            DETALLES DE REGRESO
            <input name="transportReturnDetails" defaultValue={initial?.transportReturnDetails} placeholder="Regreso al finalizar la caminata" />
          </label>
          <label className="full-field">
            REGLAS DE TRANSPORTE
            <textarea name="transportRules" defaultValue={initial?.transportRules} placeholder="Indicaciones para personas y perritos durante el traslado." />
          </label>
        </div>
      </div>
      <div className="form-section">
        <span>05 · REGLAS Y CANCELACIONES</span>
        <div className="form-grid">
          <label className="full-field">
            REGLAS DE LA MANADA
            <textarea required minLength={10} name="rules" defaultValue={initial?.rules ?? "Todos los perritos deben permanecer con correa. Pedimos respeto por el entorno, los ritmos del grupo y las indicaciones de guías."} />
          </label>
          <label className="full-field">
            POLÍTICA DE CANCELACIÓN
            <textarea required minLength={10} name="cancellationPolicy" defaultValue={initial?.cancellationPolicy ?? "Puedes transferir tu lugar hasta 72 horas antes. Las rutas pueden reprogramarse por condiciones meteorológicas."} />
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
        <Link href="/admin/hikes">CANCELAR</Link>
        <button className="button button-primary" disabled={saving}>
          {saving ? "GUARDANDO…" : hikeId ? "GUARDAR CAMBIOS" : "CREAR AVENTURA →"}
        </button>
      </div>
    </form>
  );
}

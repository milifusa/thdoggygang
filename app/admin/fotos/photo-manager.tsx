"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { EyeOff, ExternalLink, Save, Trash2, Upload } from "lucide-react";

export type AdminPhoto = {
  id: string;
  title: string | null;
  caption: string | null;
  access: "FREE_WATERMARKED" | "FREE_ORIGINAL" | "PAID";
  price_cents: number | null;
  url: string;
};
export type GallerySettings = {
  published: boolean;
  defaultPriceCents: number;
  package5Cents: number | null;
  package10Cents: number | null;
  fullGalleryCents: number | null;
  coverPhotoId: string | null;
};

export function PhotoManager({
  hikeId,
  photos,
  gallery,
}: {
  hikeId: string;
  photos: AdminPhoto[];
  gallery?: GallerySettings;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy("upload");
    setMessage("");
    const source = new FormData(formElement);
    const files = source
      .getAll("photos")
      .filter((value): value is File => value instanceof File && value.size > 0);
    if (!files.length || files.length > 100) {
      setBusy("");
      return setMessage("Selecciona entre 1 y 100 fotos.");
    }
    setProgress({ done: 0, total: files.length });
    let done = 0;
    try {
      for (let index = 0; index < files.length; index += 4) {
        const batch = files.slice(index, index + 4);
        await Promise.all(
          batch.map(async (file) => {
            const body = new FormData();
            body.set("hikeId", hikeId);
            body.set("access", String(source.get("access") ?? "PAID"));
            body.set("price", String(source.get("price") ?? "90"));
            body.set("photos", file);
            const response = await fetch("/api/admin/photos", {
              method: "POST",
              body,
            });
            const result = (await response.json()) as { error?: string };
            if (!response.ok)
              throw new Error(result.error ?? `No pudimos procesar ${file.name}.`);
            done += 1;
            setProgress({ done, total: files.length });
          }),
        );
      }
      setMessage(`${done} fotos procesadas y cargadas.`);
      formElement.reset();
      router.refresh();
    } catch (error) {
      setMessage(
        `${done} de ${files.length} procesadas. ${error instanceof Error ? error.message : "Una foto no pudo cargarse."}`,
      );
    } finally {
      setBusy("");
    }
  }
  async function save(photo: AdminPhoto, form: HTMLFormElement) {
    setBusy(photo.id);
    setMessage("");
    const data = new FormData(form);
    const response = await fetch(`/api/admin/photos/${photo.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: data.get("title") || null,
        caption: data.get("caption") || null,
        access: data.get("access"),
        priceCents: Math.round(Number(data.get("price") || 0) * 100),
      }),
    });
    const result = (await response.json()) as { error?: string };
    setBusy("");
    if (!response.ok)
      return setMessage(result.error ?? "No pudimos guardar la foto.");
    setMessage("Foto actualizada.");
    router.refresh();
  }
  async function remove(photo: AdminPhoto) {
    if (!window.confirm("¿Quitar esta foto de la galería?")) return;
    setBusy(photo.id);
    const response = await fetch(`/api/admin/photos/${photo.id}`, {
      method: "DELETE",
    });
    const result = (await response.json()) as { error?: string };
    setBusy("");
    if (!response.ok)
      return setMessage(result.error ?? "No pudimos borrar la foto.");
    setMessage("Foto eliminada.");
    router.refresh();
  }
  async function bulk(
    action:
      | "FREE_WATERMARKED"
      | "FREE_ORIGINAL"
      | "PAID"
      | "HIDE"
      | "PUBLISH"
      | "DELETE",
  ) {
    if (!selected.length) return;
    if (
      action === "DELETE" &&
      !window.confirm(`¿Eliminar ${selected.length} fotografías?`)
    )
      return;
    let priceCents: number | undefined;
    if (action === "PAID") {
      const price = window.prompt(
        "Precio por fotografía en MXN",
        String((gallery?.defaultPriceCents ?? 9000) / 100),
      );
      if (price === null) return;
      priceCents = Math.round(Number(price) * 100);
      if (!Number.isFinite(priceCents) || priceCents < 0)
        return setMessage("Escribe un precio válido.");
    }
    setBusy("bulk");
    const response = await fetch("/api/admin/photos/bulk", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: selected, action, priceCents }),
    });
    const result = (await response.json()) as { error?: string };
    setBusy("");
    if (!response.ok)
      return setMessage(result.error ?? "No pudimos actualizar las fotos.");
    setSelected([]);
    setMessage("Acción aplicada correctamente.");
    router.refresh();
  }
  async function saveGallery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("gallery");
    const data = new FormData(event.currentTarget);
    const cents = (name: string) => {
      const value = String(data.get(name) ?? "");
      return value === "" ? null : Math.round(Number(value) * 100);
    };
    const response = await fetch("/api/admin/galleries", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hikeId,
        published: data.get("published") === "on",
        defaultPriceCents: cents("defaultPrice") ?? 9000,
        package5Cents: cents("package5"),
        package10Cents: cents("package10"),
        fullGalleryCents: cents("fullGallery"),
        coverPhotoId: data.get("coverPhotoId") || null,
      }),
    });
    const result = (await response.json()) as { error?: string };
    setBusy("");
    if (!response.ok)
      return setMessage(result.error ?? "No pudimos guardar la galería.");
    setMessage("Configuración de galería guardada.");
    router.refresh();
  }
  return (
    <>
      {gallery && (
        <form className="gallery-settings" onSubmit={saveGallery}>
          <div>
            <strong>CONFIGURACIÓN DE GALERÍA</strong>
            <label className="cms-toggle">
              <input
                type="checkbox"
                name="published"
                defaultChecked={gallery.published}
              />
              <i />
              <b>Galería publicada</b>
            </label>
          </div>
          <label>
            FOTO INDIVIDUAL
            <input
              name="defaultPrice"
              type="number"
              min="0"
              defaultValue={gallery.defaultPriceCents / 100}
            />
          </label>
          <label>
            PAQUETE 5
            <input
              name="package5"
              type="number"
              min="0"
              defaultValue={
                gallery.package5Cents === null
                  ? ""
                  : gallery.package5Cents / 100
              }
            />
          </label>
          <label>
            PAQUETE 10
            <input
              name="package10"
              type="number"
              min="0"
              defaultValue={
                gallery.package10Cents === null
                  ? ""
                  : gallery.package10Cents / 100
              }
            />
          </label>
          <label>
            GALERÍA COMPLETA
            <input
              name="fullGallery"
              type="number"
              min="0"
              defaultValue={
                gallery.fullGalleryCents === null
                  ? ""
                  : gallery.fullGalleryCents / 100
              }
            />
          </label>
          <label>
            PORTADA
            <select
              name="coverPhotoId"
              defaultValue={gallery.coverPhotoId ?? ""}
            >
              <option value="">Automática</option>
              {photos.map((photo, index) => (
                <option value={photo.id} key={photo.id}>
                  {photo.title ?? `Foto ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy === "gallery"}>
            <Save /> GUARDAR
          </button>
        </form>
      )}
      <form className="photo-upload-form" onSubmit={upload}>
        <div>
          <strong>Cargar fotos</strong>
          <span>
            Puedes subir hasta 100 imágenes. Se generan thumbnail, preview y
            marca de agua con el logo real; los originales permanecen privados.
          </span>
        </div>
        <label>
          ACCESO
          <select name="access" defaultValue="PAID">
            <option value="PAID">De pago</option>
            <option value="FREE_WATERMARKED">Gratis con marca</option>
            <option value="FREE_ORIGINAL">Original gratis</option>
          </select>
        </label>
        <label>
          PRECIO MXN
          <input name="price" type="number" min="0" defaultValue="90" />
        </label>
        <label className="photo-file-picker">
          <Upload /> SELECCIONAR FOTOS
          <input
            required
            multiple
            name="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
          />
        </label>
        <button className="button button-primary" disabled={busy === "upload"}>
          {busy === "upload"
            ? `${progress.done} / ${progress.total} PROCESADAS`
            : "CARGAR"}
        </button>
      </form>
      {busy === "upload" && (
        <div className="photo-upload-progress" aria-live="polite">
          <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          <b>{progress.done} / {progress.total} fotografías procesadas</b>
        </div>
      )}
      {message && <p className="admin-feedback">{message}</p>}
      {selected.length > 0 && (
        <div className="photo-bulk-toolbar">
          <strong>{selected.length} seleccionadas</strong>
          <button onClick={() => void bulk("FREE_WATERMARKED")}>
            GRATIS CON MARCA
          </button>
          <button onClick={() => void bulk("FREE_ORIGINAL")}>
            GRATIS ORIGINAL
          </button>
          <button onClick={() => void bulk("PAID")}>DE PAGO</button>
          <button onClick={() => void bulk("HIDE")}>
            <EyeOff /> OCULTAR
          </button>
          <button onClick={() => void bulk("PUBLISH")}>PUBLICAR</button>
          <button onClick={() => void bulk("DELETE")}>
            <Trash2 /> ELIMINAR
          </button>
        </div>
      )}
      <div className="admin-photo-grid">
        {photos.map((photo) => (
          <form
            key={photo.id}
            onSubmit={(event) => {
              event.preventDefault();
              void save(photo, event.currentTarget);
            }}
          >
            <label className="photo-admin-select">
              <input
                type="checkbox"
                checked={selected.includes(photo.id)}
                onChange={() =>
                  setSelected((items) =>
                    items.includes(photo.id)
                      ? items.filter((id) => id !== photo.id)
                      : [...items, photo.id],
                  )
                }
              />
              <span>SELECCIONAR</span>
            </label>
            <img src={photo.url} alt={photo.title ?? "Foto del hike"} />
            <label>
              TÍTULO
              <input name="title" defaultValue={photo.title ?? ""} />
            </label>
            <label>
              DESCRIPCIÓN
              <input name="caption" defaultValue={photo.caption ?? ""} />
            </label>
            <div>
              <label>
                ACCESO
                <select name="access" defaultValue={photo.access}>
                  <option value="PAID">De pago</option>
                  <option value="FREE_WATERMARKED">Gratis con marca</option>
                  <option value="FREE_ORIGINAL">Original gratis</option>
                </select>
              </label>
              <label>
                PRECIO
                <input
                  name="price"
                  type="number"
                  min="0"
                  defaultValue={(photo.price_cents ?? 0) / 100}
                />
              </label>
            </div>
            <div className="admin-photo-actions">
              <button disabled={busy === photo.id}>
                <Save /> GUARDAR
              </button>
              <button
                type="button"
                disabled={busy === photo.id}
                onClick={() => void remove(photo)}
              >
                <Trash2 /> BORRAR
              </button>
              <a href={photo.url} target="_blank" rel="noreferrer">
                <ExternalLink /> VISTA
              </a>
            </div>
          </form>
        ))}
      </div>
    </>
  );
}

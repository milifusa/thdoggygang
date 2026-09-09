"use client";

import { ChangeEvent, useState } from "react";
import { ScanSearch, Upload } from "lucide-react";
import type { GalleryPhoto } from "./photo-gallery";

async function fingerprint(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Tu navegador no admite el análisis visual.");
  context.drawImage(bitmap, 0, 0, 48, 48);
  bitmap.close();
  const pixels = context.getImageData(0, 0, 48, 48).data;
  const vector = new Array(24).fill(0) as number[];
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue;
    vector[Math.min(7, Math.floor(pixels[index] / 32))] += 1;
    vector[8 + Math.min(7, Math.floor(pixels[index + 1] / 32))] += 1;
    vector[16 + Math.min(7, Math.floor(pixels[index + 2] / 32))] += 1;
  }
  const count = pixels.length / 4 || 1;
  return vector.map((value) => value / count);
}

const similarity = (left: number[], right: number[]) =>
  1 - left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0) / 6;

export function DogPhotoFinder({ photos, onMatches }: { photos: GalleryPhoto[]; onMatches: (ids: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const find = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("Analizando la galería en tu dispositivo…");
    try {
      const reference = await fingerprint(file);
      const scored: { id: string; score: number }[] = [];
      for (let index = 0; index < photos.length; index += 6) {
        const results = await Promise.all(
          photos.slice(index, index + 6).map(async (photo) => {
            try {
              const response = await fetch(photo.url);
              if (!response.ok) return null;
              return { id: photo.id, score: similarity(reference, await fingerprint(await response.blob())) };
            } catch {
              return null;
            }
          }),
        );
        scored.push(...results.filter((result): result is { id: string; score: number } => Boolean(result)));
      }
      scored.sort((left, right) => right.score - left.score);
      const limit = Math.min(18, Math.max(6, Math.ceil(scored.length * 0.18)));
      const ids = scored.slice(0, limit).filter((item, index) => item.score >= 0.42 || index < 6).map((item) => item.id);
      onMatches(ids);
      setMessage(ids.length ? `Mostramos ${ids.length} coincidencias visuales para que confirmes cuáles son tuyas.` : "No encontramos coincidencias claras. Prueba con otra foto de frente y con buena luz.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos analizar las fotos.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };
  return <section className="dog-photo-finder"><ScanSearch /><div><strong>ENCUENTRA A TU PERRITO</strong><p>Sube una foto de referencia. El análisis se realiza en tu navegador y la imagen no se guarda.</p><small>Es una coincidencia visual orientativa; confirma cada resultado antes de comprar.</small></div><label className={busy ? "busy" : ""}><Upload />{busy ? "ANALIZANDO…" : "ELEGIR FOTO"}<input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void find(event)} /></label>{message && <p role="status">{message}</p>}</section>;
}

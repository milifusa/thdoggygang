"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Download } from "lucide-react";

export type GalleryPhoto = {
  id: string;
  title: string | null;
  caption: string | null;
  access: "FREE_WATERMARKED" | "FREE_ORIGINAL" | "PAID";
  priceCents: number;
  url: string;
  purchased: boolean;
};

export function PhotoGallery({
  hikeName,
  hikeSlug,
  hikeDate,
  photos,
  packages,
}: {
  hikeName: string;
  hikeSlug: string;
  hikeDate: string;
  photos: GalleryPhoto[];
  packages: { five:number|null;ten:number|null;full:number|null };
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"ALL" | "FREE" | "PURCHASED">("ALL");
  const [purchaseMode,setPurchaseMode]=useState<"INDIVIDUAL"|"FIVE"|"TEN"|"FULL">("INDIVIDUAL");
  const visible = photos.filter(
    (photo) =>
      filter === "ALL" ||
      (filter === "FREE" && photo.access !== "PAID") ||
      (filter === "PURCHASED" && photo.purchased),
  );
  const paidPhotos = photos.filter((photo) => selected.includes(photo.id));
  const packageTotal=purchaseMode==="FIVE"?packages.five:purchaseMode==="TEN"?packages.ten:purchaseMode==="FULL"?packages.full:null;
  const total = useMemo(() => packageTotal ?? paidPhotos.reduce((sum, p) => sum + p.priceCents, 0), [packageTotal,paidPhotos]);
  const availablePaid=photos.filter((photo)=>photo.access==="PAID"&&!photo.purchased);
  const choosePackage=(mode:"FIVE"|"TEN"|"FULL")=>{const count=mode==="FIVE"?5:mode==="TEN"?10:availablePaid.length;if(availablePaid.length<count){setMessage(`Sólo hay ${availablePaid.length} fotos de pago disponibles.`);return;}setSelected(availablePaid.slice(0,count).map((photo)=>photo.id));setPurchaseMode(mode);setMessage(mode==="FULL"?"Seleccionamos toda la galería disponible.":`Seleccionamos ${count} fotos para este paquete.`);};
  async function checkout() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/checkout/photos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ photoIds: selected, hikeSlug, purchaseMode }),
    });
    const result = (await response.json()) as { url?: string; error?: string };
    setBusy(false);
    if (response.status === 401) {
      window.location.href = `/ingresar?next=${encodeURIComponent(`/galeria/${hikeSlug}`)}`;
      return;
    }
    if (!response.ok || !result.url)
      return setMessage(result.error ?? "No pudimos iniciar el pago.");
    window.location.href = result.url;
  }
  return (
    <main className="gallery-page">
      <header className="gallery-header">
        <Link className="wordmark" href="/">
          THE DOGGY <span>GANG</span>
        </Link>
        <div>
          <Link href="/mis-fotos">MIS FOTOS</Link>
          <Link href="/mi-manada">MI MANADA</Link>
        </div>
      </header>
      <section className="gallery-title">
        <p className="eyebrow">
          {hikeName.toUpperCase()} ·{" "}
          {new Intl.DateTimeFormat("es-MX", {
            dateStyle: "medium",
            timeZone: "America/Mexico_City",
          })
            .format(new Date(hikeDate))
            .toUpperCase()}
        </p>
        <h1>
          Revive la
          <br />
          <em>aventura.</em>
        </h1>
        <p>
          {photos.length
            ? `Encontramos ${photos.length} recuerdos de la manada. Elige tus favoritos y llévalos contigo.`
            : "La galería de esta aventura estará disponible muy pronto."}
        </p>
      </section>
      <div className="gallery-toolbar">
        <span>
          {visible.length} DE {photos.length} FOTOS
        </span>
        <div>
          <button
            className={filter === "ALL" ? "active" : ""}
            onClick={() => setFilter("ALL")}
          >
            TODAS
          </button>
          <button
            className={filter === "FREE" ? "active" : ""}
            onClick={() => setFilter("FREE")}
          >
            GRATIS
          </button>
          <button
            className={filter === "PURCHASED" ? "active" : ""}
            onClick={() => setFilter("PURCHASED")}
          >
            COMPRADAS
          </button>
        </div>
      </div>
      {(packages.five!==null||packages.ten!==null||packages.full!==null)&&<section className="gallery-packages"><div><span>PAQUETES DE RECUERDOS</span><strong>Ahorra al llevar más fotos.</strong></div>{packages.five!==null&&<button onClick={()=>choosePackage("FIVE")}>5 FOTOS <b>{(packages.five/100).toLocaleString("es-MX",{style:"currency",currency:"MXN"})}</b></button>}{packages.ten!==null&&<button onClick={()=>choosePackage("TEN")}>10 FOTOS <b>{(packages.ten/100).toLocaleString("es-MX",{style:"currency",currency:"MXN"})}</b></button>}{packages.full!==null&&<button onClick={()=>choosePackage("FULL")}>GALERÍA COMPLETA <b>{(packages.full/100).toLocaleString("es-MX",{style:"currency",currency:"MXN"})}</b></button>}</section>}
      <section className="photo-grid">
        {visible.map((photo, index) => {
          const isPaid = photo.access === "PAID" && !photo.purchased;
          const isSelected = selected.includes(photo.id);
          return (
            <article
              className={`photo-item ${isSelected ? "selected" : ""} ${index === 0 ? "wide" : ""}`}
              key={photo.id}
            >
              <img
                src={photo.url}
                alt={photo.title ?? `Recuerdo ${index + 1}`}
              />
              {isPaid ? (
                <button
                  aria-label="Seleccionar foto"
                  className="photo-select-button"
                  onClick={() =>
                    {setPurchaseMode("INDIVIDUAL");setSelected((items) => items.includes(photo.id) ? items.filter((id) => id !== photo.id) : [...items, photo.id]);}
                  }
                >
                  {isSelected ? <Check /> : "+"}
                </button>
              ) : (
                <a
                  className="photo-download-button"
                  href={`/api/photos/${photo.id}/download`}
                  aria-label="Descargar foto"
                >
                  <Download />
                </a>
              )}
              <div className="photo-meta">
                <strong>{photo.title ?? `Recuerdo ${index + 1}`}</strong>
                <span>
                  {photo.purchased
                    ? "COMPRADA"
                    : isPaid
                      ? `$${(photo.priceCents / 100).toLocaleString("es-MX")} MXN`
                      : "DESCARGA GRATIS"}
                </span>
              </div>
            </article>
          );
        })}
      </section>
      {selected.length > 0 && (
        <aside className="photo-cart">
          <div>
            <span>TUS RECUERDOS</span>
            <strong>
              {selected.length}{" "}
              {selected.length === 1
                ? "foto seleccionada"
                : "fotos seleccionadas"}
            </strong>
          </div>
          <div>
            <small>TOTAL</small>
            <strong>
              {(total / 100).toLocaleString("es-MX", {
                style: "currency",
                currency: "MXN",
              })}
            </strong>
          </div>
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => void checkout()}
          >
            {busy ? "ABRIENDO PAGO…" : "COMPRAR FOTOS"}
          </button>
          {message && <p>{message}</p>}
        </aside>
      )}
    </main>
  );
}

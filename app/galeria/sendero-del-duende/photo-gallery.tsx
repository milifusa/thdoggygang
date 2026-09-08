"use client";
import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";

const photos = [
  "photo-1558788353-f76d92427f16",
  "photo-1534361960057-19889db9621e",
  "photo-1450778869180-41d0601e046e",
  "photo-1507146426996-ef05306b995a",
  "photo-1552053831-71594a27632d",
  "photo-1517849845537-4d257902454a",
  "photo-1548199973-03cce0bbc87b",
  "photo-1537151608828-ea2b11777ee8",
  "photo-1508675801627-066ac4346a85",
].map((id, index) => ({
  id: index,
  url: `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=82`,
  free: index === 0,
}));

export function PhotoGallery() {
  const [selected, setSelected] = useState<number[]>([]);
  const toggle = (id: number) =>
    setSelected((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  return (
    <main className="gallery-page">
      <header className="gallery-header">
        <Link className="wordmark" href="/">
          THE DOGGY <span>GANG</span>
        </Link>
        <Link href="/mi-manada">MI MANADA →</Link>
      </header>
      <section className="gallery-title">
        <p className="eyebrow">SENDER0 DEL DUENDE · 20 SEP 2026</p>
        <h1>
          Revive la
          <br />
          <em>aventura.</em>
        </h1>
        <p>
          Encontramos 48 recuerdos de la manada. Elige tus favoritos y llévalos
          contigo.
        </p>
      </section>
      <div className="gallery-toolbar">
        <span>48 FOTOS</span>
        <div>
          <button className="active">TODAS</button>
          <button>MIS FAVORITAS</button>
          <button>GRATIS</button>
        </div>
      </div>
      <section className="photo-grid">
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            onClick={() => toggle(photo.id)}
            className={`photo-item ${selected.includes(photo.id) ? "selected" : ""} ${index === 0 ? "wide" : ""}`}
          >
            <img src={photo.url} alt={`Recuerdo ${index + 1} de la aventura`} />
            {!photo.free && <span className="watermark">THE DOGGY GANG</span>}
            <i>
              {selected.includes(photo.id) ? <Check aria-hidden="true" /> : "+"}
            </i>
            {photo.free && <em>GRATIS</em>}
          </button>
        ))}
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
            <small>
              PAQUETE{" "}
              {selected.length <= 1
                ? "INDIVIDUAL"
                : selected.length <= 5
                  ? "5 FOTOS"
                  : "10 FOTOS"}
            </small>
            <strong>
              ${selected.length <= 1 ? 90 : selected.length <= 5 ? 320 : 520}{" "}
              MXN
            </strong>
          </div>
          <button className="button button-primary">CONTINUAR →</button>
        </aside>
      )}
    </main>
  );
}

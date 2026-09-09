"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Award,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  MapPin,
  Route,
  X,
} from "lucide-react";

export type PassportAdventure = {
  id: string;
  name: string;
  date: string;
  location: string;
  distance: number;
  elevation: number;
};

type PassportPage =
  | { kind: "identity" }
  | { kind: "summary" }
  | { kind: "stamp"; adventure: PassportAdventure; number: number }
  | { kind: "next" };

export function PassportBook({
  memberName,
  adventures,
  distance,
  elevation,
  level,
}: {
  memberName: string;
  adventures: PassportAdventure[];
  distance: number;
  elevation: number;
  level: string;
}) {
  const [open, setOpen] = useState(false);
  const [spread, setSpread] = useState(0);
  const [mobilePage, setMobilePage] = useState(0);
  const pages = useMemo<PassportPage[]>(
    () => [
      { kind: "identity" },
      { kind: "summary" },
      ...adventures.map((adventure, index) => ({
        kind: "stamp" as const,
        adventure,
        number: index + 1,
      })),
      { kind: "next" },
    ],
    [adventures],
  );
  const spreads = Math.ceil(pages.length / 2);
  const leftPage = pages[spread * 2];
  const rightPage = pages[spread * 2 + 1];

  const goTo = (next: number) => {
    setSpread(Math.max(0, Math.min(spreads - 1, next)));
  };

  const renderPage = (page: PassportPage | undefined, pageNumber: number) => {
    if (!page) return <div className="passport-paper passport-paper-empty" />;
    if (page.kind === "identity")
      return (
        <div className="passport-paper passport-identity">
          <span className="passport-page-label">IDENTIDAD DE LA MANADA</span>
          <img src="/brand/logo-circular-blue.png" alt="The Doggy Gang" />
          <small>TITULAR</small>
          <h2>{memberName}</h2>
          <div className="passport-code">TDG · MX</div>
          <p>Este pasaporte registra las aventuras compartidas con The Doggy Gang.</p>
          <i>{pageNumber}</i>
        </div>
      );
    if (page.kind === "summary")
      return (
        <div className="passport-paper passport-summary-page">
          <span className="passport-page-label">TRAYECTORIA</span>
          <h2>{level}</h2>
          <dl>
            <div><Award /><dt>Aventuras</dt><dd>{adventures.length}</dd></div>
            <div><Route /><dt>Kilómetros</dt><dd>{distance.toFixed(1)}</dd></div>
            <div><MapPin /><dt>Desnivel</dt><dd>{elevation.toLocaleString("es-MX")} m</dd></div>
          </dl>
          <p>{adventures.length < 5 ? `Faltan ${Math.max(0, 5 - adventures.length)} aventuras para llegar a Explorador de la Manada.` : "Tu experiencia ya inspira a nuevos miembros de la manada."}</p>
          <i>{pageNumber}</i>
        </div>
      );
    if (page.kind === "stamp")
      return (
        <div className="passport-paper passport-stamp-page" key={page.adventure.id}>
          <span className="passport-page-label">SELLO DE AVENTURA</span>
          <div className="passport-stamp" aria-label={`Sello ${page.number}`}>
            <img src="/brand/logo-circular-sun.png" alt="" />
            <b>{String(page.number).padStart(2, "0")}</b>
          </div>
          <small>{page.adventure.date}</small>
          <h2>{page.adventure.name}</h2>
          <p>{page.adventure.location}</p>
          <div className="passport-route-data">
            <span>{page.adventure.distance.toFixed(1)} KM</span>
            <span>{page.adventure.elevation.toLocaleString("es-MX")} M DESNIVEL</span>
          </div>
          <i>{pageNumber}</i>
        </div>
      );
    return (
      <div className="passport-paper passport-next-page">
        <span className="passport-page-label">SIGUIENTE DESTINO</span>
        <BookOpen />
        <h2>{adventures.length ? "Siempre hay más por explorar." : "Tu primer sello te está esperando."}</h2>
        <p>Elige la aventura que dejará la próxima marca en tu pasaporte.</p>
        <Link className="button button-primary" href="/aventuras">VER AVENTURAS</Link>
        <i>{pageNumber}</i>
      </div>
    );
  };

  return (
    <section className="passport-experience" aria-labelledby="passport-title">
      <div className="passport-intro">
        <div>
          <p className="eyebrow">PASAPORTE DE AVENTURAS</p>
          <h1 id="passport-title">Abre las huellas de tu manada.</h1>
          <p>Cada página guarda una ruta, un recuerdo y un nuevo sello.</p>
        </div>
        <a className="button passport-download" href="/api/passport/certificate">
          <Download /> DESCARGAR CERTIFICADO
        </a>
      </div>

      <div className={`passport-stage ${open ? "is-open" : ""}`}>
        <div className="passport-book" aria-live="polite">
          <button
            type="button"
            className="passport-cover"
            onClick={() => setOpen(true)}
            aria-label="Abrir pasaporte de aventuras"
            aria-expanded={open}
          >
            <span>THE DOGGY GANG · MÉXICO</span>
            <img src="/brand/logo-circular-sun.png" alt="" />
            <strong>PASAPORTE<br />DE AVENTURAS</strong>
            <small>TOCA PARA ABRIR</small>
          </button>
          <div className="passport-spread" aria-hidden={!open}>
            <div className="passport-page-turn" key={`left-${spread}`}>
              {renderPage(leftPage, spread * 2 + 1)}
            </div>
            <div className="passport-page-turn passport-page-turn-right" key={`right-${spread}`}>
              {renderPage(rightPage, spread * 2 + 2)}
            </div>
            <span className="passport-binding" aria-hidden="true" />
          </div>
          <div className="passport-mobile-page" aria-hidden={!open} key={`mobile-${mobilePage}`}>
            {renderPage(pages[mobilePage], mobilePage + 1)}
          </div>
        </div>
      </div>

      {open && (
        <div className="passport-controls">
          <button type="button" onClick={() => goTo(spread - 1)} disabled={spread === 0}>
            <ChevronLeft /> ANTERIOR
          </button>
          <span>{spread + 1} / {spreads}</span>
          <button type="button" onClick={() => goTo(spread + 1)} disabled={spread === spreads - 1}>
            SIGUIENTE <ChevronRight />
          </button>
          <button className="passport-close" type="button" onClick={() => { setOpen(false); setSpread(0); setMobilePage(0); }}>
            <X /> CERRAR
          </button>
        </div>
      )}
      {open && (
        <div className="passport-mobile-controls">
          <button type="button" onClick={() => setMobilePage((current) => Math.max(0, current - 1))} disabled={mobilePage === 0} aria-label="Página anterior"><ChevronLeft /></button>
          <span>{mobilePage + 1} / {pages.length}</span>
          <button type="button" onClick={() => setMobilePage((current) => Math.min(pages.length - 1, current + 1))} disabled={mobilePage === pages.length - 1} aria-label="Página siguiente"><ChevronRight /></button>
          <button className="passport-close" type="button" onClick={() => { setOpen(false); setSpread(0); setMobilePage(0); }}><X /> CERRAR</button>
        </div>
      )}
      {!open && <p className="passport-hint"><BookOpen /> Ábrelo como un pasaporte real para recorrer tus sellos.</p>}
    </section>
  );
}

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SiteHeader } from "../components/SiteHeader";
import { getAdventures } from "../lib/data";

export const metadata = {
  title: "Todas las aventuras | The Doggy Gang",
  description: "Explora todos los próximos hikes de The Doggy Gang.",
};
export const revalidate = 60;

export default async function AdventuresPage() {
  const adventures = await getAdventures();
  return (
    <main className="all-adventures-page">
      <SiteHeader />
      <section className="all-adventures-hero">
        <p className="eyebrow">ELIGE TU PRÓXIMA HISTORIA</p>
        <h1>Todas las aventuras.</h1>
        <p>Encuentra la ruta, fecha y modalidad de precio que mejor le quede a tu manada.</p>
      </section>
      <section className="adventure-grid all-adventures-grid">
        {adventures.map((adventure) => (
          <article className="adventure-card" key={adventure.id}>
            <Link href={`/aventuras/${adventure.slug}`} aria-label={`Ver ${adventure.title}`}>
              <div className="card-image-wrap">
                <img src={adventure.image} alt={`Portada de ${adventure.title}`} />
                <div className="date-tile">
                  <strong>{adventure.shortDate.split(" ")[0]}</strong>
                  <span>{adventure.shortDate.split(" ").slice(1).join(" ")}</span>
                </div>
              </div>
              <div className="card-body">
                <div className="location"><span aria-hidden="true">●</span>{adventure.location}</div>
                <h2>{adventure.title}</h2>
                <p className="card-meta">{adventure.distance.toUpperCase()} · {adventure.duration.toUpperCase()} · {adventure.difficulty.toUpperCase()}</p>
                <div className="card-footer">
                  <div>
                    <span>{adventure.pricingMode === "PERSON_DOG_BUNDLE" ? "PERSONA + PERRITO" : "DESDE"}</span>
                    <strong>${adventure.price.toLocaleString("es-MX")} <small>MXN</small></strong>
                  </div>
                  <div className="spots"><i />Cupo {adventure.spots}</div>
                  <span className="round-arrow" aria-hidden="true"><ArrowUpRight /></span>
                </div>
              </div>
            </Link>
          </article>
        ))}
        {!adventures.length && <p>No hay aventuras publicadas por el momento.</p>}
      </section>
    </main>
  );
}

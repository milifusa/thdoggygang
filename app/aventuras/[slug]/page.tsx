import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader } from '../../components/SiteHeader';
import { getAdventure } from '../../lib/data';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const hike = await getAdventure(slug);
  if (!hike) return { title: 'Aventura no encontrada | The Doggy Gang' };
  const image = hike.image.startsWith('http') ? hike.image : `${process.env.APP_ORIGIN ?? 'https://www.thedoggygang.com'}${hike.image}`;
  return {
    title: `${hike.title} | The Doggy Gang`,
    description: `${hike.date} · ${hike.location}. ${hike.description}`,
    openGraph: { title: hike.title, description: `${hike.date} · ${hike.location}`, images: [{ url: image }] },
  };
}

export default async function AdventurePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hike = await getAdventure(slug);
  if (!hike) notFound();
  return (
    <main className="detail-page">
      <SiteHeader />
      <section className="detail-hero">
        <img src={hike.image} alt={`Un perrito disfrutando ${hike.title}`} />
        <div className="detail-overlay" />
        <Link className="detail-back" href="/#aventuras">← TODAS LAS AVENTURAS</Link>
        <div className="detail-title"><p className="eyebrow light">{hike.shortDate} · {hike.location}</p><h1>{hike.title}</h1></div>
      </section>

      <section className="detail-shell">
        <div className="detail-main">
          <div className="fact-row">
            <div><span>DISTANCIA</span><strong>{hike.distance}</strong></div><div><span>DURACIÓN</span><strong>{hike.duration}</strong></div><div><span>DIFICULTAD</span><strong>{hike.difficulty}</strong></div><div><span>ELEVACIÓN</span><strong>{hike.elevation}</strong></div>
          </div>
          <div className="detail-story">
            <p className="eyebrow">SOBRE LA AVENTURA</p><h2 className="preserve-lines">{hike.storyTitle}</h2><p>{hike.description}</p>
          </div>
          <div className="info-columns">
            <div><h3>Esto incluye</h3><ul>{hike.includes.map((item) => <li key={item}>{item}</li>)}</ul>{!hike.includes.length && <p>Consulta los detalles con el equipo.</p>}</div>
            <div><h3>Que no se te olvide</h3><ul>{hike.packingList.map((item) => <li key={item}>{item}</li>)}</ul>{!hike.packingList.length && <p>Consulta las recomendaciones con el equipo.</p>}</div>
          </div>
          {hike.excludes.length > 0 && <div className="not-included"><h3>No incluye</h3><ul>{hike.excludes.map((item) => <li key={item}>{item}</li>)}</ul></div>}
          <div className="recommendation"><span>DG</span><div><strong>¿Esta ruta es para mi perrito?</strong><p>{hike.dogSuitability}</p></div></div>
          <div className="rules-block"><h3>Antes de caminar juntos</h3><details open><summary>Reglas de la manada</summary><p>{hike.rules}</p></details><details><summary>Cancelaciones</summary><p>{hike.cancellationPolicy}</p></details></div>
        </div>
        <aside className="booking-card">
          <p className="booking-date">{hike.date}</p><h3>{hike.time}</h3><p className="muted">Punto de encuentro confirmado 24 horas antes.</p>
          {hike.pricingMode === 'PERSON_DOG_BUNDLE' ? <>
            <div className="price-line"><span>1 persona + 1 perrito</span><strong>${hike.price.toLocaleString('es-MX')} <small>MXN</small></strong></div>
            <div className="price-secondary"><span>Perrito adicional</span><strong>+${hike.dogPrice.toLocaleString('es-MX')} MXN</strong></div>
          </> : <>
            <div className="price-line"><span>Precio por persona</span><strong>${hike.price.toLocaleString('es-MX')} <small>MXN</small></strong></div>
            <div className="price-secondary"><span>Precio por perrito</span><strong>+${hike.dogPrice.toLocaleString('es-MX')} MXN</strong></div>
          </>}
          <div className="availability"><i /> Cupo para {hike.spots} personas</div>
          {hike.transportAvailable && <div className="transport-note"><span>BUS</span><p><strong>Transporte disponible</strong><br />{hike.transportDeparture ? `Desde ${hike.transportDeparture}` : 'Punto por confirmar'} · +${hike.transportPrice.toLocaleString('es-MX')}</p></div>}
          <Link className="button button-primary full-button" href={`/reservar/${hike.slug}`}>QUIERO IR <span>→</span></Link>
          <p className="secure-note">Reserva segura · Confirmación inmediata</p>
        </aside>
      </section>
      <div className="mobile-sticky"><div><span>DESDE</span><strong>${hike.price} MXN</strong></div><Link className="button button-primary" href={`/reservar/${hike.slug}`}>QUIERO IR →</Link></div>
    </main>
  );
}

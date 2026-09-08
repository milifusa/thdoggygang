import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '../../components/SiteHeader';
import { getAdventure } from '../../lib/data';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const hike = getAdventure(slug);
  return {
    title: `${hike.title} | The Doggy Gang`,
    description: `${hike.date} · ${hike.location}. ${hike.description}`,
    openGraph: { title: hike.title, description: `${hike.date} · ${hike.location}`, images: [{ url: hike.image }] },
  };
}

export default async function AdventurePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hike = getAdventure(slug);
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
            <p className="eyebrow">SOBRE LA AVENTURA</p><h2>Respira bosque.<br />Camina en manada.</h2><p>{hike.description}</p>
          </div>
          <div className="info-columns">
            <div><h3>Esto incluye</h3><ul><li>Guías de The Doggy Gang</li><li>Kit de bienvenida</li><li>Hidratación durante la ruta</li><li>Galería digital de recuerdos</li></ul></div>
            <div><h3>Que no se te olvide</h3><ul><li>Correa fija y placa</li><li>Agua para tu perrito</li><li>Calzado con buena tracción</li><li>Bolsitas y snacks</li></ul></div>
          </div>
          <div className="recommendation"><span>DG</span><div><strong>¿Esta ruta es para mi perrito?</strong><p>Recomendada para perros sociables, sanos y con condición para caminar al menos 2.5 horas. Tamaños pequeños bien acondicionados también son bienvenidos.</p></div></div>
          <div className="rules-block"><h3>Antes de caminar juntos</h3><details open><summary>Reglas de la manada</summary><p>Todos los perritos deben permanecer con correa. Pedimos respeto por el entorno, los ritmos del grupo y las indicaciones de guías.</p></details><details><summary>Cancelaciones</summary><p>Puedes transferir tu lugar hasta 72 horas antes. Las rutas pueden reprogramarse por condiciones meteorológicas.</p></details></div>
        </div>
        <aside className="booking-card">
          <p className="booking-date">{hike.date}</p><h3>{hike.time}</h3><p className="muted">Punto de encuentro confirmado 24 horas antes.</p>
          <div className="price-line"><span>Precio por persona</span><strong>${hike.price} <small>MXN</small></strong></div>
          <div className="availability"><i /> Sólo quedan {hike.spots} lugares</div>
          <div className="transport-note"><span>BUS</span><p><strong>Transporte disponible</strong><br />Desde Angelópolis · +$200</p></div>
          <Link className="button button-primary full-button" href={`/reservar/${hike.slug}`}>QUIERO IR <span>→</span></Link>
          <p className="secure-note">Reserva segura · Confirmación inmediata</p>
        </aside>
      </section>
      <div className="mobile-sticky"><div><span>DESDE</span><strong>${hike.price} MXN</strong></div><Link className="button button-primary" href={`/reservar/${hike.slug}`}>QUIERO IR →</Link></div>
    </main>
  );
}

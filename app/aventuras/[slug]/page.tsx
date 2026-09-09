import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck } from 'lucide-react';
import { SiteHeader } from '../../components/SiteHeader';
import { getAdventure, getAdventureReviews } from '../../lib/data';
import { SITE_ORIGIN } from '../../lib/site-url';
import { WaitlistButton } from './waitlist-button';

const origin = SITE_ORIGIN;
const concise = (value: string, length = 155) => value.length <= length ? value : `${value.slice(0, length - 1).trim()}…`;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const hike = await getAdventure(slug);
  if (!hike) return { title: 'Aventura no encontrada | The Doggy Gang' };
  const image = hike.image.startsWith('http') ? hike.image : `${origin}${hike.image}`;
  const title = `${hike.title}: hike con perros en ${hike.location} | The Doggy Gang`;
  const description = concise(`${hike.description} Consulta fecha, dificultad, precio y reserva este hike pet friendly en ${hike.location}.`);
  return {
    title,
    description,
    alternates: { canonical: `/aventuras/${hike.slug}` },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `/aventuras/${hike.slug}`,
      images: [{ url: image, alt: `${hike.title}, hike con perros` }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function AdventurePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hike = await getAdventure(slug);
  if (!hike) notFound();
  const reviews = await getAdventureReviews(hike.id);
  const url = `${origin}/aventuras/${hike.slug}`;
  const image = hike.image.startsWith('http') ? hike.image : `${origin}${hike.image}`;
  const endsAt = hike.durationMinutes
    ? new Date(new Date(hike.startsAt).getTime() + hike.durationMinutes * 60_000).toISOString()
    : undefined;
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Event',
      '@id': `${url}#event`,
      name: hike.title,
      description: hike.description,
      image: [image],
      startDate: hike.startsAt,
      ...(endsAt ? { endDate: endsAt } : {}),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: {
        '@type': 'Place',
        name: hike.location,
        address: {
          '@type': 'PostalAddress',
          addressLocality: hike.location,
          addressCountry: 'MX',
        },
      },
      organizer: { '@id': `${origin}/#organization` },
      maximumAttendeeCapacity: hike.spots,
      offers: {
        '@type': 'Offer',
        url: `${origin}/reservar/${hike.slug}`,
        price: hike.price.toFixed(2),
        priceCurrency: 'MXN',
        availability: hike.spots > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/SoldOut',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: origin },
        { '@type': 'ListItem', position: 2, name: 'Aventuras', item: `${origin}/aventuras` },
        { '@type': 'ListItem', position: 3, name: hike.title, item: url },
      ],
    },
  ];
  return (
    <main className="detail-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
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
          {hike.spots > 0 ? <Link className="button button-primary full-button" href={`/reservar/${hike.slug}`}>QUIERO IR <span>→</span></Link> : <WaitlistButton hikeId={hike.id} slug={hike.slug} />}
          <p className="secure-note">Reserva segura · Confirmación inmediata</p>
        </aside>
      </section>
      {reviews.length > 0 && <section className="hike-reviews"><div><p className="eyebrow">RESEÑAS VERIFICADAS</p><h2>Lo cuenta la manada.</h2></div><div>{reviews.map((review) => { const profile = Array.isArray(review.profile) ? review.profile[0] : review.profile; const average=(review.route_rating+review.guide_rating+(review.transport_rating??0))/(review.transport_rating?3:2); return <article key={review.id}><BadgeCheck/><strong>{profile?.first_name || 'Miembro de la manada'} · {average.toFixed(1)}/5</strong><p>{review.body || 'Calificó esta aventura después de asistir.'}</p><small>RUTA {review.route_rating}/5 · GUÍAS {review.guide_rating}/5{review.transport_rating?` · TRANSPORTE ${review.transport_rating}/5`:''}</small></article>;})}</div></section>}
      <div className="mobile-sticky"><div><span>{hike.spots > 0 ? 'DESDE' : 'CUPO'}</span><strong>{hike.spots > 0 ? `$${hike.price} MXN` : 'LISTA DE ESPERA'}</strong></div>{hike.spots > 0 ? <Link className="button button-primary" href={`/reservar/${hike.slug}`}>QUIERO IR →</Link> : <Link className="button button-primary" href="#lista-espera">VER DISPONIBILIDAD</Link>}</div>
    </main>
  );
}

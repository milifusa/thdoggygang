import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { getAdventures } from './lib/data';
import { getLandingSettings } from './lib/landing-content';
import { SiteHeader } from './components/SiteHeader';
import type { Metadata } from 'next';

export const revalidate = 60;
export const metadata: Metadata = {
  title: 'Hikes con perros en Puebla | The Doggy Gang',
  description: 'Descubre hikes y rutas de senderismo pet friendly en Puebla y el centro de México. Reserva una aventura para caminar con tu perro en manada.',
  alternates: { canonical: '/' },
};

export default async function Home() {
  const [adventures, landing] = await Promise.all([getAdventures(), getLandingSettings()]);
  const { content } = landing;
  return (
    <main>
      <SiteHeader />

      <section className="hero">
        <div className="hero-image" style={{ backgroundImage: `url("${landing.heroImage}")` }} aria-hidden="true" /><div className="hero-shade" />
        <div className="hero-copy">
          <p className="eyebrow light">{content.heroEyebrow}</p>
          <h1>{content.heroTitle} <em>{content.heroAccent}</em></h1>
          <p className="hero-intro">{content.heroIntro}</p>
          <a className="button button-primary" href="#aventuras">{content.heroButton} <ArrowDownRight aria-hidden="true" /></a>
        </div>
        <div className="hero-stamp" aria-hidden="true"><span>DESDE</span><strong>2019</strong><span>EN MANADA</span></div>
        <div className="scroll-cue" aria-hidden="true">SCROLL ↓</div>
      </section>

      <section className="intro" id="manada">
        <p className="eyebrow">{content.introEyebrow}</p>
        <div className="intro-grid">
          <h2>{content.introTitle} <span>{content.introAccent}</span></h2>
          <div><p>{content.introBody}</p><a className="text-link" href="#como-funciona">{content.introLink} <span>→</span></a></div>
        </div>
      </section>

      <section className="adventures" id="aventuras">
        <div className="section-heading">
          <div><p className="eyebrow">{content.adventuresEyebrow}</p><h2>{content.adventuresTitle}</h2></div>
          <p>{content.adventuresBody}</p>
        </div>
        <div className="adventure-grid">
          {adventures.map((adventure, index) => (
            <article className="adventure-card" key={adventure.slug}>
              <Link href={`/aventuras/${adventure.slug}`} aria-label={`Ver ${adventure.title}`}>
                <div className="card-image-wrap">
                  <img src={adventure.image} alt={`Perrito en la aventura ${adventure.title}`} />
                  <div className="date-tile"><strong>{adventure.shortDate.split(" ")[0]}</strong><span>{adventure.shortDate.split(" ").slice(1).join(" ")}</span></div>
                  {index === 0 && <span className="featured-badge">MÁS POPULAR</span>}
                </div>
                <div className="card-body">
                  <div className="location"><span aria-hidden="true">●</span>{adventure.location}</div>
                  <h3>{adventure.title}</h3><p className="card-meta">{adventure.distance.toUpperCase()} · {adventure.duration.toUpperCase()} · {adventure.difficulty.toUpperCase()}</p>
                  <div className="card-footer">
                    <div><span>DESDE</span><strong>${adventure.price.toLocaleString("es-MX")} <small>MXN</small></strong></div>
                    <div className="spots"><i />Cupo {adventure.spots}</div><span className="round-arrow" aria-hidden="true"><ArrowUpRight /></span>
                  </div>
                </div>
              </Link>
            </article>
          ))}
        </div>
        <div className="centered-link"><Link className="button button-dark" href="/aventuras">{content.adventuresButton}</Link></div>
      </section>

      <section className="how" id="como-funciona">
        <div className="how-image" style={{ backgroundImage: `url("${landing.howImage}")` }} aria-hidden="true" />
        <div className="how-copy">
          <p className="eyebrow">{content.howEyebrow}</p><h2>{content.howTitle}</h2>
          <ol>
            {content.howSteps.map((step,index)=><li key={step.title}><span>{String(index+1).padStart(2,"0")}</span><div><strong>{step.title}</strong><p>{step.body}</p></div></li>)}
          </ol>
        </div>
      </section>
      <section className="instagram-feed" id="instagram">
        <div className="instagram-heading"><div><p className="eyebrow">{content.instagramEyebrow}</p><h2>{content.instagramTitle}</h2></div><div><p>{content.instagramBody}</p><a href={content.instagramUrl} target="_blank" rel="noreferrer">{content.instagramCta} →</a></div></div>
        <div className="instagram-grid">
          {content.instagramEmbeds.map((url,index)=><iframe title={`Publicación ${index+1} de The Doggy Gang`} src={url} loading="lazy" allow="encrypted-media" key={url} />)}
        </div>
      </section>
      <section className="quote-band"><p>“{content.quote}”</p><span>{content.quoteAttribution}</span></section>
      <footer>
        <Link className="wordmark footer-mark" href="/">THE DOGGY <span>GANG</span></Link><p>{content.footerText}</p>
        <div><Link href="/tienda">Tienda</Link><a href={content.footerInstagramUrl} target="_blank" rel="noreferrer">Instagram</a>{content.footerWhatsappUrl && <a href={content.footerWhatsappUrl}>WhatsApp</a>}<a href={content.footerTermsUrl}>Términos</a><Link href="/privacidad">Privacidad</Link></div><small>© 2026 THE DOGGY GANG</small>
      </footer>
    </main>
  );
}

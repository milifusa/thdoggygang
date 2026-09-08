import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { getAdventures } from './lib/data';

export const revalidate = 60;

export default async function Home() {
  const adventures = await getAdventures();
  return (
    <main>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="The Doggy Gang, inicio">THE DOGGY <span>GANG</span></Link>
        <nav className="desktop-nav" aria-label="Navegación principal">
          <a href="#aventuras">Aventuras</a><a href="#manada">La manada</a><a href="#como-funciona">¿Cómo funciona?</a>
        </nav>
        <Link className="header-account" href="/ingresar">MI CUENTA <span aria-hidden="true">→</span></Link>
      </header>

      <section className="hero">
        <div className="hero-image" aria-hidden="true" /><div className="hero-shade" />
        <div className="hero-copy">
          <p className="eyebrow light">HIKES · PERRITOS · NATURALEZA</p>
          <h1>Aventuras que se disfrutan<br className="desktop-break" /> mejor en <em>manada.</em></h1>
          <p className="hero-intro">Caminamos juntos, descubrimos lugares increíbles y creamos historias con nuestros mejores amigos.</p>
          <a className="button button-primary" href="#aventuras">VER PRÓXIMAS AVENTURAS <ArrowDownRight aria-hidden="true" /></a>
        </div>
        <div className="hero-stamp" aria-hidden="true"><span>DESDE</span><strong>2019</strong><span>EN MANADA</span></div>
        <div className="scroll-cue" aria-hidden="true">SCROLL ↓</div>
      </section>

      <section className="intro" id="manada">
        <p className="eyebrow">SOMOS THE DOGGY GANG</p>
        <div className="intro-grid">
          <h2>No es sólo un hike.<br />Es su día <span>favorito.</span></h2>
          <div><p>Creamos experiencias al aire libre para personas que saben que la vida es mejor con cuatro patas al lado.</p><a className="text-link" href="#como-funciona">CONOCE A LA MANADA <span>→</span></a></div>
        </div>
      </section>

      <section className="adventures" id="aventuras">
        <div className="section-heading">
          <div><p className="eyebrow">ELIGE TU PRÓXIMA HISTORIA</p><h2>Próximas aventuras</h2></div>
          <p>Senderos nuevos, amigos nuevos y muchas colitas felices.</p>
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
        <div className="centered-link"><Link className="button button-dark" href="/aventuras">VER TODAS LAS AVENTURAS</Link></div>
      </section>

      <section className="how" id="como-funciona">
        <div className="how-image" aria-hidden="true" />
        <div className="how-copy">
          <p className="eyebrow">ASÍ DE FÁCIL</p><h2>Tu próxima aventura,<br />en tres pasos.</h2>
          <ol>
            <li><span>01</span><div><strong>Elige una aventura</strong><p>Encuentra el sendero ideal para ti y tu perrito.</p></div></li>
            <li><span>02</span><div><strong>Arma tu manada</strong><p>Selecciona quién viene, firma y reserva tu lugar.</p></div></li>
            <li><span>03</span><div><strong>Disfruta el camino</strong><p>Muestra tu QR, conoce a la manada y crea recuerdos.</p></div></li>
          </ol>
        </div>
      </section>
      <section className="instagram-feed" id="instagram">
        <div className="instagram-heading"><div><p className="eyebrow">DESDE LA MONTAÑA</p><h2>Así se vive<br />en la manada.</h2></div><div><p>Rutas reales, perros libres para explorar y recuerdos compartidos desde Puebla.</p><a href="https://www.instagram.com/the_doggy_gangmx/" target="_blank" rel="noreferrer">SEGUIR @THE_DOGGY_GANGMX →</a></div></div>
        <div className="instagram-grid">
          <iframe title="Próximas rutas de The Doggy Gang" src="https://www.instagram.com/p/DcfMAamMgFB/embed/captioned/" loading="lazy" allow="encrypted-media" />
          <iframe title="Sendero del Duende de The Doggy Gang" src="https://www.instagram.com/reel/DcyxwONxgfK/embed/captioned/" loading="lazy" allow="encrypted-media" />
          <iframe title="Entre montañas con The Doggy Gang" src="https://www.instagram.com/reel/Dci9RxaRr7X/embed/captioned/" loading="lazy" allow="encrypted-media" />
        </div>
      </section>
      <section className="quote-band"><p>“Los mejores caminos se recorren con huellas al lado.”</p><span>THE DOGGY GANG · PUEBLA, MX</span></section>
      <footer>
        <Link className="wordmark footer-mark" href="/">THE DOGGY <span>GANG</span></Link><p>Aventuras reales. Perritos felices. Una gran manada.</p>
        <div><a href="https://www.instagram.com/the_doggy_gangmx/" target="_blank" rel="noreferrer">Instagram</a><a href="#aventuras">WhatsApp</a><a href="#aventuras">Términos</a></div><small>© 2026 THE DOGGY GANG</small>
      </footer>
    </main>
  );
}

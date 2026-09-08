import Link from 'next/link';

export default function MyGangPage() {
  return (
    <main className="account-page">
      <aside className="account-sidebar">
        <Link className="wordmark" href="/">THE DOGGY <span>GANG</span></Link>
        <nav><Link className="active" href="/mi-manada"><span>⌂</span> Inicio</Link><a href="#aventuras"><span>↗</span> Mis aventuras</a><a href="#personas"><span>☺</span> Personas</a><a href="#perritos"><span>🐾</span> Perritos</a><Link href="/galeria/sendero-del-duende"><span>▦</span> Mis fotos</Link></nav>
        <div className="account-user"><div>ML</div><span><strong>Mishele Lojan</strong><small>mishele@email.com</small></span></div>
      </aside>
      <section className="account-content">
        <header className="account-mobile-header"><Link className="wordmark" href="/">THE DOGGY <span>GANG</span></Link><span>ML</span></header>
        <div className="welcome"><div><p className="eyebrow">MI MANADA</p><h1>¡Hola, Mishele!</h1><p>La próxima aventura ya se siente cerca.</p></div><Link className="button button-primary" href="/#aventuras">BUSCAR AVENTURA →</Link></div>
        <section className="next-adventure" id="aventuras">
          <div className="next-photo"><img src="https://images.unsplash.com/photo-1558788353-f76d92427f16?auto=format&fit=crop&w=1000&q=88" alt="Sendero del Duende" /><span>PRÓXIMA AVENTURA</span></div>
          <div className="next-details"><p>20 SEP · 07:00 AM</p><h2>Sendero del Duende</h2><span>Cholula, Puebla</span><div className="next-counts"><div><strong>3</strong><small>PERSONAS</small></div><div><strong>1</strong><small>PERRITO</small></div><div><strong>12</strong><small>DÍAS</small></div></div><Link className="button button-dark" href="/mi-manada/aventuras/sendero-del-duende">VER MI QR →</Link></div>
        </section>
        <div className="account-heading" id="personas"><div><p className="eyebrow">QUIÉNES CAMINAN CONTIGO</p><h2>Mi manada</h2></div><button>＋ AGREGAR PERSONA</button></div>
        <div className="people-grid"><article><div className="big-avatar">ML</div><h3>Mishele</h3><p>Titular · 6 aventuras</p><button>VER PERFIL →</button></article><article><div className="big-avatar">EF</div><h3>Eduardo</h3><p>Acompañante · 4 aventuras</p><button>VER PERFIL →</button></article><article><div className="big-avatar">MF</div><h3>Máximo</h3><p>Menor · 3 aventuras</p><button>VER PERFIL →</button></article></div>
        <div className="account-heading" id="perritos"><div><p className="eyebrow">EXPLORADORES DE CUATRO PATAS</p><h2>Mis perritos</h2></div><button>＋ AGREGAR PERRITO</button></div>
        <article className="dog-profile-card"><img src="https://images.unsplash.com/photo-1586671267731-da2cf3ceeb80?auto=format&fit=crop&w=700&q=85" alt="Mona" /><div><span>MIEMBRO DE LA MANADA</span><h2>Mona</h2><p>Westie · 5 años · Hembra</p><dl><div><dt>AVENTURAS</dt><dd>3</dd></div><div><dt>SOCIABLE</dt><dd>Sí</dd></div><div><dt>TAMAÑO</dt><dd>Chico</dd></div></dl><button>VER PERFIL COMPLETO →</button></div></article>
        <section className="history"><div className="account-heading"><div><p className="eyebrow">HUELLAS QUE YA DEJARON</p><h2>Mis aventuras</h2></div></div><div className="history-row"><span>18 MAY 2026</span><strong>Cañón de los Venados</strong><em>COMPLETADA</em><small>3 personas · Mona</small><Link href="/galeria/sendero-del-duende">VER FOTOS →</Link></div><div className="history-row"><span>02 FEB 2026</span><strong>Bosque de Piedra</strong><em>COMPLETADA</em><small>2 personas · Mona</small><Link href="/galeria/sendero-del-duende">VER FOTOS →</Link></div></section>
      </section>
      <nav className="mobile-tabbar"><Link className="active" href="/mi-manada">⌂<span>Inicio</span></Link><a href="#aventuras">↗<span>Aventuras</span></a><a href="#perritos">🐾<span>Perritos</span></a><Link href="/galeria/sendero-del-duende">▦<span>Fotos</span></Link></nav>
    </main>
  );
}

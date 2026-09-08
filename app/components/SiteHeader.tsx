import Link from 'next/link';

export function SiteHeader({ dark = false }: { dark?: boolean }) {
  return (
    <header className={`site-header ${dark ? 'header-dark' : ''}`}>
      <Link className="wordmark" href="/">THE DOGGY <span>GANG</span></Link>
      <nav className="desktop-nav" aria-label="Navegación principal">
        <Link href="/#aventuras">Aventuras</Link><Link href="/tienda">Tienda</Link><Link href="/#manada">La manada</Link><Link href="/#como-funciona">¿Cómo funciona?</Link>
      </nav>
      <Link className="mobile-store-link" href="/tienda">TIENDA</Link>
      <Link className="header-account" href="/ingresar">MI CUENTA <span aria-hidden="true">→</span></Link>
    </header>
  );
}

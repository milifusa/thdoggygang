import type { Metadata } from 'next';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/protest-riot/400.css';
import './globals.css';
import { SITE_ORIGIN } from './lib/site-url';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: 'Hikes con perros en Puebla | The Doggy Gang',
  description: 'Hikes y experiencias de senderismo con perros en Puebla y el centro de México. Explora nuevas rutas, reserva tu lugar y camina en manada.',
  applicationName: 'The Doggy Gang',
  authors: [{ name: 'The Doggy Gang' }],
  creator: 'The Doggy Gang',
  publisher: 'The Doggy Gang',
  keywords: [
    'hikes con perros',
    'senderismo con perros Puebla',
    'excursiones pet friendly',
    'rutas con perros México',
    'The Doggy Gang',
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    locale: 'es_MX',
    siteName: 'The Doggy Gang',
    title: 'Hikes con perros en Puebla | The Doggy Gang',
    description: 'Senderismo, naturaleza y experiencias pet friendly para caminar con tu mejor amigo.',
    url: '/',
    images: [{
      url: '/brand/profile-trail-sun.png',
      width: 1200,
      height: 1200,
      alt: 'The Doggy Gang, hikes con perros',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hikes con perros en Puebla | The Doggy Gang',
    description: 'Senderismo y experiencias pet friendly para caminar en manada.',
    images: ['/brand/profile-trail-sun.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const origin = SITE_ORIGIN;
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name: 'The Doggy Gang',
    url: origin,
    logo: `${origin}/brand/logo-circular-blue.png`,
    sameAs: ['https://www.instagram.com/the_doggy_gangmx/'],
    areaServed: { '@type': 'Country', name: 'México' },
  };
  return <html lang="es-MX"><body><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization).replace(/</g, '\\u003c') }} />{children}</body></html>;
}

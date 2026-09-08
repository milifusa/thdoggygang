import type { Metadata } from 'next';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/protest-riot/400.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN ?? 'https://www.thedoggygang.com'),
  title: 'The Doggy Gang | Aventuras en manada',
  description: 'Hikes, naturaleza y experiencias para compartir con tu mejor amigo.',
  manifest: '/manifest.webmanifest',
  openGraph: { title: 'The Doggy Gang | Aventuras en manada', description: 'Hikes, naturaleza y experiencias para compartir con tu mejor amigo.', images: ['/brand/profile-trail-sun.png'] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}

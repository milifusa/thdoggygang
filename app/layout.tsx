import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN ?? 'https://the-doggy-gang.pretty-oak-1445.chatgpt.site'),
  title: 'The Doggy Gang | Aventuras en manada',
  description: 'Hikes, naturaleza y experiencias para compartir con tu mejor amigo.',
  openGraph: { title: 'The Doggy Gang | Aventuras en manada', description: 'Hikes, naturaleza y experiencias para compartir con tu mejor amigo.' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}

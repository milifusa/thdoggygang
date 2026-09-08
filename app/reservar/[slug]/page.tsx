import type { Metadata } from 'next';
import { getAdventure } from '../../lib/data';
import { BookingWizard } from './wizard';

export const metadata: Metadata = { title: 'Arma tu aventura | The Doggy Gang', description: 'Selecciona tu manada, firma y reserva tu lugar.' };

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <BookingWizard adventure={getAdventure(slug)} />;
}

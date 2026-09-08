import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getAdventure } from '../../lib/data';
import { loadBookingContext } from '../../lib/domain/booking-context';
import { BookingWizard } from './wizard';

export const metadata: Metadata = { title: 'Arma tu aventura | The Doggy Gang', description: 'Selecciona tu manada, firma y reserva tu lugar.' };

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const adventure = await getAdventure(slug);
  if (!adventure) notFound();
  const context = await loadBookingContext();
  if (context.mode === 'live' && !context.authenticated) redirect(`/ingresar?next=/reservar/${encodeURIComponent(slug)}`);
  return <BookingWizard adventure={adventure} context={context} />;
}

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getAdventure } from '../../lib/data';
import { loadBookingContext } from '../../lib/domain/booking-context';
import { BookingWizard } from './wizard';
import { getProducts } from '../../lib/products';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { getBankTransferConfig, getStripeSecretKey } from '../../lib/payment-config';

export const metadata: Metadata = { title: 'Arma tu aventura | The Doggy Gang', description: 'Selecciona tu manada, firma y reserva tu lugar.' };

export type BookingResume = { bookingId:string; step:number; personIds:string[]; dogIds:string[]; transportPersonIds:string[]; productSelections:Array<{productId:string;variant:string;quantity:number}>; waiverSigned:boolean };

export default async function BookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ booking?:string; step?:string }> }) {
  const { slug } = await params;
  const requested = await searchParams;
  const adventure = await getAdventure(slug);
  if (!adventure) notFound();
  const [context, products] = await Promise.all([loadBookingContext(), getProducts()]);
  if (context.mode === 'live' && !context.authenticated) redirect(`/ingresar?next=/reservar/${encodeURIComponent(slug)}`);
  let resume: BookingResume | undefined;
  if (context.mode === 'live' && requested.booking) {
    const supabase = await createSupabaseServerClient();
    const { data: booking } = await supabase.from('bookings').select('id,current_step,hike:hikes(slug),booking_participants(id,person_profile_id),booking_dogs(dog_id),transport_reservations(booking_participant_id),booking_product_selections(product_id,variant,quantity),signed_waivers(id)').eq('id',requested.booking).in('status',['DRAFT','PENDING_PAYMENT']).maybeSingle();
    const hike = Array.isArray(booking?.hike) ? booking?.hike[0] : booking?.hike;
    if (booking && hike?.slug === slug) {
      const stepNames=['personas','perritos','transporte','productos','responsiva','pago','confirmacion'];
      const participantMap=new Map(booking.booking_participants.map((participant)=>[participant.id,participant.person_profile_id]));
      resume={ bookingId:booking.id, step:Math.max(0,stepNames.indexOf(requested.step || booking.current_step)), personIds:booking.booking_participants.map((participant)=>participant.person_profile_id).filter(Boolean) as string[], dogIds:booking.booking_dogs.map((dog)=>dog.dog_id).filter(Boolean) as string[], transportPersonIds:booking.transport_reservations.map((reservation)=>participantMap.get(reservation.booking_participant_id)).filter(Boolean) as string[], productSelections:booking.booking_product_selections.map((item)=>({productId:item.product_id,variant:item.variant,quantity:item.quantity})), waiverSigned:booking.signed_waivers.length>0 };
    }
  }
  const [bankTransfer, stripeSecret] = await Promise.all([getBankTransferConfig(), getStripeSecretKey()]);
  return <BookingWizard adventure={adventure} context={context} products={products.filter((product) => product.pickupEnabled)} cardPaymentsEnabled={Boolean(stripeSecret)} bankTransfer={bankTransfer} resume={resume} />;
}

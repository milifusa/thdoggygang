import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getAdventure } from '../../lib/data';
import { loadBookingContext } from '../../lib/domain/booking-context';
import { BookingWizard } from './wizard';
import { getProducts } from '../../lib/products';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { getBankTransferConfig, getStripeSecretKey } from '../../lib/payment-config';
import { getMemberCreditBalance } from '../../lib/server/member-credit';
import { relationArray } from '../../lib/supabase/relations';

export const metadata: Metadata = { title: 'Arma tu aventura | The Doggy Gang', description: 'Selecciona tu manada, firma y reserva tu lugar.' };

export type BookingResume = { bookingId:string; step:number; personIds:string[]; dogIds:string[]; transportPersonIds:string[]; campingOptionId:string|null; campingPersonIds:string[]; productSelections:Array<{productId:string;variant:string;quantity:number}>; waiverSigned:boolean; creditAppliedCents:number };

export default async function BookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ booking?:string; step?:string; pago?:string }> }) {
  const { slug } = await params;
  const requested = await searchParams;
  const adventure = await getAdventure(slug);
  if (!adventure) notFound();
  const [context, products] = await Promise.all([loadBookingContext(), getProducts()]);
  if (context.mode === 'live' && !context.authenticated) redirect(`/ingresar?next=/reservar/${encodeURIComponent(slug)}`);
  let resume: BookingResume | undefined;
  if (context.mode === 'live' && context.profileId && !requested.booking) {
    const supabase = await createSupabaseServerClient();
    const { data: activeBooking } = await supabase
      .from('bookings')
      .select('id,current_step')
      .eq('profile_id', context.profileId)
      .eq('hike_id', adventure.id)
      .in('status', ['DRAFT', 'PENDING_PAYMENT'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeBooking) {
      const params = new URLSearchParams({
        booking: activeBooking.id,
        step: activeBooking.current_step || 'personas',
      });
      if (requested.pago) params.set('pago', requested.pago);
      redirect(`/reservar/${encodeURIComponent(slug)}?${params.toString()}`);
    }
  }
  if (context.mode === 'live' && requested.booking) {
    const supabase = await createSupabaseServerClient();
    const { data: booking } = await supabase.from('bookings').select('id,current_step,credit_applied_cents,hike:hikes(slug),booking_participants(id,person_profile_id),booking_dogs(dog_id),transport_reservations(booking_participant_id),booking_camping_selections(camping_option_id,person_profile_ids),booking_product_selections(product_id,variant,quantity),signed_waivers(id,booking_participant_id)').eq('id',requested.booking).eq('profile_id',context.profileId).in('status',['DRAFT','PENDING_PAYMENT']).maybeSingle();
    const hike = Array.isArray(booking?.hike) ? booking?.hike[0] : booking?.hike;
    if (booking && hike?.slug === slug) {
      const bookingParticipants=relationArray(booking.booking_participants);
      const bookingDogs=relationArray(booking.booking_dogs);
      const transportReservations=relationArray(booking.transport_reservations);
      const campingSelections=relationArray(booking.booking_camping_selections);
      const productSelections=relationArray(booking.booking_product_selections);
      const signedWaivers=relationArray(booking.signed_waivers);
      const signedParticipantIds=new Set(signedWaivers.map((waiver)=>waiver.booking_participant_id));
      const stepNames=adventure.campingOptions.length
        ? ['personas','perritos','camping','transporte','productos','revision','responsiva','pago','confirmacion']
        : ['personas','perritos','transporte','productos','revision','responsiva','pago','confirmacion'];
      const participantMap=new Map(bookingParticipants.map((participant)=>[participant.id,participant.person_profile_id]));
      resume={ bookingId:booking.id, step:Math.max(0,stepNames.indexOf(requested.step || booking.current_step)), personIds:bookingParticipants.map((participant)=>participant.person_profile_id).filter(Boolean) as string[], dogIds:bookingDogs.map((dog)=>dog.dog_id).filter(Boolean) as string[], transportPersonIds:transportReservations.map((reservation)=>participantMap.get(reservation.booking_participant_id)).filter(Boolean) as string[], campingOptionId:campingSelections[0]?.camping_option_id??null, campingPersonIds:campingSelections[0]?.person_profile_ids??[], productSelections:productSelections.map((item)=>({productId:item.product_id,variant:item.variant,quantity:item.quantity})), waiverSigned:bookingParticipants.length>0&&bookingParticipants.every((participant)=>signedParticipantIds.has(participant.id)), creditAppliedCents:booking.credit_applied_cents };
    }
  }
  const [bankTransfer, stripeSecret, creditBalanceCents] = await Promise.all([getBankTransferConfig(), getStripeSecretKey(), context.profileId ? getMemberCreditBalance(context.profileId) : Promise.resolve(0)]);
  return <BookingWizard adventure={adventure} context={context} products={products.filter((product) => product.pickupEnabled)} cardPaymentsEnabled={Boolean(stripeSecret)} bankTransfer={bankTransfer} creditBalanceCents={creditBalanceCents + (resume?.creditAppliedCents ?? 0)} paymentInterrupted={requested.pago==='cancelado'} resume={resume} />;
}

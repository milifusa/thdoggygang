import "server-only";

import { createSupabaseServiceClient } from "../supabase/service";

export type ExpireStripeCheckoutResult = {
  paymentId: string | null;
  orderId: string | null;
  bookingId: string | null;
  paymentExpired: boolean;
  orderExpired: boolean;
  bookingReleased: boolean;
  reason?: "not_found" | "already_resolved" | "newer_attempt_exists" | "paid";
};

/**
 * Closes one abandoned Stripe Checkout without destroying the reservation.
 * The booking goes back to DRAFT so its place is released and the customer can
 * safely retry. A newer checkout attempt or a confirmed payment always wins.
 */
export async function expireStripeCheckout({
  sessionId,
  orderId,
  rawStatus = "checkout.session.expired",
}: {
  sessionId: string;
  orderId?: string | null;
  rawStatus?: string;
}): Promise<ExpireStripeCheckoutResult> {
  const service = createSupabaseServiceClient();
  let paymentQuery = service
    .from("payments")
    .select("id,order_id,status")
    .eq("provider", "stripe")
    .eq("provider_payment_id", sessionId);
  if (orderId) paymentQuery = paymentQuery.eq("order_id", orderId);
  const { data: payment, error: paymentError } =
    await paymentQuery.maybeSingle();
  if (paymentError) throw new Error("No pudimos consultar el intento de pago.");
  if (!payment)
    return {
      paymentId: null,
      orderId: orderId ?? null,
      bookingId: null,
      paymentExpired: false,
      orderExpired: false,
      bookingReleased: false,
      reason: "not_found",
    };
  if (payment.status !== "PENDING")
    return {
      paymentId: payment.id,
      orderId: payment.order_id,
      bookingId: null,
      paymentExpired: false,
      orderExpired: false,
      bookingReleased: false,
      reason: payment.status === "PAID" ? "paid" : "already_resolved",
    };

  const now = new Date().toISOString();
  const { data: expiredPayment, error: expireError } = await service
    .from("payments")
    .update({ status: "FAILED", raw_status: rawStatus, updated_at: now })
    .eq("id", payment.id)
    .eq("status", "PENDING")
    .select("id")
    .maybeSingle();
  if (expireError) throw new Error("No pudimos cerrar el intento de pago.");
  if (!expiredPayment)
    return {
      paymentId: payment.id,
      orderId: payment.order_id,
      bookingId: null,
      paymentExpired: false,
      orderExpired: false,
      bookingReleased: false,
      reason: "already_resolved",
    };

  const { data: order, error: orderError } = await service
    .from("orders")
    .select("id,booking_id,status")
    .eq("id", payment.order_id)
    .maybeSingle();
  if (orderError) throw new Error("No pudimos consultar la orden.");
  if (!order)
    return {
      paymentId: payment.id,
      orderId: payment.order_id,
      bookingId: null,
      paymentExpired: true,
      orderExpired: false,
      bookingReleased: false,
      reason: "not_found",
    };

  const [{ count: paidCount, error: paidError }, { count: pendingCount, error: pendingError }] =
    await Promise.all([
      service
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("order_id", order.id)
        .eq("status", "PAID"),
      service
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("order_id", order.id)
        .eq("status", "PENDING")
        .neq("id", payment.id),
    ]);
  if (paidError || pendingError)
    throw new Error("No pudimos verificar otros intentos de pago.");
  if ((paidCount ?? 0) > 0)
    return {
      paymentId: payment.id,
      orderId: order.id,
      bookingId: order.booking_id,
      paymentExpired: true,
      orderExpired: false,
      bookingReleased: false,
      reason: "paid",
    };
  if ((pendingCount ?? 0) > 0)
    return {
      paymentId: payment.id,
      orderId: order.id,
      bookingId: order.booking_id,
      paymentExpired: true,
      orderExpired: false,
      bookingReleased: false,
      reason: "newer_attempt_exists",
    };

  const { data: expiredOrder, error: expireOrderError } = await service
    .from("orders")
    .update({ status: "FAILED", updated_at: now })
    .eq("id", order.id)
    .eq("status", "PENDING")
    .select("id")
    .maybeSingle();
  if (expireOrderError) throw new Error("No pudimos cerrar la orden.");

  let bookingReleased = false;
  if (order.booking_id) {
    const { data: releasedBooking, error: bookingError } = await service
      .from("bookings")
      .update({
        status: "DRAFT",
        current_step: "pago",
        expires_at: null,
        confirmed_at: null,
        last_activity_at: now,
        updated_at: now,
      })
      .eq("id", order.booking_id)
      .eq("status", "PENDING_PAYMENT")
      .select("id")
      .maybeSingle();
    if (bookingError)
      throw new Error("No pudimos liberar el lugar de la reservación.");
    bookingReleased = Boolean(releasedBooking);
  }

  return {
    paymentId: payment.id,
    orderId: order.id,
    bookingId: order.booking_id,
    paymentExpired: true,
    orderExpired: Boolean(expiredOrder),
    bookingReleased,
  };
}

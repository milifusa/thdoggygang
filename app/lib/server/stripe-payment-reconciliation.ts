import "server-only";

import { ensureBookingQrToken } from "../domain/checkin-token";
import { getStripeSecretKey } from "../payment-config";
import { createSupabaseServiceClient } from "../supabase/service";

export type ExpireStripeCheckoutResult = {
  paymentId: string | null;
  orderId: string | null;
  bookingId: string | null;
  paymentExpired: boolean;
  orderExpired: boolean;
  bookingReleased: boolean;
  reason?:
    | "not_found"
    | "already_resolved"
    | "newer_attempt_exists"
    | "paid"
    | "grace_period";
};

async function closePendingPaymentsForOrders(
  orderIds: string[],
  rawStatus: "booking.cancelled" | "SUPERSEDED_BY_PAID_BOOKING",
) {
  if (!orderIds.length) return { paymentsClosed: 0, ordersClosed: 0 };
  const service = createSupabaseServiceClient();
  const { data: pendingPayments, error: paymentReadError } = await service
    .from("payments")
    .select("id,provider,provider_payment_id")
    .in("order_id", orderIds)
    .in("status", ["PENDING", "UNDER_REVIEW"]);
  if (paymentReadError)
    throw new Error("No pudimos consultar los intentos pendientes.");

  const stripeKey = pendingPayments?.some(
    (payment) => payment.provider === "stripe" && payment.provider_payment_id,
  )
    ? await getStripeSecretKey()
    : null;
  if (stripeKey) {
    await Promise.allSettled(
      (pendingPayments ?? [])
        .filter(
          (payment) =>
            payment.provider === "stripe" && payment.provider_payment_id,
        )
        .map((payment) =>
          fetch(
            `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(payment.provider_payment_id!)}/expire`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${stripeKey}` },
              cache: "no-store",
              signal: AbortSignal.timeout(12_000),
            },
          ),
        ),
    );
  }

  const paymentIds = (pendingPayments ?? []).map((payment) => payment.id);
  const now = new Date().toISOString();
  if (paymentIds.length) {
    const { error: paymentUpdateError } = await service
      .from("payments")
      .update({ status: "FAILED", raw_status: rawStatus, updated_at: now })
      .in("id", paymentIds)
      .in("status", ["PENDING", "UNDER_REVIEW"]);
    if (paymentUpdateError)
      throw new Error("No pudimos cerrar los intentos pendientes.");
  }
  const { data: closedOrders, error: orderUpdateError } = await service
    .from("orders")
    .update({ status: "FAILED", updated_at: now })
    .in("id", orderIds)
    .eq("status", "PENDING")
    .select("id");
  if (orderUpdateError) throw new Error("No pudimos cerrar las órdenes.");
  return {
    paymentsClosed: paymentIds.length,
    ordersClosed: closedOrders?.length ?? 0,
  };
}

export async function closePendingPaymentsForBooking(
  bookingId: string,
  rawStatus: "booking.cancelled" | "SUPERSEDED_BY_PAID_BOOKING" =
    "booking.cancelled",
) {
  const service = createSupabaseServiceClient();
  const { data: orders, error } = await service
    .from("orders")
    .select("id")
    .eq("booking_id", bookingId);
  if (error) throw new Error("No pudimos consultar las órdenes.");
  return closePendingPaymentsForOrders(
    (orders ?? []).map((order) => order.id),
    rawStatus,
  );
}

async function closeSupersededPayments(
  bookingId: string,
  paidOrderId: string,
) {
  const service = createSupabaseServiceClient();
  const { data: booking, error: bookingError } = await service
    .from("bookings")
    .select("profile_id,hike_id")
    .eq("id", bookingId)
    .single();
  if (bookingError || !booking)
    throw new Error("No pudimos identificar la reservación pagada.");
  const { data: previousBookings, error: previousBookingError } = await service
    .from("bookings")
    .select("id")
    .eq("profile_id", booking.profile_id)
    .eq("hike_id", booking.hike_id)
    .neq("id", bookingId);
  if (previousBookingError)
    throw new Error("No pudimos consultar reservaciones anteriores.");
  const previousBookingIds = (previousBookings ?? []).map((item) => item.id);
  const { data: previousOrders, error: previousOrderError } = previousBookingIds.length
    ? await service
        .from("orders")
        .select("id")
        .in("booking_id", previousBookingIds)
    : { data: [], error: null };
  if (previousOrderError)
    throw new Error("No pudimos consultar intentos anteriores.");

  await closePendingPaymentsForOrders(
    [paidOrderId, ...(previousOrders ?? []).map((order) => order.id)],
    "SUPERSEDED_BY_PAID_BOOKING",
  );
  if (previousBookingIds.length)
    await service
      .from("bookings")
      .update({ status: "CANCELLED", cancelled_at: new Date().toISOString() })
      .in("id", previousBookingIds)
      .in("status", ["DRAFT", "PENDING_PAYMENT"]);
}

export async function confirmStripeCheckout({
  sessionId,
  orderId,
  bookingId,
  rawStatus = "checkout.session.completed",
}: {
  sessionId: string;
  orderId: string;
  bookingId?: string | null;
  rawStatus?: string;
}) {
  const service = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { data: payment, error: paymentError } = await service
    .from("payments")
    .update({ status: "PAID", paid_at: now, raw_status: rawStatus })
    .eq("provider", "stripe")
    .eq("provider_payment_id", sessionId)
    .eq("order_id", orderId)
    .select("id")
    .maybeSingle();
  if (paymentError || !payment)
    throw new Error("No pudimos conciliar el pago.");

  const { error: orderError } = await service
    .from("orders")
    .update({ status: "PAID" })
    .eq("id", orderId);
  if (orderError) throw new Error("No pudimos confirmar la orden.");

  const { error: inventoryError } = await service.rpc(
    "commit_product_inventory",
    { p_order_id: orderId },
  );
  if (inventoryError) throw new Error("No pudimos confirmar el inventario.");

  if (bookingId) {
    await closeSupersededPayments(bookingId, orderId);
    const { error: bookingError } = await service
      .from("bookings")
      .update({ status: "CONFIRMED", confirmed_at: now, expires_at: null })
      .eq("id", bookingId);
    if (bookingError) throw new Error("No pudimos confirmar la reservación.");
    await ensureBookingQrToken(bookingId);
  }
  return { paymentId: payment.id, orderId, bookingId: bookingId ?? null };
}

/**
 * Closes one abandoned Stripe Checkout without destroying the reservation.
 * The booking goes back to DRAFT so its place is released and the customer can
 * safely retry. A newer checkout attempt or a confirmed payment always wins.
 */
export async function expireStripeCheckout({
  sessionId,
  orderId,
  rawStatus = "checkout.session.expired",
  minimumAgeHours = 0,
}: {
  sessionId: string;
  orderId?: string | null;
  rawStatus?: string;
  minimumAgeHours?: number;
}): Promise<ExpireStripeCheckoutResult> {
  const service = createSupabaseServiceClient();
  let paymentQuery = service
    .from("payments")
    .select("id,order_id,status,created_at")
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
  if (
    minimumAgeHours > 0 &&
    Date.now() - new Date(payment.created_at).getTime() <
      minimumAgeHours * 60 * 60 * 1000
  )
    return {
      paymentId: payment.id,
      orderId: payment.order_id,
      bookingId: null,
      paymentExpired: false,
      orderExpired: false,
      bookingReleased: false,
      reason: "grace_period",
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

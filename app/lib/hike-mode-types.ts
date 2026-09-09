export type HikeParticipant = {
  id: string;
  snapshot: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    is_minor?: boolean;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
  };
};

export type HikeDog = {
  id: string;
  snapshot: {
    name?: string;
    breed?: string;
    sociability?: string;
    reactivity?: string;
    medical_conditions?: string;
    medications?: string;
    notes?: string;
  };
};

export type HikeDelivery = {
  id: string;
  orderItemId: string;
  bookingId: string;
  description: string;
  quantity: number;
  status: string;
  deliveryLocation: string | null;
  deliveredAt: string | null;
};

export type HikeBooking = {
  id: string;
  booking_number: string;
  status: string;
  hike_id: string;
  total_cents: number;
  profile: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  } | null;
  booking_participants: HikeParticipant[];
  booking_dogs: HikeDog[];
  transport_reservations: Array<{ id: string; booking_participant_id: string }>;
  signed_waivers: Array<{
    id: string;
    booking_participant_id: string;
    signed_at: string;
  }>;
  check_ins: Array<{
    id: string;
    booking_participant_id: string;
    checked_in_at: string;
  }>;
  qrToken?: string;
};

export type HikeModeData = {
  hike: {
    id: string;
    name: string;
    starts_at: string;
    location_name: string;
    meeting_point: string | null;
    capacity: number;
    max_dogs: number | null;
  };
  availableHikes: Array<{ id: string; name: string; startsAt: string }>;
  bookings: HikeBooking[];
  deliveries: HikeDelivery[];
  transportDeparture: {
    completedAt: string | null;
    passengerCount: number;
    note: string | null;
  };
  publicKey: string;
  authorization?: string;
  preparedAt?: string;
  expiresAt?: string;
};

export type OfflineOperation = {
  operationId: string;
  hikeId: string;
  bookingId?: string;
  participantId?: string;
  orderItemId?: string;
  type: "CHECK_IN" | "PRODUCT_DELIVERY" | "TRANSPORT_COMPLETE" | "NOTE";
  deviceId: string;
  clientTimestamp: string;
  payload?: Record<string, unknown>;
  state: "PENDING" | "SYNCING" | "SYNCED" | "CONFLICT";
  error?: string;
};

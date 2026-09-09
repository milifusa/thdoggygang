"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BusFront,
  Check,
  CircleAlert,
  CircleCheck,
  CloudDownload,
  Dog,
  House,
  PackageCheck,
  Phone,
  QrCode,
  RefreshCw,
  Search,
  Signal,
  SignalZero,
  Trash2,
  UserRoundCheck,
  X,
} from "lucide-react";
import type {
  HikeBooking,
  HikeModeData,
  OfflineOperation,
} from "../../lib/hike-mode-types";
import {
  clearHikeData,
  enqueueOperation,
  getDeviceId,
  getHikePackage,
  listOperations,
  removeOperation,
  saveHikePackage,
  updateOperation,
} from "../../lib/offline/hike-db";
import { verifySignedPayload } from "../../lib/security/signed-token";

type Filter =
  | "ALL"
  | "PENDING"
  | "CHECKED"
  | "ALERTS"
  | "TRANSPORT"
  | "DELIVERIES";

function personName(person?: HikeBooking["booking_participants"][number]) {
  return (
    `${person?.snapshot.first_name ?? ""} ${person?.snapshot.last_name ?? ""}`.trim() ||
    "Persona sin nombre"
  );
}
function bookingName(booking: HikeBooking) {
  return personName(booking.booking_participants[0]);
}
function hasDogAlert(booking: HikeBooking) {
  return booking.booking_dogs.some((dog) =>
    Boolean(
      dog.snapshot.reactivity ||
        dog.snapshot.medical_conditions ||
        dog.snapshot.medications ||
        dog.snapshot.notes,
    ),
  );
}
function formatTime(value?: string | null) {
  if (!value) return "Sin sincronizar";
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function applyPendingOperations(
  source: HikeModeData,
  operations: OfflineOperation[],
) {
  const active = operations.filter((operation) => operation.state !== "SYNCED");
  return {
    ...source,
    bookings: source.bookings.map((booking) => ({
      ...booking,
      check_ins: [
        ...booking.check_ins,
        ...active
          .filter(
            (operation) =>
              operation.type === "CHECK_IN" &&
              operation.bookingId === booking.id &&
              operation.participantId &&
              !booking.check_ins.some(
                (checkin) =>
                  checkin.booking_participant_id === operation.participantId,
              ),
          )
          .map((operation) => ({
            id: operation.operationId,
            booking_participant_id: operation.participantId!,
            checked_in_at: operation.clientTimestamp,
          })),
      ],
    })),
    deliveries: source.deliveries.map((delivery) =>
      active.some(
        (operation) =>
          operation.type === "PRODUCT_DELIVERY" &&
          operation.orderItemId === delivery.orderItemId,
      )
        ? {
            ...delivery,
            status: "DELIVERED",
            deliveredAt:
              active.find(
                (operation) =>
                  operation.type === "PRODUCT_DELIVERY" &&
                  operation.orderItemId === delivery.orderItemId,
              )?.clientTimestamp ?? delivery.deliveredAt,
          }
        : delivery,
    ),
    transportDeparture: active.some(
      (operation) => operation.type === "TRANSPORT_COMPLETE",
    )
      ? {
          completedAt:
            active.find((operation) => operation.type === "TRANSPORT_COMPLETE")
              ?.clientTimestamp ?? null,
          passengerCount: source.bookings.reduce(
            (sum, booking) => sum + booking.transport_reservations.length,
            0,
          ),
          note:
            String(
              active.find(
                (operation) => operation.type === "TRANSPORT_COMPLETE",
              )?.payload?.note ?? "",
            ) || null,
        }
      : (source.transportDeparture ?? {
          completedAt: null,
          passengerCount: 0,
          note: null,
        }),
  };
}

export function HikeMode({
  demo,
  data: initialData,
}: {
  demo: boolean;
  data: HikeModeData | null;
}) {
  const [data, setData] = useState(initialData);
  const [online, setOnline] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selected, setSelected] = useState<HikeBooking | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pending, setPending] = useState<OfflineOperation[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const scanLoop = useRef<number | null>(null);

  const hydrateQueue = useCallback(
    async (hikeId: string) => setPending(await listOperations(hikeId)),
    [],
  );
  const loadPackage = useCallback(
    async (hikeId: string, currentDeviceId: string, quiet = false) => {
      if (!navigator.onLine || demo) return null;
      if (!quiet) setPreparing(true);
      try {
        const response = await fetch(
          `/api/hike-mode/package?hike=${encodeURIComponent(hikeId)}&device=${encodeURIComponent(currentDeviceId)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as HikeModeData & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error ?? "No pudimos preparar el hike.");
        const authorization = await verifySignedPayload(
          payload.authorization ?? "",
          payload.publicKey,
        );
        if (
          !authorization ||
          authorization.purpose !== "hike-offline" ||
          authorization.hikeId !== hikeId ||
          authorization.deviceId !== currentDeviceId
        )
          throw new Error(
            "El paquete offline no tiene una autorización válida para este dispositivo.",
          );
        await saveHikePackage(payload);
        const operations = await listOperations(hikeId);
        setData(applyPendingOperations(payload, operations));
        setPending(operations);
        setLastSync(new Date().toISOString());
        setMessage("Paquete operativo listo para trabajar sin señal.");
        return payload;
      } catch (error) {
        if (!quiet)
          setMessage(
            error instanceof Error
              ? error.message
              : "No pudimos descargar el paquete operativo.",
          );
        return null;
      } finally {
        if (!quiet) setPreparing(false);
      }
    },
    [demo],
  );

  const syncQueue = useCallback(async () => {
    if (!data?.authorization || !navigator.onLine || syncing) return;
    const queued = (await listOperations(data.hike.id)).filter(
      (operation) => operation.state !== "SYNCED",
    );
    if (!queued.length) {
      setLastSync(new Date().toISOString());
      return;
    }
    setSyncing(true);
    for (const operation of queued)
      await updateOperation({
        ...operation,
        state: "SYNCING",
        error: undefined,
      });
    try {
      const response = await fetch("/api/hike-mode/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          authorization: data.authorization,
          operations: queued,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        syncedAt?: string;
        results?: Array<{ operationId: string; ok: boolean; error?: string }>;
      };
      if (!response.ok)
        throw new Error(payload.error ?? "No pudimos sincronizar.");
      for (const result of payload.results ?? []) {
        const operation = queued.find(
          (item) => item.operationId === result.operationId,
        );
        if (!operation) continue;
        if (result.ok) await removeOperation(operation.operationId);
        else
          await updateOperation({
            ...operation,
            state: "CONFLICT",
            error: result.error ?? "Requiere revisión",
          });
      }
      setLastSync(payload.syncedAt ?? new Date().toISOString());
      const remaining = await listOperations(data.hike.id);
      setPending(remaining);
      setMessage(
        remaining.some((operation) => operation.state === "CONFLICT")
          ? "Algunos cambios requieren revisión. Abre los pendientes antes de terminar el hike."
          : "Cambios sincronizados correctamente.",
      );
    } catch (error) {
      for (const operation of queued)
        await updateOperation({
          ...operation,
          state: "PENDING",
          error:
            error instanceof Error
              ? error.message
              : "Pendiente de sincronización",
        });
      await hydrateQueue(data.hike.id);
    } finally {
      setSyncing(false);
    }
  }, [data, hydrateQueue, syncing]);

  useEffect(() => {
    let active = true;
    const start = async () => {
      setOnline(navigator.onLine);
      const id = await getDeviceId();
      if (!active) return;
      setDeviceId(id);
      if ("serviceWorker" in navigator)
        await navigator.serviceWorker
          .register("/hike-mode-sw.js")
          .catch(() => null);
      if (!initialData?.hike.id) return;
      const cached = await getHikePackage(initialData.hike.id);
      const operations = await listOperations(initialData.hike.id);
      if (cached && active) setData(applyPendingOperations(cached, operations));
      setPending(operations);
      if (!cached && !navigator.onLine)
        setMessage(
          "Este hike no fue preparado para trabajar sin señal. Conéctate y pulsa PREPARAR OFFLINE antes de operar.",
        );
      if (navigator.onLine) await loadPackage(initialData.hike.id, id, true);
    };
    void start();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [hydrateQueue, initialData?.hike.id, loadPackage]);
  useEffect(() => {
    const syncWhenOnline = () => {
      void syncQueue();
    };
    window.addEventListener("online", syncWhenOnline);
    return () => window.removeEventListener("online", syncWhenOnline);
  }, [syncQueue]);
  useEffect(() => {
    if (!data?.hike.id || demo) return;
    const timer = window.setInterval(() => {
      if (navigator.onLine && !syncing)
        void loadPackage(data.hike.id, deviceId, true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [data?.hike.id, demo, deviceId, loadPackage, syncing]);
  useEffect(
    () => () => {
      const stream = video.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
      if (scanLoop.current) cancelAnimationFrame(scanLoop.current);
    },
    [],
  );

  const checkedIds = useMemo(
    () =>
      new Set(
        data?.bookings.flatMap((booking) =>
          booking.check_ins.map((checkIn) => checkIn.booking_participant_id),
        ) ?? [],
      ),
    [data],
  );
  const expected =
    data?.bookings.reduce(
      (sum, booking) => sum + booking.booking_participants.length,
      0,
    ) ?? 0;
  const checked = checkedIds.size;
  const alerts = data?.bookings.filter(hasDogAlert) ?? [];
  const transport =
    data?.bookings.reduce(
      (sum, booking) => sum + booking.transport_reservations.length,
      0,
    ) ?? 0;
  const deliveries = useMemo(
    () =>
      data?.deliveries.filter((delivery) => delivery.status !== "DELIVERED") ??
      [],
    [data?.deliveries],
  );
  const visibleBookings = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es-MX");
    return (data?.bookings ?? []).filter((booking) => {
      const content = [
        booking.booking_number,
        bookingName(booking),
        booking.profile?.email,
        booking.profile?.phone,
        ...booking.booking_dogs.map((dog) => dog.snapshot.name),
      ]
        .join(" ")
        .toLocaleLowerCase("es-MX");
      if (normalized && !content.includes(normalized)) return false;
      const isChecked = booking.booking_participants.every((person) =>
        checkedIds.has(person.id),
      );
      if (filter === "PENDING") return !isChecked;
      if (filter === "CHECKED") return isChecked;
      if (filter === "ALERTS") return hasDogAlert(booking);
      if (filter === "TRANSPORT")
        return booking.transport_reservations.length > 0;
      if (filter === "DELIVERIES")
        return deliveries.some((delivery) => delivery.bookingId === booking.id);
      return true;
    });
  }, [checkedIds, data?.bookings, deliveries, filter, query]);

  const queueCheckins = async (
    booking: HikeBooking,
    participantIds: string[],
  ) => {
    const operations: OfflineOperation[] = participantIds
      .filter((id) => !checkedIds.has(id))
      .map((participantId) => ({
        operationId: crypto.randomUUID(),
        hikeId: booking.hike_id,
        bookingId: booking.id,
        participantId,
        type: "CHECK_IN",
        deviceId,
        clientTimestamp: new Date().toISOString(),
        payload: {},
        state: "PENDING",
      }));
    if (!operations.length) {
      setMessage("Esta reservación ya tiene todos sus check-ins.");
      return;
    }
    for (const operation of operations) await enqueueOperation(operation);
    setData((current) =>
      current
        ? {
            ...current,
            bookings: current.bookings.map((item) =>
              item.id === booking.id
                ? {
                    ...item,
                    check_ins: [
                      ...item.check_ins,
                      ...operations.map((operation) => ({
                        id: operation.operationId,
                        booking_participant_id: operation.participantId!,
                        checked_in_at: operation.clientTimestamp,
                      })),
                    ],
                  }
                : item,
            ),
          }
        : current,
    );
    await hydrateQueue(booking.hike_id);
    setSelected(null);
    setMessage(
      `${operations.length} check-in${operations.length === 1 ? "" : "s"} guardado${operations.length === 1 ? "" : "s"}.${online ? " Sincronizando…" : " Se sincronizará al recuperar la conexión."}`,
    );
    if (online) await syncQueue();
  };
  const markDelivered = async (
    delivery: HikeModeData["deliveries"][number],
  ) => {
    if (!data) return;
    const deliveryLocation = window
      .prompt(
        "Lugar donde se entregó",
        data.hike.meeting_point ?? data.hike.location_name,
      )
      ?.trim();
    if (
      !deliveryLocation ||
      !window.confirm(
        `¿Confirmar la entrega de ${delivery.quantity} × ${delivery.description}?`,
      )
    )
      return;
    const note = window.prompt("Nota de entrega (opcional)", "")?.trim();
    const operation: OfflineOperation = {
      operationId: crypto.randomUUID(),
      hikeId: data.hike.id,
      bookingId: delivery.bookingId || undefined,
      orderItemId: delivery.orderItemId,
      type: "PRODUCT_DELIVERY",
      deviceId,
      clientTimestamp: new Date().toISOString(),
      payload: { deliveryLocation, note },
      state: "PENDING",
    };
    await enqueueOperation(operation);
    setData({
      ...data,
      deliveries: data.deliveries.map((item) =>
        item.orderItemId === delivery.orderItemId
          ? {
              ...item,
              status: "DELIVERED",
              deliveredAt: operation.clientTimestamp,
            }
          : item,
      ),
    });
    await hydrateQueue(data.hike.id);
    setMessage(
      online
        ? "Entrega guardada. Sincronizando…"
        : "Entrega guardada en este dispositivo; se sincronizará al recuperar la conexión.",
    );
    if (online) await syncQueue();
  };
  const markTransportComplete = async () => {
    if (!data || data.transportDeparture.completedAt) return;
    if (
      !window.confirm(
        `Revisaste ${transport} pasajeros. ¿Marcar la salida de transporte como completa?`,
      )
    )
      return;
    const note = window.prompt("Nota de salida (opcional)", "")?.trim() ?? "";
    const operation: OfflineOperation = {
      operationId: crypto.randomUUID(),
      hikeId: data.hike.id,
      type: "TRANSPORT_COMPLETE",
      deviceId,
      clientTimestamp: new Date().toISOString(),
      payload: { passengerCount: transport, note },
      state: "PENDING",
    };
    await enqueueOperation(operation);
    setData({
      ...data,
      transportDeparture: {
        completedAt: operation.clientTimestamp,
        passengerCount: transport,
        note: note || null,
      },
    });
    await hydrateQueue(data.hike.id);
    setMessage(
      online
        ? "Salida de transporte registrada. Sincronizando…"
        : "Salida de transporte guardada en este dispositivo.",
    );
    if (online) await syncQueue();
  };
  const deleteOfflineData = async () => {
    if (
      !data ||
      !window.confirm(
        "¿Eliminar de este dispositivo el paquete y todos los cambios pendientes de este hike?",
      )
    )
      return;
    await clearHikeData(data.hike.id);
    setPending([]);
    setData(initialData?.hike.id === data.hike.id ? initialData : null);
    setLastSync(null);
    setMessage("Los datos offline de este hike se eliminaron del dispositivo.");
  };
  const stopScanner = () => {
    const stream = video.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (scanLoop.current) cancelAnimationFrame(scanLoop.current);
    scanLoop.current = null;
  };
  const handleQr = async (token: string) => {
    if (!data) return;
    const payload = await verifySignedPayload(token, data.publicKey);
    if (!payload || payload.purpose !== "checkin") {
      setMessage("El QR no es válido o ya venció.");
      return;
    }
    if (payload.hikeId !== data.hike.id) {
      setMessage("Este QR pertenece a otro hike.");
      return;
    }
    const booking = data.bookings.find(
      (item) => item.id === payload.bookingId && item.qrToken === token,
    );
    if (!booking) {
      setMessage("El QR no está incluido en el paquete operativo vigente.");
      return;
    }
    stopScanner();
    setScannerOpen(false);
    setSelected(booking);
  };
  const openScanner = async () => {
    if (!data?.authorization) {
      setMessage(
        "Primero prepara el hike para activar el escáner y la autorización operativa.",
      );
      return;
    }
    setMessage("");
    setScannerOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      if (!video.current) return;
      video.current.srcObject = stream;
      await video.current.play();
      const Detector = (
        window as unknown as {
          BarcodeDetector?: new (options: { formats: string[] }) => {
            detect: (
              source: HTMLVideoElement,
            ) => Promise<Array<{ rawValue: string }>>;
          };
        }
      ).BarcodeDetector;
      if (!Detector) {
        setMessage(
          "Este navegador no permite leer QR con la cámara. Usa la búsqueda.",
        );
        return;
      }
      const detector = new Detector({ formats: ["qr_code"] });
      const scan = async () => {
        if (!video.current || video.current.readyState < 2) {
          scanLoop.current = requestAnimationFrame(scan);
          return;
        }
        const match = (
          await detector.detect(video.current).catch(() => [])
        ).find((code) => code.rawValue.startsWith("tdg:v2."));
        if (match) {
          await handleQr(match.rawValue);
          return;
        }
        scanLoop.current = requestAnimationFrame(scan);
      };
      scanLoop.current = requestAnimationFrame(scan);
    } catch {
      setMessage(
        "No pudimos abrir la cámara. Revisa el permiso o usa la búsqueda.",
      );
    }
  };

  if (!data)
    return (
      <main className="field-mode-empty">
        <CircleAlert />
        <h1>No hay un hike disponible.</h1>
        <Link href="/admin">VOLVER AL ADMINISTRADOR</Link>
      </main>
    );
  const hikeDate = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(data.hike.starts_at));
  return (
    <main className="field-mode">
      <header className="field-header">
        <Link href="/admin" aria-label="Volver al administrador">
          <House />
        </Link>
        <div>
          <span>MODO HIKE</span>
          <select
            value={data.hike.id}
            onChange={(event) => {
              window.location.href = `/admin/hike-mode?hike=${event.target.value}`;
            }}
          >
            {data.availableHikes.map((hike) => (
              <option value={hike.id} key={hike.id}>
                {hike.name}
              </option>
            ))}
          </select>
          <small>
            {hikeDate} · {data.hike.location_name}
          </small>
        </div>
        <button
          className={online ? "connection-online" : "connection-offline"}
          onClick={() => void syncQueue()}
        >
          {online ? <Signal /> : <SignalZero />}
          <span>{online ? "EN LÍNEA" : "SIN SEÑAL"}</span>
        </button>
      </header>
      <section
        className={`field-package-bar ${data.authorization ? "ready" : "not-ready"}`}
      >
        <div>
          <strong>
            {data.authorization ? "PAQUETE OFFLINE LISTO" : "HIKE NO PREPARADO"}
          </strong>
          <span>
            {pending.length} cambios pendientes · última sincronización{" "}
            {formatTime(lastSync ?? data.preparedAt)}
          </span>
        </div>
        <div className="field-package-actions">
          {pending.length > 0 && (
            <button onClick={() => setQueueOpen(true)}>
              <CircleAlert /> REVISAR {pending.length} PENDIENTES
            </button>
          )}
          <button
            disabled={preparing || !online}
            onClick={() => void loadPackage(data.hike.id, deviceId)}
          >
            {preparing ? <RefreshCw className="spin" /> : <CloudDownload />}
            {preparing
              ? "PREPARANDO"
              : data.authorization
                ? "ACTUALIZAR PAQUETE"
                : "PREPARAR OFFLINE"}
          </button>
          {data.authorization && (
            <button
              className="delete-offline"
              onClick={() => void deleteOfflineData()}
            >
              <Trash2 /> ELIMINAR DATOS
            </button>
          )}
        </div>
      </section>
      <section className="field-kpis">
        <article>
          <UserRoundCheck />
          <div>
            <strong>
              {checked}/{expected}
            </strong>
            <span>CHECK-INS</span>
          </div>
        </article>
        <article>
          <Dog />
          <div>
            <strong>
              {data.bookings.reduce(
                (sum, booking) => sum + booking.booking_dogs.length,
                0,
              )}
            </strong>
            <span>PERRITOS</span>
          </div>
        </article>
        <article>
          <BusFront />
          <div>
            <strong>{transport}</strong>
            <span>TRANSPORTE</span>
          </div>
        </article>
        <article className={alerts.length ? "has-alert" : ""}>
          <CircleAlert />
          <div>
            <strong>{alerts.length}</strong>
            <span>ALERTAS</span>
          </div>
        </article>
        <article>
          <PackageCheck />
          <div>
            <strong>{deliveries.length}</strong>
            <span>ENTREGAS</span>
          </div>
        </article>
      </section>
      <section className="field-tools">
        <label>
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nombre, reservación, correo, teléfono o perrito"
          />
        </label>
        <nav aria-label="Filtros operativos">
          {(
            [
              ["ALL", "Todos"],
              ["PENDING", "Pendientes"],
              ["CHECKED", "Check-in"],
              ["ALERTS", "Alertas"],
              ["TRANSPORT", "Transporte"],
              ["DELIVERIES", "Entregas"],
            ] as Array<[Filter, string]>
          ).map(([value, label]) => (
            <button
              className={filter === value ? "active" : ""}
              onClick={() => {
                setFilter(value);
                if (value === "DELIVERIES") setDeliveryOpen(true);
              }}
              key={value}
            >
              {label}
            </button>
          ))}
        </nav>
      </section>
      {message && (
        <div className="field-message">
          <CircleAlert />
          <span>{message}</span>
          <button onClick={() => setMessage("")}>
            <X />
          </button>
        </div>
      )}
      {transport > 0 && (
        <section className="field-transport-checklist">
          <BusFront />
          <div>
            <span>CHECKLIST DE TRANSPORTE</span>
            <strong>{transport} pasajeros revisados</strong>
            <small>
              {data.transportDeparture.completedAt
                ? `Salida confirmada · ${formatTime(data.transportDeparture.completedAt)}`
                : "Confirma la salida únicamente después de revisar la lista."}
            </small>
          </div>
          <button
            disabled={Boolean(data.transportDeparture.completedAt)}
            onClick={() => void markTransportComplete()}
          >
            {data.transportDeparture.completedAt ? (
              <>
                <CircleCheck /> TRANSPORTE COMPLETO
              </>
            ) : (
              "MARCAR TRANSPORTE COMPLETO"
            )}
          </button>
        </section>
      )}
      <section className="field-results">
        <div className="field-section-title">
          <div>
            <span>LLEGADAS</span>
            <h1>
              {filter === "PENDING"
                ? "Pendientes por llegar"
                : "Reservaciones del hike"}
            </h1>
          </div>
          <strong>{visibleBookings.length}</strong>
        </div>
        <div className="field-booking-list">
          {visibleBookings.map((booking) => {
            const complete = booking.booking_participants.every((person) =>
              checkedIds.has(person.id),
            );
            return (
              <button
                className={complete ? "checked" : ""}
                onClick={() => setSelected(booking)}
                key={booking.id}
              >
                <span className="booking-state">
                  {complete ? (
                    <CircleCheck />
                  ) : (
                    <span>
                      {
                        booking.booking_participants.filter(
                          (person) => !checkedIds.has(person.id),
                        ).length
                      }
                    </span>
                  )}
                </span>
                <span className="booking-person">
                  <strong>{bookingName(booking)}</strong>
                  <small>
                    {booking.booking_number} ·{" "}
                    {booking.booking_participants.length} personas ·{" "}
                    {booking.booking_dogs.length} perritos
                  </small>
                </span>
                <span className="booking-flags">
                  {hasDogAlert(booking) && (
                    <i>
                      <CircleAlert /> ALERTA
                    </i>
                  )}
                  {booking.transport_reservations.length > 0 && (
                    <i>
                      <BusFront /> {booking.transport_reservations.length}
                    </i>
                  )}
                  {deliveries.some(
                    (delivery) => delivery.bookingId === booking.id,
                  ) && (
                    <i>
                      <PackageCheck /> ENTREGA
                    </i>
                  )}
                </span>
                <ArrowLeft className="row-arrow" />
              </button>
            );
          })}
          {!visibleBookings.length && (
            <div className="field-no-results">
              <Search />
              <strong>Sin resultados</strong>
              <span>Prueba otro nombre o cambia los filtros.</span>
            </div>
          )}
        </div>
      </section>
      <button
        className="field-scan-sticky"
        disabled={!data.authorization}
        onClick={() => void openScanner()}
      >
        <QrCode />
        <span>
          {data.authorization ? "ESCANEAR QR" : "PREPARA EL HIKE PARA ESCANEAR"}
        </span>
      </button>
      {scannerOpen && (
        <div className="field-modal field-scanner-modal">
          <section>
            <header>
              <button
                onClick={() => {
                  stopScanner();
                  setScannerOpen(false);
                }}
              >
                <X />
              </button>
              <div>
                <span>CHECK-IN</span>
                <h2>Escanear QR</h2>
              </div>
            </header>
            <div className="field-camera">
              <video ref={video} muted playsInline />
              <i />
            </div>
            <p>
              Centra el código de la reservación dentro del recuadro. Funciona
              aun sin señal si preparaste el hike.
            </p>
          </section>
        </div>
      )}
      {selected && (
        <div className="field-modal">
          <section className="field-booking-sheet">
            <header>
              <button onClick={() => setSelected(null)}>
                <X />
              </button>
              <div>
                <span>{selected.booking_number} · PAGO CONFIRMADO</span>
                <h2>{bookingName(selected)}</h2>
              </div>
            </header>
            {selected.transport_reservations.length > 0 && (
              <div className="field-transport-summary">
                <BusFront />
                <strong>
                  {selected.transport_reservations.length} lugares de transporte
                </strong>
              </div>
            )}
            {hasDogAlert(selected) && (
              <div className="field-dog-alert">
                <CircleAlert />
                <div>
                  <strong>INDICACIONES DE PERRITOS</strong>
                  {selected.booking_dogs
                    .filter(
                      (dog) =>
                        dog.snapshot.reactivity ||
                        dog.snapshot.medical_conditions ||
                        dog.snapshot.medications ||
                        dog.snapshot.notes,
                    )
                    .map((dog) => (
                      <p key={dog.id}>
                        <b>{dog.snapshot.name ?? "Perrito"}:</b>{" "}
                        {[
                          dog.snapshot.reactivity,
                          dog.snapshot.medical_conditions,
                          dog.snapshot.medications,
                          dog.snapshot.notes,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ))}
                </div>
              </div>
            )}
            <div className="field-people">
              <span>ASISTENTES</span>
              {selected.booking_participants.map((person) => (
                <article key={person.id}>
                  <span>
                    {checkedIds.has(person.id) ? <CircleCheck /> : <span />}
                  </span>
                  <div>
                    <strong>{personName(person)}</strong>
                    <small>
                      {person.snapshot.is_minor ? "Menor" : "Adulto"}
                      {selected.signed_waivers.some(
                        (waiver) => waiver.booking_participant_id === person.id,
                      )
                        ? " · Responsiva firmada"
                        : " · Responsiva pendiente"}
                    </small>
                  </div>
                </article>
              ))}
            </div>
            {selected.booking_dogs.length > 0 && (
              <div className="field-booking-dogs">
                <span>PERRITOS</span>
                <strong>
                  {selected.booking_dogs
                    .map((dog) => dog.snapshot.name ?? "Perrito")
                    .join(" · ")}
                </strong>
              </div>
            )}
            <div className="field-sheet-actions">
              <button
                onClick={() =>
                  void queueCheckins(
                    selected,
                    selected.booking_participants.map((person) => person.id),
                  )
                }
              >
                <Check /> CONFIRMAR CHECK-IN PENDIENTE
              </button>
              {selected.booking_participants.some(
                (person) => person.snapshot.emergency_contact_phone,
              ) && (
                <a
                  href={`tel:${selected.booking_participants.find((person) => person.snapshot.emergency_contact_phone)?.snapshot.emergency_contact_phone}`}
                >
                  <Phone /> CONTACTO DE EMERGENCIA
                </a>
              )}
            </div>
          </section>
        </div>
      )}
      {deliveryOpen && (
        <div className="field-modal">
          <section className="field-booking-sheet field-delivery-sheet">
            <header>
              <button onClick={() => setDeliveryOpen(false)}>
                <X />
              </button>
              <div>
                <span>PRODUCTOS</span>
                <h2>Entregas en este hike</h2>
              </div>
            </header>
            {data.deliveries.map((delivery) => (
              <article key={delivery.orderItemId}>
                <PackageCheck />
                <div>
                  <strong>
                    {delivery.quantity} × {delivery.description}
                  </strong>
                  <small>
                    {data.bookings.find(
                      (booking) => booking.id === delivery.bookingId,
                    )?.booking_number ?? "Pedido independiente"}
                  </small>
                </div>
                <button
                  disabled={delivery.status === "DELIVERED"}
                  onClick={() => void markDelivered(delivery)}
                >
                  {delivery.status === "DELIVERED"
                    ? "ENTREGADO"
                    : "MARCAR ENTREGA"}
                </button>
              </article>
            ))}
            {!data.deliveries.length && (
              <div className="field-no-results">
                <PackageCheck />
                <strong>No hay entregas pendientes</strong>
              </div>
            )}
          </section>
        </div>
      )}
      {queueOpen && (
        <div className="field-modal">
          <section className="field-booking-sheet field-queue-sheet">
            <header>
              <button onClick={() => setQueueOpen(false)}>
                <X />
              </button>
              <div>
                <span>SINCRONIZACIÓN</span>
                <h2>Cambios pendientes</h2>
              </div>
            </header>
            {pending.map((operation) => (
              <article key={operation.operationId}>
                <span
                  className={`queue-state ${operation.state.toLowerCase()}`}
                >
                  {operation.state}
                </span>
                <div>
                  <strong>{operation.type.replaceAll("_", " ")}</strong>
                  <small>
                    {formatTime(operation.clientTimestamp)}
                    {operation.error ? ` · ${operation.error}` : ""}
                  </small>
                </div>
                <div>
                  {operation.state === "CONFLICT" && (
                    <button
                      disabled={!online}
                      onClick={async () => {
                        await updateOperation({
                          ...operation,
                          state: "PENDING",
                          error: undefined,
                        });
                        await hydrateQueue(data.hike.id);
                        setQueueOpen(false);
                        await syncQueue();
                      }}
                    >
                      REINTENTAR
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      if (!window.confirm("¿Descartar este cambio local?"))
                        return;
                      await removeOperation(operation.operationId);
                      await hydrateQueue(data.hike.id);
                    }}
                  >
                    DESCARTAR
                  </button>
                </div>
              </article>
            ))}
            {!pending.length && (
              <div className="field-no-results">
                <CircleCheck />
                <strong>Todo está sincronizado</strong>
              </div>
            )}
            <button
              className="button button-primary"
              disabled={!online || syncing || !pending.length}
              onClick={() => void syncQueue()}
            >
              <RefreshCw /> SINCRONIZAR TODO
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

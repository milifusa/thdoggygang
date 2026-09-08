"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BusFront,
  Check,
  CircleCheck,
  Dog,
  LayoutDashboard,
  PawPrint,
  QrCode,
  Search,
  TriangleAlert,
} from "lucide-react";

type Screen =
  | "home"
  | "scanner"
  | "booking"
  | "success"
  | "search"
  | "dogs"
  | "transport"
  | "alerts";
type CheckinMethod = "QR" | "MANUAL";
type LiveBooking = {
  id: string;
  booking_number: string;
  status: string;
  hike_id: string;
  booking_participants: Array<{
    id: string;
    snapshot: { first_name?: string; last_name?: string; is_minor?: boolean };
  }>;
  booking_dogs: Array<{
    id: string;
    snapshot: {
      name?: string;
      breed?: string;
      reactivity?: string;
      notes?: string;
    };
  }>;
  transport_reservations: Array<{
    id: string;
    booking_participant_id: string;
  }>;
  check_ins: Array<{ id: string; booking_participant_id: string }>;
};

export type HikeModeData = {
  hike: {
    id: string;
    name: string;
    starts_at: string;
    capacity: number;
    max_dogs: number | null;
  };
  availableHikes: Array<{ id: string; name: string; startsAt: string }>;
  bookings: LiveBooking[];
};

export function HikeMode({
  demo,
  data,
}: {
  demo: boolean;
  data: HikeModeData | null;
}) {
  const [screen, setScreen] = useState<Screen>("home");
  const [present, setPresent] = useState(["mishele", "eduardo", "maximo"]);
  const [ack, setAck] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [liveBooking, setLiveBooking] = useState<LiveBooking | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LiveBooking[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [checkinMethod, setCheckinMethod] = useState<CheckinMethod>("QR");
  const [alreadyUsedAt, setAlreadyUsedAt] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const scanLoop = useRef<number | null>(null);
  useEffect(
    () => () => {
      const stream = video.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
      if (scanLoop.current) cancelAnimationFrame(scanLoop.current);
    },
    [],
  );
  const openScanner = async () => {
    setScreen("scanner");
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (video.current) {
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
        if (Detector) {
          const detector = new Detector({ formats: ["qr_code"] });
          const scan = async () => {
            if (!video.current || video.current.readyState < 2) {
              scanLoop.current = requestAnimationFrame(scan);
              return;
            }
            try {
              const code = (await detector.detect(video.current)).find((item) =>
                item.rawValue.startsWith("tdg:checkin:"),
              );
              if (code) {
                await showBooking(code.rawValue);
                return;
              }
            } catch {
              /* keep the camera responsive while it focuses */
            }
            scanLoop.current = requestAnimationFrame(scan);
          };
          scanLoop.current = requestAnimationFrame(scan);
        } else {
          setCameraError(
            "Este navegador no puede leer códigos QR con la cámara. Usa la búsqueda manual.",
          );
        }
      }
    } catch {
      setCameraError(
        "No pudimos abrir la cámara. Revisa el permiso o busca la reservación manualmente.",
      );
    }
  };
  const stopCamera = () => {
    const stream = video.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (scanLoop.current) cancelAnimationFrame(scanLoop.current);
    scanLoop.current = null;
  };
  const showBooking = async (token?: string) => {
    stopCamera();
    setCameraError("");
    setCheckinMethod("QR");
    if (!demo && token) {
      const response = await fetch("/api/checkin/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json()) as {
        booking?: LiveBooking | LiveBooking[];
        alreadyUsedAt?: string | null;
        error?: string;
      };
      if (!response.ok || !payload.booking) {
        setCameraError(payload.error ?? "No encontramos esta reservación.");
        setScreen("scanner");
        return;
      }
      const booking = Array.isArray(payload.booking)
        ? payload.booking[0]
        : payload.booking;
      setLiveBooking(booking);
      setAlreadyUsedAt(payload.alreadyUsedAt ?? null);
      const checkedParticipantIds = new Set(
        booking.check_ins?.map((checkIn) => checkIn.booking_participant_id) ?? [],
      );
      setPresent(
        booking.booking_participants
          .filter((participant) => !checkedParticipantIds.has(participant.id))
          .map((participant) => participant.id),
      );
    }
    setScreen("booking");
  };
  const toggle = (id: string) =>
    setPresent((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  const openSearchResult = (booking: LiveBooking) => {
    setLiveBooking(booking);
    setAlreadyUsedAt(null);
    setCheckinMethod("MANUAL");
    const checkedParticipantIds = new Set(
      booking.check_ins?.map((checkIn) => checkIn.booking_participant_id) ?? [],
    );
    setPresent(
      booking.booking_participants
        .filter((participant) => !checkedParticipantIds.has(participant.id))
        .map((participant) => participant.id),
    );
    setScreen("booking");
  };
  const search = async () => {
    if (demo || searchQuery.trim().length < 2) return;
    setSearching(true);
    setSearched(true);
    setCameraError("");
    const response = await fetch(
      `/api/checkin/search?q=${encodeURIComponent(searchQuery)}${data?.hike.id ? `&hike=${encodeURIComponent(data.hike.id)}` : ""}`,
    );
    const payload = (await response.json()) as {
      bookings?: LiveBooking[];
      error?: string;
    };
    if (!response.ok) setCameraError(payload.error ?? "No pudimos buscar.");
    else setSearchResults(payload.bookings ?? []);
    setSearching(false);
  };
  const confirm = async () => {
    if (!demo && liveBooking) {
      const response = await fetch("/api/checkin/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hikeId: liveBooking.hike_id,
          bookingId: liveBooking.id,
          participantIds: present,
          method: checkinMethod,
          clientOperationId: crypto.randomUUID(),
        }),
      });
      if (!response.ok) {
        setCameraError("No pudimos guardar el check-in. Intenta otra vez.");
        return;
      }
    }
    setScreen("success");
    window.setTimeout(() => {
      setAck(false);
      setLiveBooking(null);
      setAlreadyUsedAt(null);
      setScreen("home");
    }, 1500);
  };
  const operationalBookings = data?.bookings ?? [];
  const expectedCount = demo
    ? 40
    : operationalBookings.reduce(
        (sum, booking) => sum + booking.booking_participants.length,
        0,
      );
  const checkedInCount = demo
    ? 38
    : operationalBookings.reduce(
        (sum, booking) => sum + booking.check_ins.length,
        0,
      );
  const dogCount = demo
    ? 26
    : operationalBookings.reduce(
        (sum, booking) => sum + booking.booking_dogs.length,
        0,
      );
  const transportCount = demo
    ? 18
    : operationalBookings.reduce(
        (sum, booking) => sum + booking.transport_reservations.length,
        0,
      );
  const dogRows = operationalBookings.flatMap((booking) => {
    const lead = booking.booking_participants[0]?.snapshot;
    const family = `${lead?.first_name ?? ""} ${lead?.last_name ?? ""}`.trim();
    return booking.booking_dogs.map((dog) => ({
      ...dog,
      bookingNumber: booking.booking_number,
      family,
    }));
  });
  const transportRows = operationalBookings.filter(
    (booking) => booking.transport_reservations.length > 0,
  );
  const alertRows = operationalBookings.flatMap((booking) => {
    const lead = booking.booking_participants[0]?.snapshot;
    const family = `${lead?.first_name ?? ""} ${lead?.last_name ?? ""}`.trim();
    const paymentAlert =
      booking.status === "PENDING_PAYMENT"
        ? [{
            id: `${booking.id}-payment`,
            title: "Pago pendiente",
            detail: `${booking.booking_number} · ${family}`,
          }]
        : [];
    const dogAlerts = booking.booking_dogs
      .filter((dog) => dog.snapshot.reactivity || dog.snapshot.notes)
      .map((dog) => ({
        id: dog.id,
        title: dog.snapshot.name ?? "Perrito con indicaciones",
        detail: dog.snapshot.reactivity || dog.snapshot.notes || "Revisar indicaciones.",
      }));
    return [...paymentAlert, ...dogAlerts];
  });
  const progress = expectedCount
    ? Math.min(100, Math.round((checkedInCount / expectedCount) * 100))
    : 0;
  const checkinPeople = liveBooking
    ? liveBooking.booking_participants.map((participant, index) => ({
        id: participant.id,
        name: `${participant.snapshot.first_name ?? ""} ${participant.snapshot.last_name ?? ""}`.trim(),
        alreadyChecked: liveBooking.check_ins?.some(
          (checkIn) => checkIn.booking_participant_id === participant.id,
        ) ?? false,
        detail: `${index === 0 ? "Titular" : "Acompañante"}${participant.snapshot.is_minor ? " · Menor" : ""}`,
      }))
    : [
        { id: "mishele", name: "Mishele Lojan", detail: "Titular", alreadyChecked: false },
        { id: "eduardo", name: "Eduardo Flores", detail: "Adulto", alreadyChecked: false },
        {
          id: "maximo",
          name: "Máximo Flores",
          detail: "Menor · Tutor: Mishele",
          alreadyChecked: false,
        },
      ];
  const firstDog = liveBooking?.booking_dogs[0]?.snapshot;
  const requiresAck = demo || Boolean(firstDog?.reactivity || firstDog?.notes);
  const leadLastName = checkinPeople[0]?.name.split(" ").at(-1) ?? "Manada";
  const allAlreadyChecked = Boolean(
    liveBooking && checkinPeople.length && checkinPeople.every((person) => person.alreadyChecked),
  );
  return (
    <main className="hike-mode">
      <header>
        <Link className="hike-exit" href="/admin" aria-label="Salir al panel de administración">
          <LayoutDashboard aria-hidden="true" />
          <span>SALIR AL PANEL</span>
        </Link>
        <div>
          <span>MODO HIKE</span>
          {data?.availableHikes.length && data.availableHikes.length > 1 ? (
            <select
              aria-label="Seleccionar hike"
              value={data.hike.id}
              onChange={(event) => {
                window.location.href = `/admin/hike-mode?hike=${encodeURIComponent(event.target.value)}`;
              }}
            >
              {data.availableHikes.map((hike) => (
                <option value={hike.id} key={hike.id}>{hike.name}</option>
              ))}
            </select>
          ) : (
            <strong>{data?.hike.name ?? "Sendero del Duende"}</strong>
          )}
        </div>
        <div className="live-dot">
          <i /> EN VIVO
        </div>
      </header>
      <section className="hike-counter">
        <div>
          <strong>{checkedInCount}</strong>
          <span>/ {expectedCount} CHECK-INS</span>
        </div>
        <div className="counter-bar">
          <i style={{ width: `${progress}%` }} />
        </div>
      </section>
      {screen === "home" && (
        <section className="hike-home">
          <div className="hike-stats">
            <article>
              <strong>{expectedCount}</strong>
              <span>ESPERADOS</span>
            </article>
            <article>
              <strong>{checkedInCount}</strong>
              <span>CHECK-IN</span>
            </article>
            <article>
              <strong>{dogCount}</strong>
              <span>PERRITOS</span>
            </article>
            <article>
              <strong>{transportCount}</strong>
              <span>TRANSPORTE</span>
            </article>
          </div>
          <button className="scan-main" onClick={openScanner}>
            <span>
              <QrCode aria-hidden="true" />
            </span>
            <strong>ESCANEAR QR</strong>
            <small>Apunta al código de la reservación</small>
          </button>
          <div className="hike-actions">
            <button onClick={() => setScreen("search")}>
              <span>
                <Search aria-hidden="true" />
              </span>
              <strong>BUSCAR PERSONA</strong>
            </button>
            <button onClick={() => setScreen("dogs")}>
              <span>
                <PawPrint aria-hidden="true" />
              </span>
              <strong>VER PERRITOS</strong>
            </button>
            <button onClick={() => setScreen("transport")}>
              <span>
                <BusFront aria-hidden="true" />
              </span>
              <strong>TRANSPORTE</strong>
            </button>
            <button onClick={() => setScreen("alerts")}>
              <span>
                <TriangleAlert aria-hidden="true" />
              </span>
              <strong>
                ALERTAS <i>{demo ? 4 : alertRows.length}</i>
              </strong>
            </button>
          </div>
        </section>
      )}
      {screen === "dogs" && (
        <section className="hike-operation-list">
          <button onClick={() => setScreen("home")}>
            <ArrowLeft aria-hidden="true" /> VOLVER
          </button>
          <span>PERRITOS DEL HIKE</span>
          <h1>{dogCount} perritos en la manada.</h1>
          {(demo ? [{ id: "mona", snapshot: { name: "Mona", breed: "Golden retriever", reactivity: "Dar espacio al formar el grupo." }, bookingNumber: "TDG-1048", family: "Mishele Lojan" }] : dogRows).map((dog) => (
            <article key={dog.id}>
              <PawPrint aria-hidden="true" />
              <div>
                <strong>{dog.snapshot.name ?? "Perrito"}</strong>
                <small>{dog.snapshot.breed || "Raza no indicada"} · {dog.bookingNumber}</small>
                {(dog.snapshot.reactivity || dog.snapshot.notes) && (
                  <p>{dog.snapshot.reactivity || dog.snapshot.notes}</p>
                )}
              </div>
              <span>{dog.family}</span>
            </article>
          ))}
          {!demo && dogRows.length === 0 && (
            <p className="hike-empty">No hay perritos en reservaciones confirmadas para este hike.</p>
          )}
        </section>
      )}
      {screen === "transport" && (
        <section className="hike-operation-list">
          <button onClick={() => setScreen("home")}>
            <ArrowLeft aria-hidden="true" /> VOLVER
          </button>
          <span>TRANSPORTE</span>
          <h1>{transportCount} lugares solicitados.</h1>
          {(demo ? operationalBookings.slice(0, 0) : transportRows).map((booking) => {
            const lead = booking.booking_participants[0]?.snapshot;
            return (
              <article key={booking.id}>
                <BusFront aria-hidden="true" />
                <div>
                  <strong>{lead?.first_name} {lead?.last_name}</strong>
                  <small>{booking.booking_number}</small>
                </div>
                <span>{booking.transport_reservations.length} LUGARES</span>
              </article>
            );
          })}
          {(demo || transportRows.length === 0) && (
            <p className="hike-empty">
              {demo ? "18 lugares de transporte en la vista demostrativa." : "Nadie solicitó transporte para este hike."}
            </p>
          )}
        </section>
      )}
      {screen === "alerts" && (
        <section className="hike-operation-list">
          <button onClick={() => setScreen("home")}>
            <ArrowLeft aria-hidden="true" /> VOLVER
          </button>
          <span>ALERTAS OPERATIVAS</span>
          <h1>{demo ? 4 : alertRows.length} puntos por revisar.</h1>
          {(demo ? [{ id: "demo-alert", title: "Mona", detail: "Sensible a grupos grandes al inicio. Darle espacio durante la formación." }] : alertRows).map((alert) => (
            <article className="operation-alert" key={alert.id}>
              <TriangleAlert aria-hidden="true" />
              <div>
                <strong>{alert.title}</strong>
                <p>{alert.detail}</p>
              </div>
            </article>
          ))}
          {!demo && alertRows.length === 0 && (
            <div className="hike-clear">
              <CircleCheck aria-hidden="true" /> No hay alertas para este hike.
            </div>
          )}
        </section>
      )}
      {screen === "scanner" && (
        <section className="scanner-screen">
          <div className="scanner-view">
            <video ref={video} playsInline muted />
            <div className="scan-frame">
              <i />
              <i />
              <i />
              <i />
            </div>
            {cameraError && <p>{cameraError}</p>}
          </div>
          <p>Centra el QR dentro del recuadro</p>
          {demo && (
            <button className="demo-scan" onClick={() => showBooking()}>
              SIMULAR QR DE RESERVACIÓN
            </button>
          )}
          <button
            className="manual-link"
            onClick={() => {
              stopCamera();
              setScreen("search");
            }}
          >
            ¿No tienen QR? Buscar manualmente →
          </button>
        </section>
      )}
      {screen === "search" && (
        <section className="manual-search">
          <div className="manual-search-nav">
            <button onClick={() => setScreen("home")}>
              <ArrowLeft aria-hidden="true" /> VOLVER AL MODO HIKE
            </button>
            <Link href="/admin">
              <LayoutDashboard aria-hidden="true" /> IR AL PANEL ADMIN
            </Link>
          </div>
          <span>CHECK-IN MANUAL</span>
          <h1>
            Busca a alguien
            <br />
            de la manada.
          </h1>
          <label>
            <Search aria-hidden="true" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setSearched(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void search();
              }}
              placeholder="Nombre, reservación o perrito"
            />
            <button onClick={search}>{searching ? "…" : "BUSCAR"}</button>
          </label>
          {cameraError && <p className="hike-error">{cameraError}</p>}
          {demo ? (
            <button className="search-result" onClick={() => showBooking()}>
              <span className="profile-initials">ML</span>
              <div>
                <strong>Mishele Lojan</strong>
                <small>TDG-1048 · 3 personas · Mona</small>
              </div>
              <i>
                <ArrowRight aria-hidden="true" />
              </i>
            </button>
          ) : (
            <>
            {searchResults.map((booking) => {
              const lead = booking.booking_participants[0]?.snapshot;
              return (
                <button
                  className="search-result"
                  key={booking.id}
                  onClick={() => openSearchResult(booking)}
                >
                  <span className="profile-initials">
                    {lead?.first_name?.[0]}
                    {lead?.last_name?.[0]}
                  </span>
                  <div>
                    <strong>
                      {lead?.first_name} {lead?.last_name}
                    </strong>
                    <small>
                      {booking.booking_number} ·{" "}
                      {booking.booking_participants.length} personas ·{" "}
                      {booking.booking_dogs.length} perritos
                    </small>
                  </div>
                  <i>
                    <ArrowRight aria-hidden="true" />
                  </i>
                </button>
              );
            })}
            {searched && !searching && searchResults.length === 0 && (
              <p className="hike-empty">No encontramos coincidencias en este hike.</p>
            )}
            </>
          )}
        </section>
      )}
      {screen === "booking" && (
        <section className="checkin-card">
          <button className="checkin-back" onClick={() => setScreen("home")}>
            <ArrowLeft aria-hidden="true" /> CANCELAR
          </button>
          <div className="valid-qr">
            <CircleCheck aria-hidden="true" /> RESERVACIÓN ENCONTRADA
          </div>
          {alreadyUsedAt && (
            <div className="used-qr-warning">
              <TriangleAlert aria-hidden="true" /> Este QR ya se utilizó el{" "}
              {new Intl.DateTimeFormat("es-MX", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "America/Mexico_City",
              }).format(new Date(alreadyUsedAt))}.
            </div>
          )}
          <p>RESERVACIÓN {liveBooking?.booking_number ?? "TDG-1048"}</p>
          <h1>Familia {leadLastName}</h1>
          <div className="checkin-meta">
            <span>{checkinPeople.length} PERSONAS</span>
            <span>{liveBooking?.booking_dogs.length ?? 1} PERRITO</span>
            <span>
              {liveBooking?.status === "PENDING_PAYMENT" ? (
                <>
                  <TriangleAlert aria-hidden="true" /> PAGO PENDIENTE
                </>
              ) : (
                <>
                  <CircleCheck aria-hidden="true" /> PAGADO
                </>
              )}
            </span>
          </div>
          <h2>¿Quién llegó?</h2>
          {checkinPeople.map(({ id, name, detail, alreadyChecked }) => (
            <button
              className={`check-person ${present.includes(id) ? "selected" : ""}`}
              onClick={() => toggle(id)}
              disabled={alreadyChecked}
              key={id}
            >
              <i>{(present.includes(id) || alreadyChecked) && <Check aria-hidden="true" />}</i>
              <span>
                <strong>{name}</strong>
                <small>{detail}{alreadyChecked ? " · Check-in realizado" : ""}</small>
              </span>
            </button>
          ))}
          {requiresAck && (
            <div className="dog-alert">
              <div>
                <span>
                  <TriangleAlert aria-hidden="true" /> IMPORTANTE
                </span>
                <strong>
                  <Dog aria-hidden="true" /> {firstDog?.name ?? "Mona"}
                </strong>
                <p>
                  {firstDog?.reactivity ||
                    firstDog?.notes ||
                    "Sensible a grupos grandes al inicio. Darle espacio durante la formación."}
                </p>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(event) => setAck(event.target.checked)}
                />{" "}
                ENTENDIDO
              </label>
            </div>
          )}
          {cameraError && <p className="hike-error">{cameraError}</p>}
          {allAlreadyChecked ? (
            <div className="hike-clear">
              <CircleCheck aria-hidden="true" /> Todos ya realizaron check-in.
            </div>
          ) : (
            <button
              className="confirm-checkin"
              disabled={(requiresAck && !ack) || present.length === 0}
              onClick={confirm}
            >
              CONFIRMAR {present.length} CHECK-INS →
            </button>
          )}
        </section>
      )}
      {screen === "success" && (
        <section className="checkin-success">
          <div>
            <CircleCheck aria-hidden="true" />
          </div>
          <h1>
            ¡Listos para
            <br />
            la aventura!
          </h1>
          <p>{present.length} personas registradas</p>
          <span>Preparando siguiente escaneo…</span>
        </section>
      )}
    </main>
  );
}

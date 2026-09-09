"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRight, Check, CircleCheck, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { calculateHikeSubtotal, type Adventure } from "../../lib/data";
import type { BookingContext } from "../../lib/domain/booking-context";
import type { Product } from "../../lib/products";
import type { BookingResume } from "./page";
import { formatClabe, type BankTransferConfig } from "../../lib/payment-types";

const steps = [
  "Personas",
  "Perritos",
  "Transporte",
  "Productos",
  "Responsivas",
  "Pago",
  "Listo",
];

function SignaturePad({
  onSigned,
}: {
  onSigned: (value: string | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - box.left) * (event.currentTarget.width / box.width),
      y: (event.clientY - box.top) * (event.currentTarget.height / box.height),
    };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const ctx = event.currentTarget.getContext("2d");
    const p = point(event);
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext("2d");
    const p = point(event);
    if (ctx) {
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#090909";
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  };
  const finish = () => {
    drawing.current = false;
    if (canvas.current) onSigned(canvas.current.toDataURL("image/png"));
  };
  const clear = () => {
    const node = canvas.current;
    node?.getContext("2d")?.clearRect(0, 0, node.width, node.height);
    onSigned(null);
  };
  return (
    <div className="signature-wrap">
      <canvas
        ref={canvas}
        width={820}
        height={220}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        aria-label="Área para firmar"
      />
      <div className="signature-line">
        <span>FIRMA AQUÍ CON TU DEDO</span>
        <button type="button" onClick={clear}>
          BORRAR
        </button>
      </div>
    </div>
  );
}

export function BookingWizard({
  adventure,
  context,
  products,
  cardPaymentsEnabled,
  bankTransfer,
  resume,
}: {
  adventure: Adventure;
  context: BookingContext;
  products: Product[];
  cardPaymentsEnabled: boolean;
  bankTransfer: BankTransferConfig | null;
  resume?: BookingResume;
}) {
  const people = context.people;
  const dogs = context.dogs;
  const [step, setStep] = useState(resume?.step ?? 0);
  const [selectedPeople, setSelectedPeople] = useState(
    resume?.personIds.length ? resume.personIds : people[0] ? [people[0].id] : [],
  );
  const [selectedDogs, setSelectedDogs] = useState(resume?.dogIds.length ? resume.dogIds : dogs[0] ? [dogs[0].id] : []);
  const [transport, setTransport] = useState(Boolean(resume?.transportPersonIds.length));
  const [transportPeople, setTransportPeople] = useState(
    resume?.transportPersonIds.length ? resume.transportPersonIds : people[0] ? [people[0].id] : [],
  );
  const [productQuantities, setProductQuantities] = useState<Record<string,number>>(Object.fromEntries(resume?.productSelections.map((item)=>[item.productId,item.quantity])??[]));
  const [productVariants, setProductVariants] = useState<Record<string,string>>(
    Object.fromEntries(products.map((product)=>[product.id,resume?.productSelections.find((item)=>item.productId===product.id)?.variant??product.variants[0]??""])),
  );
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [waiverSaved, setWaiverSaved] = useState(Boolean(resume?.waiverSigned));
  const [accepted, setAccepted] = useState(Boolean(resume?.waiverSigned));
  const [payment, setPayment] = useState<"card" | "transfer">(cardPaymentsEnabled ? "card" : "transfer");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [transferPending, setTransferPending] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(resume?.bookingId ?? null);
  const [syncMessage, setSyncMessage] = useState("");
  const hikeSubtotal = useMemo(
    () => calculateHikeSubtotal(adventure, selectedPeople.length, selectedDogs.length),
    [adventure, selectedPeople.length, selectedDogs.length],
  );
  const productsSubtotal = useMemo(
    () => products.reduce((sum,product)=>sum+(productQuantities[product.id]??0)*(product.priceCents/100),0),
    [products,productQuantities],
  );
  const total = useMemo(
    () => hikeSubtotal + (transport ? transportPeople.length * adventure.transportPrice : 0) + productsSubtotal,
    [hikeSubtotal, transport, transportPeople.length, adventure.transportPrice,productsSubtotal],
  );
  const toggle = (
    id: string,
    values: string[],
    setter: (value: string[]) => void,
  ) =>
    setter(
      values.includes(id)
        ? values.filter((item) => item !== id)
        : [...values, id],
    );
  const persistDraft = async () => {
    if (context.mode === "demo") return bookingId;
    const response = await fetch("/api/bookings/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bookingId,
        hikeSlug: adventure.slug,
        personIds: selectedPeople,
        dogIds: selectedDogs,
        transportPersonIds: transport
          ? transportPeople.filter((id) => selectedPeople.includes(id))
          : [],
        productSelections: products.filter((product)=>(productQuantities[product.id]??0)>0).map((product)=>({productId:product.id,variant:productVariants[product.id]??"",quantity:productQuantities[product.id]})),
        currentStep: ['perritos','transporte','productos','responsiva','pago','confirmacion','confirmacion'][step] ?? 'personas',
      }),
    });
    const payload = (await response.json()) as {
      bookingId?: string;
      error?: string;
    };
    if (!response.ok || !payload.bookingId)
      throw new Error(payload.error ?? "No pudimos guardar tu reservación.");
    setBookingId(payload.bookingId);
    return payload.bookingId;
  };
  const next = async () => {
    setProcessing(true);
    setSyncMessage("");
    try {
      const savedBookingId = step === 5 ? bookingId : await persistDraft();
      if (step === 5 && context.mode === "live" && !savedBookingId)
        throw new Error("No encontramos tu borrador. Vuelve al paso anterior.");
      if (
        step === 4 &&
        context.mode === "live" &&
        savedBookingId &&
        signatureData &&
        !waiverSaved
      ) {
        const response = await fetch("/api/waivers/sign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bookingId: savedBookingId, signatureData }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
        };
        if (!response.ok || !payload.ok)
          throw new Error(payload.error ?? "No pudimos guardar la responsiva.");
        setWaiverSaved(true);
      }
      if (step === 5 && context.mode === "live") {
        if (payment === "card") {
          const response = await fetch("/api/checkout/stripe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ bookingId: savedBookingId }),
          });
          const payload = (await response.json()) as {
            url?: string;
            error?: string;
          };
          if (!response.ok || !payload.url)
            throw new Error(payload.error ?? "No pudimos iniciar el pago.");
          window.location.href = payload.url;
          return;
        }
        if (!receiptFile || !savedBookingId)
          throw new Error("Selecciona tu comprobante antes de continuar.");
        const form = new FormData();
        form.set("bookingId", savedBookingId);
        form.set("receipt", receiptFile);
        const response = await fetch("/api/payments/transfer", {
          method: "POST",
          body: form,
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
        };
        if (!response.ok || !payload.ok)
          throw new Error(
            payload.error ?? "No pudimos recibir el comprobante.",
          );
        setTransferPending(true);
        setStep(6);
        return;
      }
      if (step === 5)
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      setStep((current) => Math.min(6, current + 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setSyncMessage(
        error instanceof Error
          ? error.message
          : "No pudimos guardar tu avance.",
      );
    } finally {
      setProcessing(false);
    }
  };
  const canContinue =
    step === 0
      ? selectedPeople.length > 0
      : step === 1
        ? selectedDogs.length > 0
        : step === 4
          ? Boolean(signatureData || waiverSaved) && accepted
          : step === 5 && context.mode === "live" && payment === "transfer"
            ? Boolean(bankTransfer && receiptFile)
            : step === 5 && context.mode === "live" && payment === "card"
              ? cardPaymentsEnabled
            : true;
  const progress = `${Math.round((step / (steps.length - 1)) * 100)}%`;
  const goBack = () => {
    if (step <= 5) setWaiverSaved(false);
    setStep((current) => Math.max(0, current - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="wizard-page">
      <header className="wizard-header">
        <Link className="wordmark" href="/">
          THE DOGGY <span>GANG</span>
        </Link>
        <Link
          href={`/aventuras/${adventure.slug}`}
          className="close-wizard"
          aria-label="Cerrar"
        >
          <X aria-hidden="true" />
        </Link>
      </header>
      <div className="wizard-progress" aria-label={`Paso ${step + 1} de ${steps.length}`}>
        {steps.map((label, index) => (
          <div className={index <= step ? "active" : ""} key={label}>
            <i />
            <span>
              {index + 1}. {label}
            </span>
          </div>
        ))}
      </div>
      {step < 6 && (
        <div className="wizard-desktop-dog-strip" aria-hidden="true">
          <div
            className="wizard-dog-track"
            style={{ "--wizard-progress": progress } as CSSProperties}
          >
            <span className="wizard-dog-path" />
            <img src="/brand/logo-circular-blue.png" alt="" />
          </div>
        </div>
      )}
      {step < 6 && (
        <section
          className="wizard-mobile-status"
          aria-label={`Paso ${step + 1} de ${steps.length}: ${steps[step]}`}
        >
          <div className="wizard-mobile-heading">
            <span>PASO {step + 1} DE {steps.length}</span>
            <strong>{steps[step]}</strong>
          </div>
          <div className="wizard-mobile-total">
            <span>{adventure.title}</span>
            <strong>${total.toLocaleString("es-MX")} MXN</strong>
          </div>
          <div
            className="wizard-dog-track"
            style={{ "--wizard-progress": progress } as CSSProperties}
            aria-hidden="true"
          >
            <span className="wizard-dog-path" />
            <img src="/brand/logo-circular-blue.png" alt="" />
          </div>
        </section>
      )}

      {step < 6 ? (
        <div className="wizard-layout">
          <section className="wizard-main">
            <p className="wizard-kicker">PASO {step + 1} DE {steps.length}</p>
            {step === 0 && (
              <>
                <h1>
                  ¿Quién viene a<br />
                  esta aventura?
                </h1>
                <p className="wizard-lead">
                  Tu manada ya está guardada. Sólo elige quién se apunta esta
                  vez.
                </p>
                {people.length ? (
                  <div className="select-list">
                    {people.map((person) => (
                      <button
                        type="button"
                        aria-pressed={selectedPeople.includes(person.id)}
                        className={`select-card ${selectedPeople.includes(person.id) ? "selected" : ""}`}
                        key={person.id}
                        onClick={() =>
                          toggle(person.id, selectedPeople, setSelectedPeople)
                        }
                      >
                        <span className="profile-initials">
                          {person.initials}
                        </span>
                        <span>
                          <strong>{person.name}</strong>
                          <small>{person.detail}</small>
                        </span>
                        <i aria-hidden="true">
                          {selectedPeople.includes(person.id) && <Check />}
                        </i>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="wizard-empty">
                    Primero agrega a una persona a tu manada.
                  </p>
                )}
                <button
                  className="add-row"
                  type="button"
                  onClick={() =>
                    window.location.assign(
                      `/mi-manada?new=person&returnTo=${encodeURIComponent(`/reservar/${adventure.slug}`)}`,
                    )
                  }
                >
                  <Plus aria-hidden="true" /> AGREGAR OTRA PERSONA
                </button>
              </>
            )}
            {step === 1 && (
              <>
                <h1>
                  ¿Qué perritos
                  <br />
                  vienen?
                </h1>
                <p className="wizard-lead">
                  Ellos también cuentan cada aventura. Selecciona a los
                  exploradores de cuatro patas.
                </p>
                {dogs.length ? (
                  <div className="select-list">
                    {dogs.map((dog) => (
                      <button
                        type="button"
                        aria-pressed={selectedDogs.includes(dog.id)}
                        className={`select-card dog-select ${selectedDogs.includes(dog.id) ? "selected" : ""}`}
                        key={dog.id}
                        onClick={() =>
                          toggle(dog.id, selectedDogs, setSelectedDogs)
                        }
                      >
                        <img src={dog.image} alt={dog.name} />
                        <span>
                          <strong>{dog.name}</strong>
                          <small>{dog.detail}</small>
                        </span>
                        <i aria-hidden="true">
                          {selectedDogs.includes(dog.id) && <Check />}
                        </i>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="wizard-empty">
                    Primero agrega a un perrito a tu manada.
                  </p>
                )}
                {dogs.find((dog) => selectedDogs.includes(dog.id)) && (
                  <div className="unchanged-box">
                    <strong>
                      ¿Cambió algo que debamos saber sobre{" "}
                      {dogs.find((dog) => selectedDogs.includes(dog.id))?.name}?
                    </strong>
                    <label>
                      <input type="radio" defaultChecked name="changed" /> No,
                      todo sigue igual
                    </label>
                    <label>
                      <input type="radio" name="changed" /> Sí, quiero
                      actualizar su perfil
                    </label>
                  </div>
                )}
                <button
                  className="add-row"
                  type="button"
                  onClick={() =>
                    window.location.assign(
                      `/mi-manada?new=dog&returnTo=${encodeURIComponent(`/reservar/${adventure.slug}`)}`,
                    )
                  }
                >
                  <Plus aria-hidden="true" /> AGREGAR PERRITO
                </button>
              </>
            )}
            {step === 2 && (
              <>
                <h1>
                  ¿Cómo llega
                  <br />
                  la manada?
                </h1>
                <p className="wizard-lead">
                  Puedes encontrarnos en el sendero o subirte al transporte del
                  grupo.
                </p>
                <div className="choice-grid">
                  <button
                    type="button"
                    aria-pressed={!transport}
                    onClick={() => setTransport(false)}
                    className={!transport ? "selected" : ""}
                  >
                    <span>AUTO</span>
                    <strong>Llegamos por nuestra cuenta</strong>
                    <small>Te compartiremos el punto exacto.</small>
                    <i aria-hidden="true">{!transport && <Check />}</i>
                  </button>
                  {adventure.transportAvailable && <button
                    type="button"
                    aria-pressed={transport}
                    onClick={() => setTransport(true)}
                    className={transport ? "selected" : ""}
                  >
                    <span>BUS</span>
                    <strong>Necesitamos transporte</strong>
                    <small>{adventure.transportDeparture ? `Desde ${adventure.transportDeparture}` : "Punto por confirmar"} · ${adventure.transportPrice.toLocaleString("es-MX")} por persona.</small>
                    <i aria-hidden="true">{transport && <Check />}</i>
                  </button>}
                </div>
                {transport && (
                  <div className="transport-people">
                    <h3>¿Quién necesita transporte?</h3>
                    {people
                      .filter((person) => selectedPeople.includes(person.id))
                      .map((person) => (
                        <label key={person.id}>
                          <input
                            type="checkbox"
                            checked={transportPeople.includes(person.id)}
                            onChange={() =>
                              toggle(
                                person.id,
                                transportPeople,
                                setTransportPeople,
                              )
                            }
                          />
                          <span>{person.name}</span>
                          <small>＋ ${adventure.transportPrice.toLocaleString("es-MX")}</small>
                        </label>
                      ))}
                  </div>
                )}
              </>
            )}
            {step === 3 && (
              <>
                <h1>
                  Equipo para
                  <br />
                  la aventura.
                </h1>
                <p className="wizard-lead">
                  Puedes agregar productos a tu reservación y te los entregaremos en este hike.
                </p>
                {products.length ? <div className="wizard-product-grid">
                  {products.map((product)=>{
                    const quantity=productQuantities[product.id]??0;
                    const selectedVariant=productVariants[product.id]??product.variants[0]??"";
                    return <article className={quantity>0?"selected":""} key={product.id}>
                      <div className="product-visual">
                        <img src={product.image} alt={product.name}/>
                        {quantity>0&&<span>EN TU RESERVACIÓN</span>}
                      </div>
                      <div className="product-copy">
                        <span>{product.category}</span>
                        <h3>{product.name}</h3>
                        <p>{product.description}</p>
                        <strong>${(product.priceCents/100).toLocaleString("es-MX")} MXN</strong>
                      </div>
                      {product.variants.length>0&&<fieldset className="product-variants">
                        <legend>ELIGE UNA OPCIÓN</legend>
                        <div>
                          {product.variants.map((variant)=><button
                            type="button"
                            key={variant}
                            aria-pressed={selectedVariant===variant}
                            className={selectedVariant===variant?"active":""}
                            onClick={()=>setProductVariants((current)=>({...current,[product.id]:variant}))}
                          >{variant}</button>)}
                        </div>
                      </fieldset>}
                      <div className="product-buy-row">
                        <span>CANTIDAD</span>
                        <div className="product-quantity">
                          <button type="button" aria-label={`Quitar ${product.name}`} disabled={quantity===0} onClick={()=>setProductQuantities((current)=>({...current,[product.id]:Math.max(0,quantity-1)}))}><Minus/></button>
                          <span aria-live="polite">{quantity}</span>
                          <button type="button" aria-label={`Agregar ${product.name}`} disabled={quantity>=product.stock} onClick={()=>setProductQuantities((current)=>({...current,[product.id]:quantity+1}))}><Plus/></button>
                        </div>
                      </div>
                    </article>;
                  })}
                </div>:<div className="wizard-empty"><ShoppingBag/><p>No hay productos disponibles en este momento.</p></div>}
                <p className="product-pickup-note">Los productos se entregan durante el check-in del hike.</p>
              </>
            )}
            {step === 4 && (
              <>
                <h1>
                  Un acuerdo
                  <br />
                  para cuidarnos.
                </h1>
                <p className="wizard-lead">
                  Esta responsiva se genera para tu reservación y queda ligada a
                  las personas y perritos seleccionados.
                </p>
                <div className="waiver-document">
                  <div className="waiver-title">
                    <span>RESPONSIVA · VERSIÓN 1</span>
                    <strong>{adventure.title}</strong>
                    <small>
                      {adventure.date} · {adventure.location}
                    </small>
                  </div>
                  <p>
                    Declaro que yo y las personas menores bajo mi tutela
                    participamos voluntariamente. Confirmo que los perritos
                    registrados tienen condiciones adecuadas para la ruta y me
                    comprometo a seguir las indicaciones del equipo.
                  </p>
                  <p>
                    Entiendo los riesgos inherentes a una actividad al aire
                    libre y autorizo al equipo a actuar conforme al protocolo de
                    emergencia registrado.
                  </p>
                </div>
                <SignaturePad
                  onSigned={(value) => {
                    setSignatureData(value);
                    setWaiverSaved(false);
                  }}
                />
                <label className="accept-row">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={accepted}
                    onChange={(event) => setAccepted(event.target.checked)}
                  />
                  <span className="accept-toggle" aria-hidden="true"><i>{accepted&&<Check />}</i></span>
                  <span className="accept-copy">
                    <strong>He leído y acepto la responsiva.</strong>
                    <small>{accepted?"Aceptado. Ya puedes continuar.":"Activa este control para poder continuar."}</small>
                  </span>
                </label>
              </>
            )}
            {step === 5 && (
              <>
                <h1>
                  Último paso.
                  <br />
                  Reserva tu lugar.
                </h1>
                <p className="wizard-lead">
                  Elige cómo quieres pagar. Tu QR se genera cuando confirmemos
                  el pago.
                </p>
                <div className="payment-tabs">
                  <button
                    className={payment === "card" ? "active" : ""}
                    onClick={() => setPayment("card")}
                    disabled={!cardPaymentsEnabled}
                  >
                    {cardPaymentsEnabled ? "TARJETA" : "TARJETA · PRÓXIMAMENTE"}
                  </button>
                  <button
                    className={payment === "transfer" ? "active" : ""}
                    onClick={() => setPayment("transfer")}
                    disabled={!bankTransfer}
                  >
                    {bankTransfer ? "TRANSFERENCIA" : "TRANSFERENCIA · NO DISPONIBLE"}
                  </button>
                </div>
                {!cardPaymentsEnabled && !bankTransfer && (
                  <p className="payment-unavailable" role="alert">
                    Los pagos están temporalmente deshabilitados. La reservación puede guardarse como borrador, pero no se cobrará hasta que el administrador configure un método real.
                  </p>
                )}
                {payment === "card" ? (
                  <div className="stripe-checkout-box">
                    <div>TDG</div>
                    <span>PAGO SEGURO</span>
                    <strong>Continuarás al checkout protegido de Stripe</strong>
                    <p>
                      Ahí podrás capturar tu tarjeta. The Doggy Gang nunca
                      recibe ni almacena el número, vencimiento o CVV.
                    </p>
                    <small>CONEXIÓN CIFRADA · CONFIRMACIÓN POR WEBHOOK</small>
                  </div>
                ) : bankTransfer ? (
                  <div className="bank-box">
                    <span>DATOS PARA TRANSFERENCIA</span>
                    <strong>{bankTransfer.bankName}</strong>
                    <p>
                      {bankTransfer.accountName}
                      <br />
                      CLABE {formatClabe(bankTransfer.clabe)}<br />
                      Referencia: {bankTransfer.referencePrefix}-{(bookingId ?? "RESERVA").slice(0, 8).toUpperCase()}
                    </p>
                    <label className="receipt-upload">
                      {receiptFile
                        ? `ARCHIVO · ${receiptFile.name}`
                        : "SUBIR COMPROBANTE"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,application/pdf"
                        onChange={(event) =>
                          setReceiptFile(event.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                  </div>
                ) : null}
              </>
            )}
            {syncMessage && (
              <p className="wizard-error" role="alert">
                {syncMessage}
              </p>
            )}
            <div className="wizard-actions">
              <button
                type="button"
                disabled={step === 0 || processing}
                onClick={goBack}
                className="back-button"
              >
                ATRÁS
              </button>
              <button
                type="button"
                disabled={!canContinue || processing}
                onClick={next}
                className="button button-primary"
              >
                {processing
                  ? "GUARDANDO…"
                  : step === 5
                    ? `PAGAR $${total.toLocaleString("es-MX")} MXN`
                    : "CONTINUAR"}
              </button>
            </div>
          </section>
          <aside className="wizard-summary">
            <img src={adventure.image} alt={adventure.title} />
            <div>
              <span>TU AVENTURA</span>
              <h3>{adventure.title}</h3>
              <p>
                {adventure.shortDate} · {adventure.time}
                <br />
                {adventure.location}
              </p>
            </div>
            <dl>
              <div>
                <dt>Personas</dt>
                <dd>{selectedPeople.length}</dd>
              </div>
              <div>
                <dt>Perritos</dt>
                <dd>{selectedDogs.length}</dd>
              </div>
              <div>
                <dt>Hike</dt>
                <dd>
                  $
                  {hikeSubtotal.toLocaleString("es-MX")}
                </dd>
              </div>
              {transport && (
                <div>
                  <dt>Transporte</dt>
                  <dd>
                    ${(transportPeople.length * adventure.transportPrice).toLocaleString("es-MX")}
                  </dd>
                </div>
              )}
              {productsSubtotal > 0 && (
                <div>
                  <dt>Productos</dt>
                  <dd>${productsSubtotal.toLocaleString("es-MX")}</dd>
                </div>
              )}
              <div className="summary-total">
                <dt>TOTAL</dt>
                <dd>
                  ${total.toLocaleString("es-MX")} <small>MXN</small>
                </dd>
              </div>
            </dl>
            <p className="draft-saved">
              GUARDADO ·{" "}
              {context.mode === "live"
                ? "Tu avance se guarda en tu cuenta"
                : "Vista de demostración interactiva"}
            </p>
          </aside>
        </div>
      ) : transferPending ? (
        <TransferPending adventure={adventure} />
      ) : (
        <Confirmation
          adventure={adventure}
          peopleCount={selectedPeople.length}
          dogCount={selectedDogs.length}
          transport={transport}
          total={total}
        />
      )}
    </main>
  );
}

function Confirmation({
  adventure,
  peopleCount,
  dogCount,
  transport,
  total,
}: {
  adventure: Adventure;
  peopleCount: number;
  dogCount: number;
  transport: boolean;
  total: number;
}) {
  const token = "tdg:checkin:7f9f5c2e-74bc-4f89-a310-86b4109d9d25";
  return (
    <section className="confirmation">
      <div className="success-mark">
        <CircleCheck aria-hidden="true" />
      </div>
      <p className="eyebrow">RESERVACIÓN CONFIRMADA</p>
      <h1>
        ¡Ya eres parte de
        <br />
        esta aventura!
      </h1>
      <p>
        Nos vemos muy pronto en <strong>{adventure.title}</strong>. Guarda este
        QR; lo escanearemos al llegar.
      </p>
      <div className="confirmation-card">
        <div className="confirmation-info">
          <span>{adventure.shortDate}</span>
          <h2>{adventure.title}</h2>
          <p>
            {adventure.time} · {adventure.location}
          </p>
          <dl>
            <div>
              <dt>Personas</dt>
              <dd>{peopleCount}</dd>
            </div>
            <div>
              <dt>Perritos</dt>
              <dd>{dogCount}</dd>
            </div>
            <div>
              <dt>Transporte</dt>
              <dd>{transport ? "Sí" : "Por cuenta propia"}</dd>
            </div>
            <div>
              <dt>Pago</dt>
              <dd>${total.toLocaleString("es-MX")} MXN · Pagado</dd>
            </div>
          </dl>
        </div>
        <div className="qr-panel">
          <QRCodeSVG value={token} size={190} level="H" />
          <strong>TU QR DE CHECK-IN</strong>
          <small>TDG · 7F9F5C2E</small>
        </div>
      </div>
      <div className="confirmation-actions">
        <Link className="button button-dark" href="/mi-manada">
          VER MIS AVENTURAS <ArrowRight aria-hidden="true" />
        </Link>
        <button
          className="button outline-button"
          onClick={() => window.print()}
        >
          GUARDAR QR
        </button>
      </div>
    </section>
  );
}

function TransferPending({ adventure }: { adventure: Adventure }) {
  return (
    <section className="confirmation pending-confirmation">
      <div className="success-mark">
        <CircleCheck aria-hidden="true" />
      </div>
      <p className="eyebrow">COMPROBANTE RECIBIDO</p>
      <h1>
        Tu lugar está
        <br />
        en revisión.
      </h1>
      <p>
        Revisaremos el pago de <strong>{adventure.title}</strong> y te
        enviaremos el QR cuando quede confirmado.
      </p>
      <div className="pending-card">
        <span>TIEMPO ESTIMADO</span>
        <strong>Hasta 24 horas</strong>
        <p>
          No necesitas enviar el comprobante por WhatsApp. Ya está seguro en tu
          reservación.
        </p>
      </div>
      <Link className="button button-dark" href="/mi-manada">
        VER MIS AVENTURAS <ArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRight, Check, CircleCheck, Minus, Plus, ShoppingBag, TentTree, UserRound, WalletCards, X } from "lucide-react";
import { calculateHikeSubtotal, type Adventure } from "../../lib/data";
import type { BookingContext } from "../../lib/domain/booking-context";
import { dateInMexico, isFreeChildForDate } from "../../lib/person-age";
import type { Product } from "../../lib/products";
import type { BookingResume } from "./page";
import { formatClabe, type BankTransferConfig } from "../../lib/payment-types";

function SignaturePad({
  onSigned,
}: {
  onSigned: (value: string | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const strokeDistance = useRef(0);
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
    lastPoint.current = p;
    strokeDistance.current = 0;
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext("2d");
    const p = point(event);
    if (lastPoint.current) {
      strokeDistance.current += Math.hypot(
        p.x - lastPoint.current.x,
        p.y - lastPoint.current.y,
      );
    }
    lastPoint.current = p;
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
    lastPoint.current = null;
    if (strokeDistance.current >= 8) hasInk.current = true;
    if (canvas.current && hasInk.current)
      onSigned(canvas.current.toDataURL("image/png"));
    else onSigned(null);
  };
  const clear = () => {
    const node = canvas.current;
    node?.getContext("2d")?.clearRect(0, 0, node.width, node.height);
    hasInk.current = false;
    lastPoint.current = null;
    strokeDistance.current = 0;
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
  creditBalanceCents,
  resume,
  paymentInterrupted,
}: {
  adventure: Adventure;
  context: BookingContext;
  products: Product[];
  cardPaymentsEnabled: boolean;
  bankTransfer: BankTransferConfig | null;
  creditBalanceCents: number;
  resume?: BookingResume;
  paymentInterrupted?: boolean;
}) {
  const [people, setPeople] = useState(context.people);
  const dogs = context.dogs;
  const hasCamping = adventure.campingOptions.length > 0;
  const steps = useMemo(
    () =>
      hasCamping
        ? ["Personas", "Perritos", "Camping", "Cómo llegamos", "Productos", "Revisar", "Responsivas", "Pago", "Listo"]
        : ["Personas", "Perritos", "Cómo llegamos", "Productos", "Revisar", "Responsivas", "Pago", "Listo"],
    [hasCamping],
  );
  const campingStep = hasCamping ? 2 : -1;
  const transportStep = hasCamping ? 3 : 2;
  const productStep = hasCamping ? 4 : 3;
  const reviewStep = productStep + 1;
  const waiverStep = reviewStep + 1;
  const paymentStep = waiverStep + 1;
  const finalStep = paymentStep + 1;
  const [step, setStep] = useState(resume?.step ?? 0);
  const [selectedPeople, setSelectedPeople] = useState(
    resume?.personIds.length ? resume.personIds : people[0] ? [people[0].id] : [],
  );
  const [selectedDogs, setSelectedDogs] = useState(resume?.dogIds.length ? resume.dogIds : dogs[0] ? [dogs[0].id] : []);
  const [dogChoiceMade, setDogChoiceMade] = useState(Boolean(resume) || dogs.length > 0);
  const [transport, setTransport] = useState(Boolean(resume?.transportPersonIds.length));
  const [transportPeople, setTransportPeople] = useState(
    resume?.transportPersonIds.length ? resume.transportPersonIds : people[0] ? [people[0].id] : [],
  );
  const [campingOptionId, setCampingOptionId] = useState<string | null>(
    resume?.campingOptionId ?? null,
  );
  const [campingChoiceMade, setCampingChoiceMade] = useState(Boolean(resume));
  const [campingPeople, setCampingPeople] = useState<string[]>(
    resume?.campingPersonIds.length ? resume.campingPersonIds : [],
  );
  const [productQuantities, setProductQuantities] = useState<Record<string,number>>(Object.fromEntries(resume?.productSelections.map((item)=>[item.productId,item.quantity])??[]));
  const [productVariants, setProductVariants] = useState<Record<string,string>>(
    Object.fromEntries(products.map((product)=>[product.id,resume?.productSelections.find((item)=>item.productId===product.id)?.variant??product.variants[0]??""])),
  );
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [waiverSaved, setWaiverSaved] = useState(Boolean(resume?.waiverSigned));
  const [accepted, setAccepted] = useState(Boolean(resume?.waiverSigned));
  const [payment, setPayment] = useState<"card" | "transfer">(cardPaymentsEnabled ? "card" : "transfer");
  const [useCredit, setUseCredit] = useState(creditBalanceCents > 0);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [transferPending, setTransferPending] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(resume?.bookingId ?? null);
  const [syncMessage, setSyncMessage] = useState("");
  const [dogNeedsUpdate,setDogNeedsUpdate]=useState(false);
  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({});
  const [phoneErrors, setPhoneErrors] = useState<Record<string, string>>({});
  const [phoneSavingId, setPhoneSavingId] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState("");
  const [celebrating, setCelebrating] = useState(false);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const saveNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (saveNoticeTimer.current) clearTimeout(saveNoticeTimer.current);
    },
    [],
  );
  const selectedPeopleMissingPhone = useMemo(
    () =>
      selectedPeople
        .map((id) => people.find((person) => person.id === id))
        .filter((person) => person && !person.phone),
    [people, selectedPeople],
  );
  const hikeDate = useMemo(() => dateInMexico(adventure.startsAt), [adventure.startsAt]);
  const freeChildCount = useMemo(
    () =>
      selectedPeople.filter((id) => {
        const person = people.find((item) => item.id === id);
        return person ? isFreeChildForDate(person, hikeDate) : false;
      }).length,
    [hikeDate, people, selectedPeople],
  );
  const billablePeopleCount = selectedPeople.length - freeChildCount;
  const adultCampingCount = campingPeople.filter((id) => {
    if (!selectedPeople.includes(id)) return false;
    const person = people.find((item) => item.id === id);
    return Boolean(person && !person.isMinor);
  }).length;
  const campingMinorCount = campingPeople.filter((id) => {
    if (!selectedPeople.includes(id)) return false;
    return Boolean(people.find((item) => item.id === id)?.isMinor);
  }).length;
  const hikeSubtotal = useMemo(
    () => calculateHikeSubtotal(adventure, billablePeopleCount, selectedDogs.length),
    [adventure, billablePeopleCount, selectedDogs.length],
  );
  const productsSubtotal = useMemo(
    () => products.reduce((sum,product)=>sum+(productQuantities[product.id]??0)*(product.priceCents/100),0),
    [products,productQuantities],
  );
  const selectedCamping = adventure.campingOptions.find(
    (option) => option.id === campingOptionId,
  );
  const campingSubtotal = selectedCamping
    ? selectedCamping.price *
      (selectedCamping.pricingMode === "PER_PERSON"
        ? adultCampingCount
        : 1)
    : 0;
  const total = useMemo(
    () => hikeSubtotal + (transport ? transportPeople.length * adventure.transportPrice : 0) + campingSubtotal + productsSubtotal,
    [hikeSubtotal, transport, transportPeople.length, adventure.transportPrice,campingSubtotal,productsSubtotal],
  );
  const availableCredit = creditBalanceCents / 100;
  const creditApplied = useCredit ? Math.min(availableCredit, hikeSubtotal) : 0;
  const payableTotal = Math.max(0, total - creditApplied);
  const spotsLeft = Math.max(0, adventure.spots);
  const capacityLabel =
    spotsLeft <= 3
      ? `Últimos ${spotsLeft} ${spotsLeft === 1 ? "lugar" : "lugares"}`
      : `${spotsLeft} lugares disponibles`;
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
  const togglePerson = (id: string) => {
    const person=people.find((item)=>item.id===id);
    if(selectedPeople.includes(id)){
      const hasSelectedMinor=people.some((item)=>item.isMinor&&item.guardianPersonId===id&&selectedPeople.includes(item.id));
      if(hasSelectedMinor){setSyncMessage("Primero quita al menor que tiene a esta persona como responsable.");return;}
      setSelectedPeople(selectedPeople.filter((item)=>item!==id));
      setTransportPeople((current)=>current.filter((item)=>item!==id));
      setCampingPeople((current)=>current.filter((item)=>item!==id));
      return;
    }
    const next=[...selectedPeople,id];
    if(person?.isMinor&&person.guardianPersonId&&!next.includes(person.guardianPersonId))next.push(person.guardianPersonId);
    setSelectedPeople(next);
    setSyncMessage(person?.isMinor&&person.guardianPersonId?"También seleccionamos a su persona adulta responsable.":"");
  };
  const toggleDog = (id: string) => {
    setDogChoiceMade(true);
    toggle(id, selectedDogs, setSelectedDogs);
  };
  const chooseNoDog = () => {
    setSelectedDogs([]);
    setDogChoiceMade(true);
    setDogNeedsUpdate(false);
  };
  const toggleCampingPerson = (id: string) => {
    const person = people.find((item) => item.id === id);
    if (campingPeople.includes(id)) {
      const hasCampingMinor = people.some(
        (item) =>
          item.isMinor &&
          item.guardianPersonId === id &&
          campingPeople.includes(item.id),
      );
      if (hasCampingMinor) {
        setSyncMessage(
          "Primero quita del camping al menor que tiene a esta persona como responsable.",
        );
        return;
      }
      setCampingPeople((current) => current.filter((item) => item !== id));
      return;
    }
    const next = [...campingPeople, id];
    if (
      person?.isMinor &&
      person.guardianPersonId &&
      !next.includes(person.guardianPersonId)
    )
      next.push(person.guardianPersonId);
    setCampingPeople(next);
    setSyncMessage(
      person?.isMinor && person.guardianPersonId
        ? "También incluimos en el camping a su persona adulta responsable."
        : "",
    );
  };
  const announceSaved = () => {
    setSaveNotice("Avance guardado en tu cuenta");
    setCelebrating(true);
    if (saveNoticeTimer.current) clearTimeout(saveNoticeTimer.current);
    saveNoticeTimer.current = setTimeout(() => {
      setSaveNotice("");
      setCelebrating(false);
    }, 2600);
  };
  const savePersonPhone = async (personId: string) => {
    const digits = (phoneDrafts[personId] ?? "").replace(/\D/g, "").slice(0, 10);
    if (digits.length !== 10) {
      setPhoneErrors((current) => ({
        ...current,
        [personId]: "Escribe los 10 dígitos del teléfono de México.",
      }));
      return;
    }

    setPhoneSavingId(personId);
    setPhoneErrors((current) => ({ ...current, [personId]: "" }));
    try {
      const response = await fetch(`/api/people/${personId}/phone`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });
      const payload = (await response.json()) as {
        phone?: string;
        error?: string;
      };
      if (!response.ok || !payload.phone)
        throw new Error(payload.error ?? "No pudimos guardar el teléfono.");

      setPeople((current) =>
        current.map((person) =>
          person.id === personId ? { ...person, phone: payload.phone! } : person,
        ),
      );
      setPhoneDrafts((current) => ({ ...current, [personId]: "" }));
    } catch (error) {
      setPhoneErrors((current) => ({
        ...current,
        [personId]:
          error instanceof Error
            ? error.message
            : "No pudimos guardar el teléfono.",
      }));
    } finally {
      setPhoneSavingId(null);
    }
  };
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
        campingOptionId,
        campingPersonIds: campingOptionId
          ? campingPeople.filter((id) => selectedPeople.includes(id))
          : [],
        productSelections: products.filter((product)=>(productQuantities[product.id]??0)>0).map((product)=>({productId:product.id,variant:productVariants[product.id]??"",quantity:productQuantities[product.id]})),
        currentStep: (hasCamping
          ? ['perritos','camping','transporte','productos','revision','responsiva','pago','confirmacion','confirmacion']
          : ['perritos','transporte','productos','revision','responsiva','pago','confirmacion','confirmacion'])[step] ?? 'personas',
      }),
    });
    const payload = (await response.json()) as {
      bookingId?: string;
      error?: string;
    };
    if (!response.ok || !payload.bookingId)
      throw new Error(payload.error ?? "No pudimos guardar tu reservación.");
    setBookingId(payload.bookingId);
    announceSaved();
    return payload.bookingId;
  };
  const next = async () => {
    if (!canContinue) {
      setSyncMessage(
        step === waiverStep
          ? "Firma la responsiva y activa la aceptación de los términos para continuar."
          : "Completa este paso antes de continuar.",
      );
      return;
    }
    setProcessing(true);
    setSyncMessage("");
    try {
      const savedBookingId = step === paymentStep ? bookingId : await persistDraft();
      if (step === paymentStep && context.mode === "live" && !savedBookingId)
        throw new Error("No encontramos tu borrador. Vuelve al paso anterior.");
      if (
        step === waiverStep &&
        context.mode === "live" &&
        savedBookingId &&
        signatureData &&
        !waiverSaved
      ) {
        const response = await fetch("/api/waivers/sign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            bookingId: savedBookingId,
            signatureData,
            accepted,
          }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
        };
        if (!response.ok || !payload.ok)
          throw new Error(payload.error ?? "No pudimos guardar la responsiva.");
        setWaiverSaved(true);
      }
      if (step === paymentStep && context.mode === "live") {
        if (payment === "card" || payableTotal === 0) {
          const response = await fetch("/api/checkout/stripe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ bookingId: savedBookingId, useCredit }),
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
        form.set("useCredit", String(useCredit));
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
        setStep(finalStep);
        return;
      }
      if (step === paymentStep)
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      setStep((current) => Math.min(finalStep, current + 1));
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
      ? selectedPeople.length > 0 &&
        selectedPeopleMissingPhone.length === 0 &&
        selectedPeople.every((id)=>{const person=people.find((item)=>item.id===id);return !person?.isMinor||Boolean(person.guardianPersonId&&selectedPeople.includes(person.guardianPersonId));})
      : step === 1
        ? dogChoiceMade
        : hasCamping && step === campingStep
          ? campingChoiceMade &&
            (!campingOptionId ||
              (campingPeople.length > 0 &&
                campingPeople.every((id) => selectedPeople.includes(id)) &&
                campingPeople.every((id) => {
                  const person = people.find((item) => item.id === id);
                  return (
                    !person?.isMinor ||
                    Boolean(
                      person.guardianPersonId &&
                        campingPeople.includes(person.guardianPersonId),
                    )
                  );
                })))
        : step === waiverStep
          ? Boolean(signatureData || waiverSaved) && accepted
          : step === paymentStep && context.mode === "live" && payment === "transfer"
            ? payableTotal === 0 || Boolean(bankTransfer && receiptFile)
            : step === paymentStep && context.mode === "live" && payment === "card"
              ? payableTotal === 0 || cardPaymentsEnabled
            : true;
  const continueLabel = processing
    ? "GUARDANDO…"
    : step === 0 && !canContinue
      ? selectedPeopleMissingPhone.length
        ? "REGISTRA LOS TELÉFONOS"
        : people.length
        ? "SELECCIONA UNA PERSONA"
        : "AGREGA UNA PERSONA"
      : step === 1 && !canContinue
        ? dogs.length
          ? "SELECCIONA UN PERRITO O ELIGE SIN PERRITO"
          : "AGREGA UN PERRITO O ELIGE SIN PERRITO"
        : hasCamping && step === campingStep && !canContinue
          ? campingOptionId
            ? "ELIGE QUIÉN SE QUEDA A CAMPING"
            : "ELIGE CAMPING O SIN CAMPING"
        : step === waiverStep && !canContinue
          ? signatureData || waiverSaved
            ? "ACTIVA HE LEÍDO Y ACEPTO"
            : "FIRMA PARA CONTINUAR"
          : step === paymentStep
            ? payableTotal === 0
              ? `USAR $${creditApplied.toLocaleString("es-MX")} DE CRÉDITO`
              : payment === "transfer" && !receiptFile
              ? "SUBE TU COMPROBANTE"
              : `PAGAR $${payableTotal.toLocaleString("es-MX")} MXN`
            : "CONTINUAR";
  const progress = `${Math.round((step / (steps.length - 1)) * 100)}%`;
  const goBack = () => {
    if (step <= paymentStep) setWaiverSaved(false);
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
      {step < finalStep && (
        <div className="wizard-desktop-dog-strip" aria-hidden="true">
          <div
            className={`wizard-dog-track ${celebrating ? "celebrating" : ""}`}
            style={{ "--wizard-progress": progress } as CSSProperties}
          >
            <span className="wizard-dog-path" />
            <img src="/brand/logo-circular-blue.png" alt="" />
          </div>
        </div>
      )}
      {step < finalStep && (
        <section
          className="wizard-mobile-status"
          aria-label={`Paso ${step + 1} de ${steps.length}: ${steps[step]}`}
        >
          <div className="wizard-mobile-heading">
            <span>PASO {step + 1} DE {steps.length}</span>
            <strong>{steps[step]}</strong>
          </div>
          <div className="wizard-mobile-total">
            <span>{adventure.title} · {capacityLabel}</span>
            <strong>${payableTotal.toLocaleString("es-MX")} MXN</strong>
          </div>
          <div
            className={`wizard-dog-track ${celebrating ? "celebrating" : ""}`}
            style={{ "--wizard-progress": progress } as CSSProperties}
            aria-hidden="true"
          >
            <span className="wizard-dog-path" />
            <img src="/brand/logo-circular-blue.png" alt="" />
          </div>
        </section>
      )}
      {saveNotice && (
        <div className="wizard-save-toast" role="status" aria-live="polite">
          <img src="/brand/logo-circular-blue.png" alt="" />
          <span>
            <strong>¡Todo va con la manada!</strong>
            {saveNotice}
          </span>
          <Check aria-hidden="true" />
        </div>
      )}

      {step < finalStep ? (
        <div className="wizard-layout">
          <section className="wizard-main wizard-step-enter" key={step}>
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
                          togglePerson(person.id)
                        }
                      >
                        <span className="profile-initials">
                          {person.initials}
                        </span>
                        <span>
                          <strong>{person.name}</strong>
                          <small>
                            {person.detail}
                            {isFreeChildForDate(person, hikeDate)
                              ? " · Menor de 5 años · Sin costo"
                              : ""}
                            {!person.phone ? " · Falta teléfono" : ""}
                          </small>
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
                {selectedPeopleMissingPhone.length > 0 && (
                  <div className="wizard-phone-required" role="alert">
                    <strong>NECESITAMOS UN TELÉFONO DE CONTACTO</strong>
                    <p>
                      Agrégalo aquí sin salir de tu compra. Para menores puedes
                      usar el número de su responsable.
                    </p>
                    <div>
                      {selectedPeopleMissingPhone.map((person) => {
                        if (!person) return null;
                        return (
                          <div
                            className="wizard-phone-person"
                            key={person.id}
                          >
                            <label htmlFor={`phone-${person.id}`}>
                              TELÉFONO DE {person.name.toUpperCase()}
                            </label>
                            <div>
                              <span aria-hidden="true">MX +52</span>
                              <input
                                id={`phone-${person.id}`}
                                type="tel"
                                inputMode="numeric"
                                autoComplete="tel-national"
                                placeholder="2220000000"
                                maxLength={10}
                                value={phoneDrafts[person.id] ?? ""}
                                onChange={(event) => {
                                  const value = event.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 10);
                                  setPhoneDrafts((current) => ({
                                    ...current,
                                    [person.id]: value,
                                  }));
                                  setPhoneErrors((current) => ({
                                    ...current,
                                    [person.id]: "",
                                  }));
                                }}
                              />
                              <button
                                type="button"
                                disabled={phoneSavingId === person.id}
                                onClick={() => savePersonPhone(person.id)}
                              >
                                {phoneSavingId === person.id
                                  ? "GUARDANDO…"
                                  : "GUARDAR"}
                              </button>
                            </div>
                            {phoneErrors[person.id] && (
                              <small role="status">
                                {phoneErrors[person.id]}
                              </small>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
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
                  Selecciona a los exploradores de cuatro patas o indícanos
                  que esta vez vienes sin perrito.
                </p>
                <div className="select-list">
                  <button
                    type="button"
                    aria-pressed={dogChoiceMade && selectedDogs.length === 0}
                    className={`select-card dog-select no-dog-select ${dogChoiceMade && selectedDogs.length === 0 ? "selected" : ""}`}
                    onClick={chooseNoDog}
                  >
                    <div className="no-dog-icon" aria-hidden="true">
                      <UserRound />
                    </div>
                    <span>
                      <strong>Sin perrito</strong>
                      <small>Esta aventura la hago sólo con humanos</small>
                    </span>
                    <i aria-hidden="true">
                      {dogChoiceMade && selectedDogs.length === 0 && <Check />}
                    </i>
                  </button>
                  {dogs.map((dog) => (
                    <button
                      type="button"
                      aria-pressed={selectedDogs.includes(dog.id)}
                      className={`select-card dog-select ${selectedDogs.includes(dog.id) ? "selected" : ""}`}
                      key={dog.id}
                      onClick={() => toggleDog(dog.id)}
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
                {!dogs.length && (
                  <p className="wizard-empty">
                    No tienes perritos registrados. Puedes continuar sin
                    perrito o agregar uno para futuras aventuras.
                  </p>
                )}
                {dogs.find((dog) => selectedDogs.includes(dog.id)) && (
                  <div className="unchanged-box">
                    <strong>
                      ¿Cambió algo que debamos saber sobre{" "}
                      {dogs.find((dog) => selectedDogs.includes(dog.id))?.name}?
                    </strong>
                    <label>
                      <input type="radio" checked={!dogNeedsUpdate} name="changed" onChange={()=>setDogNeedsUpdate(false)} /> No,
                      todo sigue igual
                    </label>
                    <label>
                      <input type="radio" checked={dogNeedsUpdate} name="changed" onChange={()=>setDogNeedsUpdate(true)} /> Sí, quiero
                      actualizar su perfil
                    </label>
                    {dogNeedsUpdate&&<button className="add-row" type="button" onClick={()=>window.location.assign(`/mi-manada?editDog=${dogs.find((dog)=>selectedDogs.includes(dog.id))?.id}&returnTo=${encodeURIComponent(`/reservar/${adventure.slug}`)}`)}>ACTUALIZAR PERFIL ANTES DE CONTINUAR <ArrowRight/></button>}
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
            {step === transportStep && (
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
            {hasCamping && step === campingStep && (
              <>
                <h1>
                  ¿La aventura
                  <br />
                  sigue bajo las estrellas?
                </h1>
                <p className="wizard-lead">
                  Elige si quieres agregar camping. Puedes venir sólo al hike
                  o quedarte con la manada en la opción que prefieras.
                </p>
                <div className="choice-grid camping-choice-grid">
                  <button
                    type="button"
                    aria-pressed={campingChoiceMade && !campingOptionId}
                    className={campingChoiceMade && !campingOptionId ? "selected" : ""}
                    onClick={() => {
                      setCampingOptionId(null);
                      setCampingPeople([]);
                      setCampingChoiceMade(true);
                    }}
                  >
                    <span className="camping-choice-icon">RUTA</span>
                    <strong>Sin camping</strong>
                    <small>Esta vez participamos sólo en el hike.</small>
                    <i aria-hidden="true">
                      {campingChoiceMade && !campingOptionId && <Check />}
                    </i>
                  </button>
                  {adventure.campingOptions.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      aria-pressed={campingOptionId === option.id}
                      className={campingOptionId === option.id ? "selected" : ""}
                      onClick={() => {
                        setCampingOptionId(option.id);
                        setCampingPeople((current) =>
                          current.length
                            ? current.filter((id) => selectedPeople.includes(id))
                            : [...selectedPeople],
                        );
                        setCampingChoiceMade(true);
                      }}
                    >
                      <TentTree aria-hidden="true" />
                      <strong>{option.name}</strong>
                      <small>{option.description || "Camping con la manada."}</small>
                      <b>
                        +${option.price.toLocaleString("es-MX")} MXN
                        {option.pricingMode === "PER_PERSON"
                          ? " por adulto · menores sin costo"
                          : " por reservación"}
                      </b>
                      <i aria-hidden="true">
                        {campingOptionId === option.id && <Check />}
                      </i>
                    </button>
                  ))}
                </div>
                {selectedCamping && (
                  <div className="camping-people">
                    <div>
                      <span>QUIÉN SE QUEDA</span>
                      <strong>Elige a las personas que harán camping</strong>
                      <p>
                        Los menores pueden quedarse sin costo y siempre deben
                        estar acompañados por su responsable.
                      </p>
                    </div>
                    {people
                      .filter((person) => selectedPeople.includes(person.id))
                      .map((person) => {
                        const selected = campingPeople.includes(person.id);
                        return (
                          <button
                            type="button"
                            key={person.id}
                            aria-pressed={selected}
                            className={selected ? "selected" : ""}
                            onClick={() => toggleCampingPerson(person.id)}
                          >
                            <span className="profile-initials">
                              {person.initials}
                            </span>
                            <span>
                              <strong>{person.name}</strong>
                              <small>
                                {person.isMinor
                                  ? "Menor · camping incluido sin costo"
                                  : selectedCamping.pricingMode === "PER_PERSON"
                                    ? `Adulto · +$${selectedCamping.price.toLocaleString("es-MX")}`
                                    : "Incluido en la reservación"}
                              </small>
                            </span>
                            <i aria-hidden="true">{selected && <Check />}</i>
                          </button>
                        );
                      })}
                    <p className="camping-price-note">
                      {adultCampingCount} adulto{adultCampingCount === 1 ? "" : "s"}
                      {campingMinorCount > 0
                        ? ` · ${campingMinorCount} menor${campingMinorCount === 1 ? "" : "es"} sin costo`
                        : ""}
                      {` · Camping $${campingSubtotal.toLocaleString("es-MX")}`}
                    </p>
                  </div>
                )}
              </>
            )}
            {step === productStep && (
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
            {step === reviewStep && (
              <>
                <h1>
                  Revisa tu
                  <br />
                  aventura.
                </h1>
                <p className="wizard-lead">
                  Confirma que todo esté correcto antes de firmar. Puedes editar
                  cualquier sección sin perder tu avance.
                </p>
                <div className="booking-review">
                  <article>
                    <div>
                      <span>PERSONAS</span>
                      <strong>
                        {selectedPeople
                          .map((id) => people.find((person) => person.id === id)?.name)
                          .filter(Boolean)
                          .join(" · ")}
                      </strong>
                      <small>
                        {billablePeopleCount} con costo
                        {freeChildCount > 0
                          ? ` · ${freeChildCount} menor${freeChildCount === 1 ? "" : "es"} de 5 sin costo`
                          : ""}
                      </small>
                    </div>
                    <button type="button" onClick={() => setStep(0)}>EDITAR</button>
                  </article>
                  <article>
                    <div>
                      <span>PERRITOS</span>
                      <strong>
                        {selectedDogs.length
                          ? selectedDogs
                              .map((id) => dogs.find((dog) => dog.id === id)?.name)
                              .filter(Boolean)
                              .join(" · ")
                          : "Esta vez vamos sin perrito"}
                      </strong>
                    </div>
                    <button type="button" onClick={() => setStep(1)}>EDITAR</button>
                  </article>
                  {hasCamping && (
                    <article>
                      <div>
                        <span>CAMPING</span>
                        <strong>{selectedCamping?.name ?? "Sin camping"}</strong>
                        {selectedCamping && (
                          <small>
                            {campingPeople
                              .map((id) => people.find((person) => person.id === id)?.name)
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        )}
                      </div>
                      <button type="button" onClick={() => setStep(campingStep)}>EDITAR</button>
                    </article>
                  )}
                  <article>
                    <div>
                      <span>TRASLADO</span>
                      <strong>
                        {transport
                          ? `${transportPeople.length} lugar${transportPeople.length === 1 ? "" : "es"} en transporte`
                          : "Llegamos por nuestra cuenta"}
                      </strong>
                    </div>
                    <button type="button" onClick={() => setStep(transportStep)}>EDITAR</button>
                  </article>
                  <article>
                    <div>
                      <span>PRODUCTOS</span>
                      <strong>
                        {Object.values(productQuantities).reduce((sum, quantity) => sum + quantity, 0)} artículo(s)
                      </strong>
                      <small>
                        {products
                          .filter((product) => (productQuantities[product.id] ?? 0) > 0)
                          .map((product) => `${productQuantities[product.id]} × ${product.name}`)
                          .join(" · ") || "Sin productos adicionales"}
                      </small>
                    </div>
                    <button type="button" onClick={() => setStep(productStep)}>EDITAR</button>
                  </article>
                  <article className="booking-review-total">
                    <div>
                      <span>TOTAL DE LA AVENTURA</span>
                      <strong>${payableTotal.toLocaleString("es-MX")} MXN</strong>
                      <small>{capacityLabel}</small>
                    </div>
                    <CircleCheck aria-hidden="true" />
                  </article>
                </div>
              </>
            )}
            {step === waiverStep && (
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
                    <strong>
                      He leído y acepto la responsiva y los{" "}
                      <Link
                        href="/terminos"
                        target="_blank"
                        onClick={(event) => event.stopPropagation()}
                      >
                        términos y condiciones
                      </Link>
                      .
                    </strong>
                    <small>{accepted?"Aceptado. Ya puedes continuar.":"Activa este control para poder continuar."}</small>
                  </span>
                </label>
              </>
            )}
            {step === paymentStep && (
              <>
                <h1>
                  Último paso.
                  <br />
                  Reserva tu lugar.
                </h1>
                <p className="wizard-lead">
                  Elige tu forma de pago. Cuando se confirme, tu lugar quedará
                  reservado y recibirás tu pase de aventura.
                </p>
                {paymentInterrupted && (
                  <div className="payment-recovery" role="status">
                    <strong>Tu pago no se completó, pero tu avance está a salvo.</strong>
                    <p>
                      Puedes intentarlo nuevamente aquí. No crearemos otra
                      reservación ni perderás las selecciones que ya hiciste.
                    </p>
                  </div>
                )}
                {creditBalanceCents > 0 && (
                  <label className="booking-credit-option">
                    <input type="checkbox" role="switch" checked={useCredit} onChange={(event) => setUseCredit(event.target.checked)} />
                    <span className="booking-credit-toggle"><i>{useCredit && <Check />}</i></span>
                    <span><strong>USAR CRÉDITO DE MI MANADA</strong><small>Tienes ${availableCredit.toLocaleString("es-MX")} disponibles. Aplicaremos hasta ${creditApplied.toLocaleString("es-MX")} a este hike.</small></span>
                  </label>
                )}
                {payableTotal > 0 && <div className="payment-tabs">
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
                </div>}
                {payableTotal > 0 && !cardPaymentsEnabled && !bankTransfer && (
                  <p className="payment-unavailable" role="alert">
                    Los pagos están temporalmente deshabilitados. La reservación puede guardarse como borrador, pero no se cobrará hasta que el administrador configure un método real.
                  </p>
                )}
                {payableTotal === 0 ? (
                  <div className="credit-covers-total">
                    <WalletCards />
                    <strong>Tu crédito cubre esta aventura</strong>
                    <p>No necesitas tarjeta ni transferencia. Al continuar confirmaremos tu lugar y descontaremos el crédito.</p>
                  </div>
                ) : payment === "card" ? (
                  <div className="stripe-checkout-box">
                    <div>TDG</div>
                    <span>TARJETA · PAGO SEGURO</span>
                    <strong>Paga de forma fácil y segura</strong>
                    <p>
                      Te llevaremos a Stripe para completar el pago. Si tu
                      dispositivo es compatible, también podrás usar Apple Pay
                      o Google Pay. The Doggy Gang no recibe ni almacena los
                      datos de tu tarjeta.
                    </p>
                    <small>PAGO CIFRADO · CONFIRMACIÓN AUTOMÁTICA</small>
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
              <p className="wizard-inline-error" role="alert">
                {syncMessage}
              </p>
            )}
            <div className="wizard-actions">
              <button
                type="button"
                className="wizard-mobile-summary-toggle"
                aria-expanded={mobileSummaryOpen}
                onClick={() => setMobileSummaryOpen((current) => !current)}
              >
                <span>
                  <small>TOTAL A PAGAR</small>
                  <strong>${payableTotal.toLocaleString("es-MX")} MXN</strong>
                </span>
                <b>{mobileSummaryOpen ? "OCULTAR DETALLE" : "VER DETALLE"}</b>
              </button>
              {mobileSummaryOpen && (
                <dl className="wizard-mobile-breakdown">
                  <div><dt>Hike</dt><dd>${hikeSubtotal.toLocaleString("es-MX")}</dd></div>
                  {transport && <div><dt>Transporte</dt><dd>${(transportPeople.length * adventure.transportPrice).toLocaleString("es-MX")}</dd></div>}
                  {selectedCamping && <div><dt>Camping</dt><dd>${campingSubtotal.toLocaleString("es-MX")}</dd></div>}
                  {productsSubtotal > 0 && <div><dt>Productos</dt><dd>${productsSubtotal.toLocaleString("es-MX")}</dd></div>}
                  {creditApplied > 0 && <div><dt>Crédito</dt><dd>−${creditApplied.toLocaleString("es-MX")}</dd></div>}
                </dl>
              )}
              <div className="wizard-action-row">
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
                  {continueLabel}
                </button>
              </div>
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
                <br />
                <strong>{capacityLabel}</strong>
              </p>
            </div>
            <dl>
              <div>
                <dt>Personas</dt>
                <dd>{selectedPeople.length}</dd>
              </div>
              {freeChildCount > 0 && (
                <div>
                  <dt>Menores de 5 años</dt>
                  <dd>{freeChildCount} · Sin costo</dd>
                </div>
              )}
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
              {selectedCamping && (
                <div>
                  <dt>Camping · {selectedCamping.name}</dt>
                  <dd>${campingSubtotal.toLocaleString("es-MX")}</dd>
                </div>
              )}
              {productsSubtotal > 0 && (
                <div>
                  <dt>Productos</dt>
                  <dd>${productsSubtotal.toLocaleString("es-MX")}</dd>
                </div>
              )}
              {creditApplied > 0 && (
                <div className="summary-credit">
                  <dt>Crédito de tu manada</dt>
                  <dd>−${creditApplied.toLocaleString("es-MX")}</dd>
                </div>
              )}
              <div className="summary-total">
                <dt>{creditApplied > 0 ? "TOTAL A PAGAR" : "TOTAL"}</dt>
                <dd>
                  ${payableTotal.toLocaleString("es-MX")} <small>MXN</small>
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
          campingName={selectedCamping?.name ?? null}
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
  campingName,
  total,
}: {
  adventure: Adventure;
  peopleCount: number;
  dogCount: number;
  transport: boolean;
  campingName: string | null;
  total: number;
}) {
  const token = "tdg:checkin:7f9f5c2e-74bc-4f89-a310-86b4109d9d25";
  return (
    <section className="confirmation">
      <div className="motion-burst" aria-hidden="true">{Array.from({length: 10}, (_, index) => <i key={index} />)}</div>
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
            {campingName && (
              <div>
                <dt>Camping</dt>
                <dd>{campingName}</dd>
              </div>
            )}
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
      <div className="motion-burst" aria-hidden="true">{Array.from({length: 10}, (_, index) => <i key={index} />)}</div>
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

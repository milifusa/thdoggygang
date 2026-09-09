import Link from "next/link";
import { SiteHeader } from "../components/SiteHeader";

export const metadata = { title: "Términos y condiciones | The Doggy Gang" };

export default function TermsPage() {
  return <><SiteHeader/><main className="legal-page"><p className="eyebrow">INFORMACIÓN LEGAL</p><h1>Términos y condiciones.</h1><section><p>Al reservar una aventura confirmas que la información de las personas y perritos participantes es correcta, que leíste las condiciones particulares del hike y que atenderás las indicaciones del equipo.</p><h2>Reservaciones y pagos</h2><p>El lugar queda confirmado únicamente cuando el pago ha sido validado. Cada hike puede tener precios, reglas, inclusiones y políticas de cancelación diferentes; las condiciones visibles en su página forman parte de la reservación.</p><h2>Seguridad y convivencia</h2><p>La participación está sujeta a la responsiva vigente, al estado de salud declarado y a las reglas de la manada. The Doggy Gang puede negar la participación cuando exista un riesgo para asistentes, perritos o entorno.</p><h2>Cancelaciones</h2><p>Se aplica la política indicada en el hike comprado. Si una ruta cambia por clima o seguridad, el equipo comunicará las opciones disponibles.</p></section><Link href="/">VOLVER AL INICIO</Link></main></>;
}

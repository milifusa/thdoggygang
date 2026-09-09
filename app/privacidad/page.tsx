import Link from "next/link";
import { SiteHeader } from "../components/SiteHeader";

export const metadata = { title: "Aviso de privacidad | The Doggy Gang" };

export default function PrivacyPage() {
  return <><SiteHeader/><main className="legal-page"><p className="eyebrow">PRIVACIDAD</p><h1>Aviso de privacidad.</h1><section><p>The Doggy Gang utiliza los datos de contacto, participantes, perritos, salud, emergencia, reservaciones, pagos y responsivas exclusivamente para administrar las experiencias contratadas y mantener segura a la manada.</p><h2>Datos y documentos</h2><p>Las responsivas, comprobantes y fotografías originales se almacenan con acceso controlado. El equipo autorizado sólo accede a la información necesaria para operar cada hike.</p><h2>Comunicaciones</h2><p>Podemos enviarte accesos, confirmaciones, recordatorios operativos y avisos relacionados con tus reservaciones. No vendemos tus datos.</p><h2>Tus derechos</h2><p>Puedes solicitar acceso, corrección o eliminación de información que no deba conservarse por obligaciones operativas o legales escribiendo a hola@thedoggygang.com.</p></section><Link href="/">VOLVER AL INICIO</Link></main></>;
}

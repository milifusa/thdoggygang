import Link from "next/link";
import { SiteHeader } from "../components/SiteHeader";
import { getLegalContent } from "../lib/legal-content";

export const metadata = { title: "Aviso de privacidad | The Doggy Gang" };

export default async function PrivacyPage() {const content=await getLegalContent("privacy");return <><SiteHeader/><main className="legal-page"><p className="eyebrow">{content.eyebrow}</p><h1>{content.title}</h1><section><p>{content.intro}</p>{content.sections.map((section)=><div key={section.title}><h2>{section.title}</h2><p>{section.body}</p></div>)}</section><Link href="/">VOLVER AL INICIO</Link></main></>;
}

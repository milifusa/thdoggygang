import Link from "next/link";
import { SiteHeader } from "../components/SiteHeader";
import { getLegalContent } from "../lib/legal-content";

export const metadata = { title: "Términos y condiciones | The Doggy Gang" };

export default async function TermsPage() {const content=await getLegalContent("terms");return <><SiteHeader/><main className="legal-page"><p className="eyebrow">{content.eyebrow}</p><h1>{content.title}</h1><section><p>{content.intro}</p>{content.sections.map((section)=><div key={section.title}><h2>{section.title}</h2><p>{section.body}</p></div>)}</section><Link href="/">VOLVER AL INICIO</Link></main></>;
}

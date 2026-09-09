import { z } from "zod";
import { adminClient } from "../hikes/route";

const short = z.string().min(1).max(240);
const paragraph = z.string().min(1).max(1500);
const schema = z.object({
  heroEyebrow: short,
  heroTitle: short,
  heroAccent: short,
  heroIntro: paragraph,
  heroButton: short,
  introEyebrow: short,
  introTitle: short,
  introAccent: short,
  introBody: paragraph,
  introLink: short,
  adventuresEyebrow: short,
  adventuresTitle: short,
  adventuresBody: paragraph,
  adventuresButton: short,
  howEyebrow: short,
  howTitle: short,
  howSteps: z.array(z.object({ title: short, body: paragraph })).length(3),
  instagramEyebrow: short,
  instagramTitle: short,
  instagramBody: paragraph,
  instagramCta: short,
  instagramUrl: z.string().min(1).max(500),
  instagramEmbeds: z.array(z.string().min(1).max(500)).length(3),
  quote: paragraph,
  quoteAttribution: short,
  footerText: paragraph,
  footerInstagramUrl: z.string().min(1).max(500),
  footerWhatsappUrl: z.string().max(500),
  footerTermsUrl: z.string().min(1).max(500),
});

export async function PATCH(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      {
        error: "Revisa los textos y enlaces del landing.",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { error } = await supabase.from("site_content").upsert(
    {
      id: "landing",
      content: parsed.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  return error
    ? Response.json({ error: error.message }, { status: 400 })
    : Response.json({ ok: true });
}

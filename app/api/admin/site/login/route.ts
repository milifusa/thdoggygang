import { z } from "zod";
import { adminClient } from "../../hikes/route";

const schema = z.object({
  quote: z.string().max(300),
  quoteVisible: z.boolean(),
  eyebrow: z.string().min(1).max(120),
  title: z.string().min(1).max(240),
  description: z.string().min(1).max(600),
  emailTab: z.string().min(1).max(40),
  phoneTab: z.string().min(1).max(40),
  emailLabel: z.string().min(1).max(80),
  emailPlaceholder: z.string().min(1).max(120),
  emailCta: z.string().min(1).max(80),
  phoneLabel: z.string().min(1).max(80),
  phonePlaceholder: z.string().min(1).max(30),
  phoneCta: z.string().min(1).max(80),
  codeLabel: z.string().min(1).max(80),
  verifyCta: z.string().min(1).max(80),
  legalText: z.string().max(300),
  termsLabel: z.string().max(100),
  termsUrl: z.string().max(500),
  privacyLabel: z.string().max(100),
  privacyUrl: z.string().max(500),
  imagePosition: z.enum(["center", "top", "bottom", "left", "right"]),
});
export async function PATCH(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Revisa los campos de la página de ingreso." },
      { status: 400 },
    );
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { error } = await supabase
    .from("site_content")
    .upsert(
      {
        id: "login",
        content: parsed.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  return error
    ? Response.json({ error: error.message }, { status: 400 })
    : Response.json({ ok: true });
}

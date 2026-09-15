import {
  EMAIL_TEMPLATE_DEFINITIONS,
  emailAssetUrl,
  type EmailTemplateKey,
  type EmailTemplateValue,
} from "../email-template-config";
import { createSupabaseServiceClient } from "../supabase/service";

export function escapeEmailHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderEmailVariables(
  value: string,
  variables: Record<string, string>,
) {
  return Object.entries(variables).reduce(
    (result, [key, replacement]) => result.replaceAll(`{${key}}`, replacement),
    value,
  );
}

export async function getEmailTemplate(
  key: EmailTemplateKey,
): Promise<EmailTemplateValue> {
  const fallback = EMAIL_TEMPLATE_DEFINITIONS[key];
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("email_templates")
    .select("key,subject,eyebrow,heading,body,button_label,image_path,active")
    .eq("key", key)
    .maybeSingle();
  return {
    key,
    subject: data?.subject || fallback.subject,
    eyebrow: data?.eyebrow || fallback.eyebrow,
    heading: data?.heading || fallback.heading,
    body: data?.body || fallback.body,
    buttonLabel: data?.button_label || fallback.buttonLabel,
    imagePath: data?.image_path ?? null,
    imageUrl: emailAssetUrl(data?.image_path) || fallback.imageUrl,
    active: data?.active ?? true,
  };
}

export function renderBrandedEmail({
  template,
  variables,
  actionUrl,
  detailLines = [],
  note = "El enlace vence pronto y sólo se puede usar una vez.",
}: {
  template: EmailTemplateValue;
  variables: Record<string, string>;
  actionUrl: string;
  detailLines?: string[];
  note?: string;
}) {
  const subject = renderEmailVariables(template.subject, variables);
  const eyebrow = renderEmailVariables(template.eyebrow, variables);
  const heading = renderEmailVariables(template.heading, variables);
  const body = renderEmailVariables(template.body, variables);
  const button = renderEmailVariables(template.buttonLabel, variables);
  const details = detailLines.length
    ? `<p style="font-size:15px;line-height:1.65;color:#423b36;margin:0 0 24px">${detailLines
        .map((line) => escapeEmailHtml(line))
        .join("<br>")}</p>`
    : "";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#dea066;font-family:Arial,sans-serif;color:#261e18"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#dea066;padding:28px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:18px;overflow:hidden"><tr><td><img src="${escapeEmailHtml(template.imageUrl)}" width="600" alt="The Doggy Gang" style="display:block;width:100%;height:250px;object-fit:cover"></td></tr><tr><td style="padding:36px 38px 16px"><img src="https://www.thedoggygang.com/brand/logo-horizontal-blue.png" width="210" alt="The Doggy Gang" style="display:block;width:210px;max-width:100%;height:auto"><p style="margin:32px 0 8px;font-size:11px;font-weight:800;letter-spacing:2px;color:#bf6b33">${escapeEmailHtml(eyebrow)}</p><h1 style="font-family:'Trebuchet MS',Arial,sans-serif;font-size:38px;font-weight:800;line-height:1.05;margin:0 0 18px">${escapeEmailHtml(heading)}</h1><p style="font-size:16px;line-height:1.65;color:#555;margin:0 0 22px">${escapeEmailHtml(body).replaceAll("\n", "<br>")}</p>${details}<a href="${escapeEmailHtml(actionUrl)}" style="display:inline-block;background:#fdc06e;color:#261e18;text-decoration:none;padding:16px 24px;border-radius:9px;font-size:13px;font-weight:900;letter-spacing:.7px">${escapeEmailHtml(button)}</a><p style="font-size:12px;line-height:1.6;color:#777;margin:28px 0 0">${escapeEmailHtml(note)}</p></td></tr><tr><td style="padding:22px 38px 34px;font-size:11px;color:#888">The Doggy Gang · Puebla, México</td></tr></table></td></tr></table></body></html>`;
  return { subject, html };
}

export async function sendBrandedEmail({
  key,
  to,
  variables,
  actionUrl,
  detailLines,
  note,
}: {
  key: EmailTemplateKey;
  to: string;
  variables: Record<string, string>;
  actionUrl: string;
  detailLines?: string[];
  note?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Resend no está configurado.");
  const template = await getEmailTemplate(key);
  if (!template.active) throw new Error("La plantilla de correo está desactivada.");
  const rendered = renderBrandedEmail({
    template,
    variables,
    actionUrl,
    detailLines,
    note,
  });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from:
        process.env.RESEND_FROM_EMAIL ||
        "The Doggy Gang <hola@thedoggygang.com>",
      to: [to],
      subject: rendered.subject,
      html: rendered.html,
    }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  if (!response.ok)
    throw new Error(result.message ?? "Resend no pudo enviar el correo.");
  return { id: result.id ?? null };
}

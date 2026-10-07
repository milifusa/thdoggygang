import { requireStaffSession } from "../../lib/auth/guards";
import {
  EMAIL_TEMPLATE_DEFINITIONS,
  EMAIL_TEMPLATE_KEYS,
  emailAssetUrl,
  type EmailTemplateValue,
} from "../../lib/email-template-config";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { EmailDeliveryHistory } from "./email-delivery-history";
import { EmailTemplateManager } from "./email-template-manager";

export const dynamic = "force-dynamic";

export default async function EmailsAdminPage() {
  await requireStaffSession("/admin/emails");
  const supabase = await createSupabaseServerClient();
  const [{ data: rows }, { data: next }, { data: deliveries }] =
    await Promise.all([
      supabase
        .from("email_templates")
        .select(
          "key,subject,eyebrow,heading,body,button_label,image_path,active",
        )
        .in("key", [...EMAIL_TEMPLATE_KEYS]),
      supabase
        .from("hikes")
        .select("id")
        .gte("starts_at", new Date().toISOString())
        .is("deleted_at", null)
        .order("starts_at")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("email_deliveries")
        .select(
          "id,template_key,recipient,subject,status,source,error_message,sent_at,delivered_at,opened_at,clicked_at,bounced_at,created_at,booking:bookings(booking_number)",
        )
        .order("created_at", { ascending: false })
        .limit(250),
    ]);
  const byKey = new Map((rows ?? []).map((row) => [row.key, row]));
  const templates: EmailTemplateValue[] = EMAIL_TEMPLATE_KEYS.map((key) => {
    const row = byKey.get(key);
    const fallback = EMAIL_TEMPLATE_DEFINITIONS[key];
    return {
      key,
      subject: row?.subject || fallback.subject,
      eyebrow: row?.eyebrow || fallback.eyebrow,
      heading: row?.heading || fallback.heading,
      body: row?.body || fallback.body,
      buttonLabel: row?.button_label || fallback.buttonLabel,
      imagePath: row?.image_path ?? null,
      imageUrl: emailAssetUrl(row?.image_path) || fallback.imageUrl,
      active: row?.active ?? true,
    };
  });
  return (
    <main className="admin-page">
      <AdminNav active="/admin/emails" hikeId={next?.id} />
      <section className="admin-content email-admin-content">
        <AdminMobileNav />
        <header>
          <div>
            <p>COMUNICACIÓN CON LA MANADA</p>
            <h1>Emails.</h1>
            <span>Edita el contenido y la fotografía de cada correo.</span>
          </div>
        </header>
        <EmailTemplateManager initialTemplates={templates} />
        <EmailDeliveryHistory
          initialDeliveries={(deliveries ?? []).map((delivery) => ({
            ...delivery,
            booking: Array.isArray(delivery.booking)
              ? (delivery.booking[0] ?? null)
              : delivery.booking,
          }))}
        />
      </section>
    </main>
  );
}

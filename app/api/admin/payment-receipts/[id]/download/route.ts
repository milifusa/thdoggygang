import { z } from "zod";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Comprobante inválido." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile?.active || profile.role !== "ADMIN")
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { data: receipt } = await supabase
    .from("payment_receipts")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (!receipt)
    return Response.json(
      { error: "No encontramos el comprobante." },
      { status: 404 },
    );
  const { data, error } = await supabase.storage
    .from("payment-receipts")
    .createSignedUrl(receipt.storage_path, 60, { download: true });
  if (error || !data?.signedUrl)
    return Response.json(
      { error: "No pudimos abrir el comprobante." },
      { status: 500 },
    );
  return Response.redirect(data.signedUrl);
}

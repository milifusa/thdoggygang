import { isSupabaseConfigured } from "../lib/config";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { getLoginSettings } from "../lib/login-content";
import { LoginForm } from "./login-form";
import { destinationForRole, safeReturnPath } from "../lib/auth/destination";

export const metadata = { title: "Entra a tu manada | The Doggy Gang" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role,active")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (profile?.active)
        redirect(destinationForRole(profile.role, safeReturnPath(params.next)));
    }
  }
  const nextPath = safeReturnPath(params.next) ?? "/mi-manada";
  const initialMessage =
    params.error === "expired"
      ? "Este enlace ya venció o fue utilizado. Pide uno nuevo para entrar."
      : params.error === "inactive"
        ? "Este acceso está desactivado. Contacta al equipo de The Doggy Gang."
        : "";
  const settings = await getLoginSettings();
  return (
    <LoginForm
      configured={isSupabaseConfigured()}
      nextPath={nextPath}
      initialMessage={initialMessage}
      content={settings.content}
      desktopImage={settings.desktopImage}
      mobileImage={settings.mobileImage}
    />
  );
}

import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  destinationForRole,
  safeReturnPath,
} from "../../../lib/auth/destination";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

const allowedTypes = new Set<EmailOtpType>([
  "email",
  "invite",
  "recovery",
  "magiclink",
]);

export async function POST(request: Request) {
  const url = new URL(request.url);
  const data = await request.formData();
  const tokenHash = String(data.get("token_hash") ?? "").trim();
  const rawType = String(data.get("type") ?? "") as EmailOtpType;
  const next = safeReturnPath(String(data.get("next") ?? ""));

  if (!tokenHash || !allowedTypes.has(rawType)) {
    return NextResponse.redirect(
      new URL(
        `/ingresar?error=expired&next=${encodeURIComponent(next ?? "/mi-manada")}`,
        url.origin,
      ),
      303,
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType,
    });
    if (error) throw error;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: profile } = user
      ? await supabase
          .from("profiles")
          .select("role,active")
          .eq("auth_user_id", user.id)
          .maybeSingle()
      : { data: null };
    if (!profile?.active) throw new Error("Inactive account");
    return NextResponse.redirect(
      new URL(destinationForRole(profile.role, next), url.origin),
      303,
    );
  } catch {
    return NextResponse.redirect(
      new URL(
        `/ingresar?error=expired&next=${encodeURIComponent(next ?? "/mi-manada")}`,
        url.origin,
      ),
      303,
    );
  }
}

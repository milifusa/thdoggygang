"use client";

import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  mexicoNationalDigits,
  normalizeMexicoPhone,
} from "../lib/mexico-phone";
import { createSupabaseBrowserClient } from "../lib/supabase/client";
import type { LoginContent } from "../lib/login-content";

export function LoginForm({
  configured,
  nextPath,
  initialMessage = "",
  content,
  desktopImage,
  mobileImage,
}: {
  configured: boolean;
  nextPath: string;
  initialMessage?: string;
  content: LoginContent;
  desktopImage: string;
  mobileImage: string;
}) {
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [value, setValue] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(
      () => setCooldown((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const changeMethod = (nextMethod: "email" | "phone") => {
    setMethod(nextMethod);
    setSent(false);
    setCode("");
    setMessage("");
    setCooldown(0);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      if (!configured)
        throw new Error("Supabase environment variables are not configured.");
      const supabase = createSupabaseBrowserClient();
      if (method === "email") {
        const { error } = await supabase.auth.signInWithOtp({
          email: value.trim().toLowerCase(),
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
          },
        });
        if (error) throw error;
        setSent(true);
        setCooldown(60);
        setMessage(
          "Te enviamos un enlace de acceso. Ábrelo desde tu correo; funciona incluso si usas otro navegador.",
        );
      } else {
        const phone = normalizeMexicoPhone(phoneDigits);
        if (!phone) throw new Error("El teléfono debe tener 10 dígitos.");
        if (!sent) {
          const { error } = await supabase.auth.signInWithOtp({ phone });
          if (error) throw error;
          setSent(true);
          setCooldown(60);
          setMessage("Te enviamos un código por SMS.");
        } else {
          const { error } = await supabase.auth.verifyOtp({
            phone,
            token: code,
            type: "sms",
          });
          if (error) throw error;
          window.location.assign(nextPath);
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message.toLowerCase() : "";
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code).toLowerCase()
          : "";
      if (detail.includes("environment"))
        setMessage(
          "El acceso todavía no está configurado. Contacta al equipo de The Doggy Gang.",
        );
      else if (
        code.includes("over_email_send_rate_limit") ||
        detail.includes("email rate limit")
      )
        setMessage(
          "El servicio de correo alcanzó su límite temporal. Intenta nuevamente en una hora.",
        );
      else if (detail.includes("rate") || detail.includes("security"))
        setMessage("Espera 60 segundos antes de pedir otro acceso.");
      else if (
        detail.includes("phone provider") ||
        detail.includes("phone signups")
      )
        setMessage(
          "El acceso por teléfono todavía no está disponible. Usa tu correo mientras lo activamos.",
        );
      else if (detail.includes("10 dígitos"))
        setMessage("Escribe los 10 dígitos de tu teléfono de México.");
      else
        setMessage(
          method === "email"
            ? "No pudimos enviar el enlace. Revisa tu correo e intenta de nuevo."
            : "No pudimos validar el teléfono o el código. Revisa los datos e intenta de nuevo.",
        );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      className="login-page"
      style={
        {
          "--login-desktop-image": `url(${desktopImage})`,
          "--login-mobile-image": `url(${mobileImage})`,
          "--login-position": content.imagePosition,
        } as CSSProperties
      }
    >
      <section className="login-photo">
        <Link className="wordmark" href="/">
          THE DOGGY <span>GANG</span>
        </Link>
        <div>
          {content.quoteVisible && <p>“{content.quote}”</p>}
          <span>THE DOGGY GANG</span>
        </div>
      </section>
      <section className="login-panel">
        <div>
          <p className="eyebrow">{content.eyebrow}</p>
          <h1>{content.title}</h1>
          <p>{content.description}</p>
          <div className="login-tabs">
            <button
              type="button"
              onClick={() => changeMethod("email")}
              className={method === "email" ? "active" : ""}
            >
              {content.emailTab}
            </button>
            <button
              type="button"
              onClick={() => changeMethod("phone")}
              className={method === "phone" ? "active" : ""}
            >
              {content.phoneTab}
            </button>
          </div>
          <form onSubmit={submit}>
            {method === "email" ? (
              <label>
                {content.emailLabel}
                <input
                  required
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder={content.emailPlaceholder}
                />
              </label>
            ) : (
              <label>
                {content.phoneLabel}
                <span className="mexico-phone">
                  <b>MX +52</b>
                  <input
                    required
                    value={phoneDigits}
                    onChange={(event) =>
                      setPhoneDigits(mexicoNationalDigits(event.target.value))
                    }
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    pattern="[0-9]{10}"
                    minLength={10}
                    maxLength={10}
                    placeholder={content.phonePlaceholder}
                  />
                </span>
                <small>10 dígitos · sólo teléfonos de México</small>
              </label>
            )}
            {method === "phone" && sent && (
              <label>
                {content.codeLabel}
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="000000"
                />
              </label>
            )}
            <button
              className="button button-primary"
              disabled={
                submitting || (cooldown > 0 && (method === "email" || !sent))
              }
              type="submit"
            >
              {submitting
                ? "ENVIANDO…"
                : cooldown > 0 && (method === "email" || !sent)
                  ? `REENVIAR EN ${cooldown}s`
                  : method === "phone" && sent
                    ? `${content.verifyCta} →`
                    : `${method === "email" ? content.emailCta : content.phoneCta} →`}
            </button>
          </form>
          {message && (
            <p className="login-message" role="status">
              {message}
            </p>
          )}
          <small>
            {content.legalText}{" "}
            <Link href={content.termsUrl}>{content.termsLabel}</Link> y{" "}
            <Link href={content.privacyUrl}>{content.privacyLabel}</Link>.
          </small>
        </div>
      </section>
    </main>
  );
}

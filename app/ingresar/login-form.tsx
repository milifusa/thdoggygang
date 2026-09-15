"use client";

import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
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
  const [value, setValue] = useState("");
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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      if (!configured)
        throw new Error("Supabase environment variables are not configured.");
      const response = await fetch("/api/auth/email-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: value.trim().toLowerCase(),
          next: nextPath,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw Object.assign(
          new Error(result.error ?? "No pudimos enviar el enlace."),
          { code: response.status === 429 ? "rate_limit" : "email_send" },
        );
      setCooldown(60);
      setMessage(
        "Te enviamos un enlace de acceso. Ábrelo desde tu correo; funciona incluso si usas otro navegador.",
      );
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
      else
        setMessage("No pudimos enviar el enlace. Revisa tu correo e intenta de nuevo.");
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
          <form onSubmit={submit}>
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
            <button
              className="button button-primary"
              disabled={submitting || cooldown > 0}
              type="submit"
            >
              {submitting
                ? "ENVIANDO…"
                : cooldown > 0
                  ? `REENVIAR EN ${cooldown}s`
                  : `${content.emailCta} →`}
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

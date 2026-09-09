import "server-only";
import { createSupabaseServiceClient } from "./supabase/service";
import { decryptSecret } from "./security/secret";
import type { BankTransferConfig } from "./payment-types";

type StoredPaymentSettings = {
  bank_enabled: boolean;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_clabe: string | null;
  bank_reference_prefix: string | null;
  stripe_enabled: boolean;
  stripe_publishable_key: string | null;
  stripe_secret_ciphertext: string | null;
  stripe_webhook_ciphertext: string | null;
};

async function storedSettings(): Promise<StoredPaymentSettings | null> {
  try {
    const { data, error } = await createSupabaseServiceClient()
      .from("payment_settings")
      .select(
        "bank_enabled,bank_name,bank_account_name,bank_clabe,bank_reference_prefix,stripe_enabled,stripe_publishable_key,stripe_secret_ciphertext,stripe_webhook_ciphertext",
      )
      .eq("id", 1)
      .maybeSingle();
    return error ? null : data;
  } catch {
    return null;
  }
}

function environmentBankConfig(): BankTransferConfig | null {
  const bankName = process.env.BANK_NAME?.trim();
  const accountName = process.env.BANK_ACCOUNT_NAME?.trim();
  const clabe = process.env.BANK_CLABE?.replace(/\s/g, "");
  const referencePrefix = process.env.BANK_REFERENCE_PREFIX?.trim() || "TDG";
  return bankName && accountName && clabe && /^\d{18}$/.test(clabe)
    ? { bankName, accountName, clabe, referencePrefix }
    : null;
}

export async function getBankTransferConfig(): Promise<BankTransferConfig | null> {
  const stored = await storedSettings();
  if (stored) {
    return stored.bank_enabled &&
      stored.bank_name &&
      stored.bank_account_name &&
      stored.bank_clabe &&
      /^\d{18}$/.test(stored.bank_clabe)
      ? {
          bankName: stored.bank_name,
          accountName: stored.bank_account_name,
          clabe: stored.bank_clabe,
          referencePrefix: stored.bank_reference_prefix || "TDG",
        }
      : null;
  }
  return environmentBankConfig();
}

export async function getStripeSecretKey() {
  const stored = await storedSettings();
  if (stored) {
    if (!stored.stripe_enabled) return null;
    if (stored.stripe_secret_ciphertext)
      return decryptSecret(stored.stripe_secret_ciphertext).catch(() => null);
  }
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

export async function getStripeWebhookSecret() {
  const stored = await storedSettings();
  if (stored) {
    if (!stored.stripe_enabled) return null;
    if (stored.stripe_webhook_ciphertext)
      return decryptSecret(stored.stripe_webhook_ciphertext).catch(() => null);
  }
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export async function getPaymentSettingsForAdmin() {
  const stored = await storedSettings();
  const environmentBank = environmentBankConfig();
  return {
    bankEnabled: stored ? stored.bank_enabled : Boolean(environmentBank),
    bankName: stored?.bank_name ?? environmentBank?.bankName ?? "",
    accountName:
      stored?.bank_account_name ?? environmentBank?.accountName ?? "",
    clabe: stored?.bank_clabe ?? environmentBank?.clabe ?? "",
    referencePrefix:
      stored?.bank_reference_prefix ??
      environmentBank?.referencePrefix ??
      "TDG",
    stripeEnabled: stored
      ? stored.stripe_enabled
      : Boolean(process.env.STRIPE_SECRET_KEY),
    stripePublishableKey:
      stored?.stripe_publishable_key ??
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
      "",
    hasStripeSecret: Boolean(
      stored?.stripe_secret_ciphertext || process.env.STRIPE_SECRET_KEY,
    ),
    hasStripeWebhookSecret: Boolean(
      stored?.stripe_webhook_ciphertext || process.env.STRIPE_WEBHOOK_SECRET,
    ),
  };
}

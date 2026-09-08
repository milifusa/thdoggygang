export function mexicoNationalDigits(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('52') && digits.length === 12) return digits.slice(2);
  return digits.slice(0, 10);
}

export function normalizeMexicoPhone(value: string) {
  const national = mexicoNationalDigits(value);
  return national.length === 10 ? `+52${national}` : null;
}


export function mexicoNationalDigits(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('52') && digits.length === 12) return digits.slice(2);
  return digits.slice(0, 10);
}

export function normalizeMexicoPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+52${digits}`;
  if (digits.length === 12 && digits.startsWith('52')) return `+52${digits.slice(2)}`;
  return null;
}

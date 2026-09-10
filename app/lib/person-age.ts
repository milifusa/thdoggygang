export const CHILD_FREE_UNDER_AGE = 5;
export const ADULT_AGE = 18;

function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return { year, month, day };
}

export function ageOnDate(birthDate: string, onDate: string) {
  const birth = dateParts(birthDate);
  const current = dateParts(onDate);
  if (!birth || !current) return null;
  let age = current.year - birth.year;
  if (
    current.month < birth.month ||
    (current.month === birth.month && current.day < birth.day)
  )
    age -= 1;
  return age;
}

export function dateInMexico(instant: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Mexico_City",
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function isFreeChildForDate(
  person: { isMinor: boolean; birthDate: string | null },
  onDate: string,
) {
  if (!person.isMinor || !person.birthDate) return false;
  const age = ageOnDate(person.birthDate, onDate);
  return age !== null && age >= 0 && age < CHILD_FREE_UNDER_AGE;
}

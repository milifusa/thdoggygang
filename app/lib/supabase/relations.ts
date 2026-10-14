export function relationArray<T>(
  value: T | T[] | null | undefined,
): T[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

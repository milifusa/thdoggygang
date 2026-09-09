export type AccountRole = "ADMIN" | "GUIDE" | "CLIENT";

export function safeReturnPath(value: string | null | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : null;
}

export function destinationForRole(
  role: AccountRole,
  requested?: string | null,
) {
  const next = safeReturnPath(requested);
  if (role === "ADMIN") return next ?? "/admin";
  if (role === "GUIDE") {
    const allowed =
      next === "/mi-manada" ||
      next?.startsWith("/admin/hikes") ||
      next?.startsWith("/admin/hike-mode");
    return allowed ? next! : "/admin/hikes";
  }
  return next && !next.startsWith("/admin") ? next : "/mi-manada";
}

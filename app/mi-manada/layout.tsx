import { requireClientSession } from "../lib/auth/guards";

export const dynamic = "force-dynamic";
export default async function MyGangLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireClientSession("/mi-manada");
  return children;
}

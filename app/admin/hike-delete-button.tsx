"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function HikeDeleteButton({
  hikeId,
  hikeName,
}: {
  hikeId: string;
  hikeName: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  const remove = async () => {
    if (!window.confirm(`¿Ocultar y eliminar ${hikeName}?`)) return;
    setState("saving");
    const response = await fetch(`/api/admin/hikes/${hikeId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setState("error");
      return;
    }
    router.refresh();
  };

  return (
    <button type="button" onClick={remove} disabled={state === "saving"}>
      <Trash2 aria-hidden="true" />
      {state === "saving"
        ? "ELIMINANDO"
        : state === "error"
          ? "REINTENTAR"
          : "ELIMINAR"}
    </button>
  );
}

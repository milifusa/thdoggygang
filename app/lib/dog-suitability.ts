export type SuitabilityDog = {
  name: string;
  birthDate?: string | null;
  size?: string | null;
  sociability?: string | null;
  reactivity?: string | null;
  medicalConditions?: string | null;
  activityLevel?: string | null;
  hikingExperience?: string | null;
  vaccinationCurrent?: boolean | null;
  vetCleared?: boolean | null;
};

export type SuitabilityHike = {
  distanceKm?: number | null;
  elevationM?: number | null;
  durationMinutes?: number | null;
  difficulty?: string | null;
};

export function assessDogSuitability(dog: SuitabilityDog, hike: SuitabilityHike) {
  let score = 100;
  const notes: string[] = [];
  const age = dog.birthDate
    ? (Date.now() - new Date(`${dog.birthDate}T12:00:00`).getTime()) /
      (365.25 * 24 * 60 * 60 * 1000)
    : null;
  const demanding =
    Number(hike.distanceKm ?? 0) >= 10 ||
    Number(hike.elevationM ?? 0) >= 600 ||
    Number(hike.durationMinutes ?? 0) >= 240 ||
    /alta|difícil|avanzada/i.test(hike.difficulty ?? "");

  if (dog.vaccinationCurrent === false) {
    score -= 35;
    notes.push("Actualiza sus vacunas antes de asistir.");
  }
  if (dog.medicalConditions?.trim()) {
    score -= 20;
    notes.push("Consulta a su veterinario por las condiciones registradas.");
  }
  if (age !== null && (age < 1 || age >= 9)) {
    score -= demanding ? 30 : 15;
    notes.push("Su edad requiere una valoración individual de esfuerzo.");
  }
  if (demanding && dog.activityLevel === "LOW") {
    score -= 30;
    notes.push("La exigencia de esta ruta supera su nivel de actividad registrado.");
  }
  if (demanding && dog.hikingExperience === "FIRST_TIME") {
    score -= 20;
    notes.push("Conviene iniciar con una ruta más corta antes de este hike.");
  }
  if (dog.reactivity?.trim()) {
    score -= 10;
    notes.push("Comparte sus detonantes con el equipo antes de caminar.");
  }
  if (!dog.birthDate || !dog.activityLevel || !dog.hikingExperience) {
    score -= 8;
    notes.push("Completa su perfil para obtener una recomendación más precisa.");
  }
  if (!notes.length)
    notes.push("Su perfil coincide con la exigencia general de esta ruta.");

  return {
    score: Math.max(0, score),
    level: score >= 75 ? "GOOD" : score >= 50 ? "CAUTION" : "REVIEW",
    label:
      score >= 75
        ? "Buena compatibilidad"
        : score >= 50
          ? "Revisar antes de reservar"
          : "Consulta al equipo y a su veterinario",
    notes,
  } as const;
}

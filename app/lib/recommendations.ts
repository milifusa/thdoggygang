import type { Adventure } from "./data";
import { assessDogSuitability, type SuitabilityDog } from "./dog-suitability";

export function recommendAdventures(
  adventures: Adventure[],
  dogs: SuitabilityDog[],
  visitedHikeIds: Set<string>,
) {
  return adventures
    .map((adventure) => {
      const hike = {
        distanceKm: Number.parseFloat(adventure.distance) || 0,
        elevationM: Number.parseFloat(adventure.elevation) || 0,
        durationMinutes: adventure.durationMinutes,
        difficulty: adventure.difficulty,
      };
      const dogScores = dogs.map((dog) => assessDogSuitability(dog, hike));
      const compatibility = dogScores.length
        ? Math.round(
            dogScores.reduce((sum, result) => sum + result.score, 0) /
              dogScores.length,
          )
        : 68;
      const novelty = visitedHikeIds.has(adventure.id) ? 0 : 12;
      const availability = adventure.spots > 0 ? 8 : -30;
      return {
        adventure,
        score: Math.max(0, Math.min(100, compatibility + novelty + availability)),
        reason: dogs.length
          ? compatibility >= 75
            ? "Buena coincidencia con el perfil de tu manada"
            : "Una opción para considerar con preparación previa"
          : "Completa el perfil de tu perrito para afinar esta recomendación",
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

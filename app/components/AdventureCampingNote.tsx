import { TentTree } from "lucide-react";
import type { CampingOption } from "../lib/data";

export function AdventureCampingNote({
  options,
}: {
  options: CampingOption[];
}) {
  if (!options.length) return null;

  const lowestPriceOption = options.reduce((lowest, option) =>
    option.price < lowest.price ? option : lowest,
  );
  const optionNames = options.map((option) => option.name).join(" · ");
  const detail = lowestPriceOption.description.trim() || optionNames;
  const pricingLabel =
    lowestPriceOption.pricingMode === "PER_PERSON"
      ? "por persona"
      : "por reservación";

  return (
    <div className="card-camping-note">
      <span className="card-camping-icon" aria-hidden="true">
        <TentTree />
      </span>
      <div>
        <strong>CAMPING DISPONIBLE</strong>
        <p>{detail}</p>
        <small>
          {options.length > 1 ? `${options.length} opciones` : optionNames} ·
          desde ${lowestPriceOption.price.toLocaleString("es-MX")} MXN {pricingLabel}
        </small>
      </div>
    </div>
  );
}

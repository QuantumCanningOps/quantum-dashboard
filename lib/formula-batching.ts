/**
 * Quantum batching-sheet math.
 *
 * Excel Target Weight/Volume:
 *   lbs: (pct_frac * batch_gal * 3785.41 / 453.59237) * density / water
 *   g:   (pct_frac * batch_gal * 3785.41) * density / water
 *
 * where pct_frac is the sheet % column as a fraction (0.8788), density is
 * product density (lbs/gal), and water is Water (lbs/gal) = 8.345.
 */

/** Grams per US gallon as printed on Quantum sheets (Gallon / Grams). */
export const GRAMS_PER_US_GALLON = 3785.41;
export const GRAMS_PER_LB = 453.59237;

/** Default product density when a sheet does not specify one (e.g. Alameda Cola). */
export const DEFAULT_DENSITY_LBS_PER_GALLON = 8.4;

/** Fixed water density on Quantum sheets — volume conversion + sheet ratio. */
export const WATER_LBS_PER_GALLON = 8.345;

/**
 * Effective lbs per gallon used by sheet Target Weight formulas:
 * (3785.41 / 453.59237) * (density / water).
 */
export function sheetBatchWeightFactorLbsPerGallon(
  densityLbsPerGallon: number,
  waterLbsPerGallon: number = WATER_LBS_PER_GALLON,
): number {
  if (densityLbsPerGallon <= 0 || waterLbsPerGallon <= 0) return 0;
  return (
    (GRAMS_PER_US_GALLON / GRAMS_PER_LB) *
    (densityLbsPerGallon / waterLbsPerGallon)
  );
}

/** Total batch weight in lbs for a given volume and product density. */
export function batchWeightLbs(
  batchGallons: number,
  densityLbsPerGallon: number,
  waterLbsPerGallon: number = WATER_LBS_PER_GALLON,
): number {
  if (batchGallons <= 0) return 0;
  return (
    batchGallons *
    sheetBatchWeightFactorLbsPerGallon(densityLbsPerGallon, waterLbsPerGallon)
  );
}

/**
 * Target Weight (lbs) from a percentage in 0–100 form (UI / DB storage).
 * Matches Quantum Excel when density and batch gallons match the sheet.
 */
export function targetWeightLbsFromPercent(
  percent: number,
  batchGallons: number,
  densityLbsPerGallon: number,
  waterLbsPerGallon: number = WATER_LBS_PER_GALLON,
): number {
  if (percent <= 0) return 0;
  return (
    (percent / 100) *
    batchWeightLbs(batchGallons, densityLbsPerGallon, waterLbsPerGallon)
  );
}

/**
 * Percentage (0–100) implied by a Target Weight at the given batch size/density.
 */
export function percentFromTargetWeightLbs(
  weightLbs: number,
  batchGallons: number,
  densityLbsPerGallon: number,
  waterLbsPerGallon: number = WATER_LBS_PER_GALLON,
): number | null {
  const total = batchWeightLbs(
    batchGallons,
    densityLbsPerGallon,
    waterLbsPerGallon,
  );
  if (weightLbs < 0 || total <= 0) return null;
  return (weightLbs / total) * 100;
}

/** Normalize sheet / extraction unit labels to app forms (lbs, g, kg, oz, %). */
export function normalizeSheetUnit(unit: string | null | undefined): string | null {
  if (unit == null) return null;
  const u = unit.trim().toLowerCase();
  if (!u) return null;
  switch (u) {
    case "lb":
    case "lbs":
    case "pound":
    case "pounds":
      return "lbs";
    case "g":
    case "gram":
    case "grams":
      return "g";
    case "kg":
    case "kilogram":
    case "kilograms":
      return "kg";
    case "oz":
    case "ounce":
    case "ounces":
      return "oz";
    case "%":
    case "percent":
    case "pct":
    case "percentage":
      return "%";
    case "gal":
    case "gallon":
    case "gallons":
      return "gallons";
    case "each":
    case "ea":
      return "each";
    default:
      return u;
  }
}

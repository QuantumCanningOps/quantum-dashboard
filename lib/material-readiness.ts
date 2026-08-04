/**
 * Shared material-requirement math for formula batch scaling and production
 * order readiness. Keep these paths aligned so "Ready" on a formula cannot
 * disagree with "Short" on a newly created order for the same size.
 */

import {
  DEFAULT_DENSITY_LBS_PER_GALLON,
  GRAMS_PER_LB,
  targetWeightLbsFromPercent,
} from "@/lib/formula-batching";

export const FLUID_OUNCES_PER_GALLON = 128;
export const DEFAULT_CAN_SIZE_OZ = 12;
export const DEFAULT_CANS_PER_TRAY = 24;
const GRAMS_PER_KG = 1000;

export type IngredientQuantityBasis = "per_batch" | "per_can" | "percentage";
export type PackagingQuantityBasis =
  | "per_can"
  | "per_tray"
  | "per_case"
  | "per_unit";

export type IngredientRequirementLine = {
  itemId: string;
  itemName: string;
  quantity: number;
  unitOfMeasure: string;
  quantityBasis: IngredientQuantityBasis;
};

export type PackagingRequirementLine = {
  itemId: string;
  itemName: string;
  quantity: number;
  unitOfMeasure: string;
  quantityBasis: PackagingQuantityBasis | string;
};

export type InventoryAvailabilityRow = {
  itemId: string;
  itemName?: string | null;
  unitOfMeasure: string;
  quantity: number;
};

export type MaterialRequirement = {
  itemId: string;
  itemName: string;
  required: number;
  unitOfMeasure: string;
  kind: "ingredient" | "packaging";
  unlimited: boolean;
};

export function isPlantWaterItem(itemName: string | null | undefined): boolean {
  return (itemName ?? "").trim().toLowerCase() === "filtered water";
}

export function toGallons(
  qty: number,
  uom: string,
  cansPerTray: number = DEFAULT_CANS_PER_TRAY,
  canSizeOz: number = DEFAULT_CAN_SIZE_OZ,
): number | null {
  if (!Number.isFinite(qty)) return null;
  const size = canSizeOz > 0 ? canSizeOz : DEFAULT_CAN_SIZE_OZ;
  const tray = cansPerTray > 0 ? cansPerTray : DEFAULT_CANS_PER_TRAY;

  switch (uom.trim().toLowerCase()) {
    case "gal":
    case "gallon":
    case "gallons":
      return qty;
    case "can":
    case "cans":
      return (qty * size) / FLUID_OUNCES_PER_GALLON;
    case "case":
    case "cases":
    case "tray":
    case "trays":
      return (qty * tray * size) / FLUID_OUNCES_PER_GALLON;
    default:
      return null;
  }
}

export function filledCanCountFromGallons(
  gallons: number,
  canSizeOz: number = DEFAULT_CAN_SIZE_OZ,
): number {
  const size = canSizeOz > 0 ? canSizeOz : DEFAULT_CAN_SIZE_OZ;
  return (gallons * FLUID_OUNCES_PER_GALLON) / size;
}

export function packagingRequiredQty(
  quantity: number,
  basis: string,
  filledCans: number,
  cansPerTray: number = DEFAULT_CANS_PER_TRAY,
): number {
  const cans = Math.ceil(filledCans);
  const tray = cansPerTray > 0 ? cansPerTray : DEFAULT_CANS_PER_TRAY;
  switch (basis) {
    case "per_can":
      return Math.ceil(cans * quantity);
    case "per_tray":
    case "per_case":
      return Math.ceil(Math.ceil(cans / tray) * quantity);
    case "per_unit":
      return Math.ceil(quantity);
    default:
      return Math.ceil(cans * quantity);
  }
}

export function ingredientRequiredQty(
  line: Pick<
    IngredientRequirementLine,
    "quantity" | "quantityBasis" | "unitOfMeasure"
  >,
  scale: number,
  filledCans: number,
  orderGallons: number,
  densityLbsPerGallon: number = DEFAULT_DENSITY_LBS_PER_GALLON,
): { required: number; unitOfMeasure: string } {
  const basis = line.quantityBasis;
  if (basis === "percentage") {
    return {
      required: targetWeightLbsFromPercent(
        line.quantity,
        orderGallons,
        densityLbsPerGallon > 0
          ? densityLbsPerGallon
          : DEFAULT_DENSITY_LBS_PER_GALLON,
      ),
      unitOfMeasure: "lbs",
    };
  }
  if (basis === "per_can") {
    return {
      required: Math.ceil(filledCans * line.quantity),
      unitOfMeasure: line.unitOfMeasure,
    };
  }
  // per_batch (default)
  return {
    required: line.quantity * scale,
    unitOfMeasure: line.unitOfMeasure,
  };
}

export function buildScaledRequirements(args: {
  orderQuantity: number;
  orderUnitOfMeasure: string;
  baseQuantity: number;
  baseUnitOfMeasure: string;
  cansPerTray?: number | null;
  canSizeOz?: number | null;
  densityLbsPerGallon?: number | null;
  ingredients: IngredientRequirementLine[];
  packaging: PackagingRequirementLine[];
}): MaterialRequirement[] | null {
  const cansPerTray =
    args.cansPerTray != null && args.cansPerTray > 0
      ? args.cansPerTray
      : DEFAULT_CANS_PER_TRAY;
  const canSizeOz =
    args.canSizeOz != null && args.canSizeOz > 0
      ? args.canSizeOz
      : DEFAULT_CAN_SIZE_OZ;
  const density =
    args.densityLbsPerGallon != null && args.densityLbsPerGallon > 0
      ? args.densityLbsPerGallon
      : DEFAULT_DENSITY_LBS_PER_GALLON;

  const orderGallons = toGallons(
    args.orderQuantity,
    args.orderUnitOfMeasure,
    cansPerTray,
    canSizeOz,
  );
  const baseGallons = toGallons(
    args.baseQuantity,
    args.baseUnitOfMeasure,
    cansPerTray,
    canSizeOz,
  );
  if (
    orderGallons === null ||
    baseGallons === null ||
    baseGallons === 0 ||
    orderGallons <= 0
  ) {
    return null;
  }

  const scale = orderGallons / baseGallons;
  const filledCans = filledCanCountFromGallons(orderGallons, canSizeOz);

  const ingredientReqs: MaterialRequirement[] = args.ingredients.map(
    (line) => {
      const { required, unitOfMeasure } = ingredientRequiredQty(
        line,
        scale,
        filledCans,
        orderGallons,
        density,
      );
      return {
        itemId: line.itemId,
        itemName: line.itemName,
        required,
        unitOfMeasure,
        kind: "ingredient" as const,
        unlimited: isPlantWaterItem(line.itemName),
      };
    },
  );

  const packagingReqs: MaterialRequirement[] = args.packaging.map((line) => ({
    itemId: line.itemId,
    itemName: line.itemName,
    required: packagingRequiredQty(
      line.quantity,
      line.quantityBasis,
      filledCans,
      cansPerTray,
    ),
    unitOfMeasure: line.unitOfMeasure,
    kind: "packaging" as const,
    unlimited: false,
  }));

  return [...ingredientReqs, ...packagingReqs];
}

type WeightUnit = "g" | "kg" | "lbs";

function normalizeUnit(unit: string): string {
  const normalized = unit.toLowerCase().trim();
  if (normalized === "g" || normalized === "gram" || normalized === "grams") {
    return "g";
  }
  if (
    normalized === "lb" ||
    normalized === "lbs" ||
    normalized === "pound" ||
    normalized === "pounds"
  ) {
    return "lbs";
  }
  if (
    normalized === "kg" ||
    normalized === "kilogram" ||
    normalized === "kilograms"
  ) {
    return "kg";
  }
  return normalized;
}

function isWeightUnit(unit: string): unit is WeightUnit {
  return unit === "g" || unit === "kg" || unit === "lbs";
}

function toGrams(quantity: number, unit: WeightUnit): number {
  switch (unit) {
    case "g":
      return quantity;
    case "kg":
      return quantity * GRAMS_PER_KG;
    case "lbs":
      return quantity * GRAMS_PER_LB;
    default: {
      const _exhaustive: never = unit;
      return _exhaustive;
    }
  }
}

function fromGrams(grams: number, unit: WeightUnit): number {
  switch (unit) {
    case "g":
      return grams;
    case "kg":
      return grams / GRAMS_PER_KG;
    case "lbs":
      return grams / GRAMS_PER_LB;
    default: {
      const _exhaustive: never = unit;
      return _exhaustive;
    }
  }
}

export function convertQuantity(
  quantity: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return quantity;
  if (!isWeightUnit(from) || !isWeightUnit(to)) return null;
  return fromGrams(toGrams(quantity, from), to);
}

/** Sum inventory rows for an item, converting into the required UOM when possible. */
export function availableQuantityForItem(
  rows: InventoryAvailabilityRow[],
  itemId: string,
  requiredUnit: string,
  itemName?: string | null,
): number {
  if (isPlantWaterItem(itemName)) {
    return Number.MAX_SAFE_INTEGER;
  }

  const itemRows = rows.filter((row) => row.itemId === itemId);
  if (itemRows.some((row) => isPlantWaterItem(row.itemName))) {
    return Number.MAX_SAFE_INTEGER;
  }

  return itemRows.reduce((total, row) => {
    const converted = convertQuantity(
      row.quantity,
      row.unitOfMeasure,
      requiredUnit,
    );
    if (converted !== null) return total + converted;
    // Same non-weight UOM labels that didn't normalize equally still count
    // when they match after trim/case fold.
    if (
      row.unitOfMeasure.trim().toLowerCase() ===
      requiredUnit.trim().toLowerCase()
    ) {
      return total + row.quantity;
    }
    return total;
  }, 0);
}

/**
 * Stock free for this order: on-hand minus reservations from *other* open work.
 * Pass reservedOther from other orders' batch lines — never subtract this
 * order's own reserve from inventory_item_summary (that view can mis-label UOM).
 *
 * reservedOther should only include orders that outrank this one (see
 * hasReservationPriority) — otherwise every order in a competing group sees
 * every other order as "using up" the same stock and all show short, instead
 * of only the order(s) that actually don't fit once earlier claims are honored.
 */
export function freeQuantityForOrder(args: {
  onHand: number;
  reservedOther: number;
}): number {
  if (args.onHand >= Number.MAX_SAFE_INTEGER / 2) {
    return Number.MAX_SAFE_INTEGER;
  }
  return args.onHand - Math.max(0, args.reservedOther);
}

export type OrderPriorityKey = { id: string; createdAt: string };

/**
 * First-come-first-served claim on inventory: an order only "reserves ahead
 * of" orders created after it, never ones created before it. `createdAt` is
 * an ISO/timestamptz string (lexicographic compare is safe for that format);
 * `id` breaks exact ties so the ordering is total (no two distinct orders
 * both outrank each other, and none are mutually unranked).
 */
export function hasReservationPriority(
  a: OrderPriorityKey,
  b: OrderPriorityKey,
): boolean {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt;
  return a.id < b.id;
}

export type ReservationLine = {
  itemId: string;
  quantity: number;
  unitOfMeasure: string;
};

/**
 * Convert and sum reservation lines for an item into the required UOM.
 * Weight units convert; matching non-weight labels count; incompatible units
 * are skipped (do not treat raw mismatched numbers as the same quantity).
 */
export function reservedQuantityForItem(
  lines: ReservationLine[],
  itemId: string,
  requiredUnit: string,
): number {
  return lines.reduce((total, line) => {
    if (line.itemId !== itemId) return total;
    const converted = convertQuantity(
      line.quantity,
      line.unitOfMeasure,
      requiredUnit,
    );
    if (converted !== null) return total + converted;
    if (
      line.unitOfMeasure.trim().toLowerCase() ===
      requiredUnit.trim().toLowerCase()
    ) {
      return total + line.quantity;
    }
    return total;
  }, 0);
}

export function requirementsAreSufficient(
  requirements: MaterialRequirement[],
  inventory: InventoryAvailabilityRow[],
): boolean {
  return requirements.every((req) => {
    if (req.unlimited) return true;
    const available = availableQuantityForItem(
      inventory,
      req.itemId,
      req.unitOfMeasure,
      req.itemName,
    );
    return available >= req.required;
  });
}

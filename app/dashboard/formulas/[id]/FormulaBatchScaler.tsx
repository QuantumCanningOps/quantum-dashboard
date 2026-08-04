"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Pencil, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_CAN_SIZE_OZ,
  DEFAULT_CANS_PER_TRAY,
  LineRow,
  newLineDraft,
  type ItemOption,
  type LineDraft,
  type LineType,
  type PackagingQuantityBasis,
} from "../shared";
import {
  DEFAULT_DENSITY_LBS_PER_GALLON,
  GRAMS_PER_LB,
  WATER_LBS_PER_GALLON,
  percentFromTargetWeightLbs,
  targetWeightLbsFromPercent,
} from "@/lib/formula-batching";
import { updateFormulaDensity, updateFormulaLines } from "./actions";
import type { NewItemResult } from "../../receiving/actions";

const FLUID_OUNCES_PER_GALLON = 128;
const GRAMS_PER_KG = 1000;
/** Standard production batch sizes (gallons). */
const STANDARD_BATCH_GALLONS = [750, 1000, 1500, 2000, 3000] as const;
const batchUnits = ["gallons", "cases", "cans"] as const;
/** "native" keeps each line in its stored unit (matches batch sheets with mixed lbs/g). */
const requiredQtyUnits = ["native", "g", "kg", "lbs"] as const;

type BatchUnit = (typeof batchUnits)[number];
type RequiredQtyUnit = (typeof requiredQtyUnits)[number];

export type FormulaLine = {
  id: string;
  item_id: string;
  line_type: string;
  quantity: number;
  unit_of_measure: string;
  quantity_basis: "per_batch" | "per_can" | "percentage";
  items: {
    name: string;
    item_type: string;
    unit_of_measure: string;
  } | null;
};

export type InventoryByUnit = Record<string, number>;

export type ItemInventoryAvailability = {
  total: InventoryByUnit;
  onsite: InventoryByUnit;
  offsite: InventoryByUnit;
};

export type InventoryAvailability = Record<string, ItemInventoryAvailability>;

export type PackagingLineView = {
  id: string;
  item_id: string;
  quantity: number;
  unit_of_measure: string;
  quantity_basis: PackagingQuantityBasis;
  items: {
    name: string;
    item_type: string;
    unit_of_measure: string;
  } | null;
};

type FormulaBatchScalerProps = {
  baseQuantity: number;
  baseUnitOfMeasure: string;
  clientId: string;
  formulaId: string;
  lines: FormulaLine[];
  packagingLines?: PackagingLineView[];
  items: ItemOption[];
  inventoryAvailability: InventoryAvailability;
  /** Pack-out size from sku_packaging; defaults to 24. */
  cansPerTray?: number;
  canSizeOz?: number;
  /** Product density (lbs/gal) from the batching sheet. */
  densityLbsPerGallon?: number;
};

function lineToDraft(line: FormulaLine): LineDraft {
  return {
    key: line.id,
    lineType: line.line_type as LineType,
    itemId: line.item_id,
    quantity: String(line.quantity),
    unitOfMeasure: line.unit_of_measure,
    quantityBasis: line.quantity_basis,
  };
}

export function FormulaBatchScaler({
  baseQuantity,
  baseUnitOfMeasure,
  clientId,
  formulaId,
  lines,
  packagingLines = [],
  items: initialItems,
  inventoryAvailability,
  cansPerTray: cansPerTrayProp,
  canSizeOz: canSizeOzProp,
  densityLbsPerGallon: densityProp,
}: FormulaBatchScalerProps) {
  const cansPerTray =
    cansPerTrayProp != null && cansPerTrayProp > 0
      ? Math.floor(cansPerTrayProp)
      : DEFAULT_CANS_PER_TRAY;
  const canSizeOz =
    canSizeOzProp != null && canSizeOzProp > 0
      ? canSizeOzProp
      : DEFAULT_CAN_SIZE_OZ;
  const initialDensity =
    densityProp != null && densityProp > 0
      ? densityProp
      : DEFAULT_DENSITY_LBS_PER_GALLON;
  const [batchAmount, setBatchAmount] = useState(baseQuantity);
  const [batchUnit, setBatchUnit] = useState<BatchUnit>("gallons");
  const [bufferPercent, setBufferPercent] = useState(0);
  const [requiredQtyUnit, setRequiredQtyUnit] =
    useState<RequiredQtyUnit>("native");
  const [densityLbsPerGallon, setDensityLbsPerGallon] = useState(initialDensity);
  const [savedDensity, setSavedDensity] = useState(initialDensity);
  const [densitySaveError, setDensitySaveError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [currentLines, setCurrentLines] = useState(lines);
  const hasPercentageLines = currentLines.some(
    (line) => line.quantity_basis === "percentage",
  );
  const showsDensityControl =
    hasPercentageLines || isGallonUnit(baseUnitOfMeasure);

  useEffect(() => {
    if (densityProp != null && densityProp > 0) {
      setDensityLbsPerGallon(densityProp);
      setSavedDensity(densityProp);
    }
  }, [densityProp]);

  async function persistDensity(next: number) {
    if (!(next > 0) || next === savedDensity) return;
    setDensitySaveError(null);
    const result = await updateFormulaDensity(formulaId, next);
    if (!result.success) {
      setDensitySaveError(result.error);
      return;
    }
    setSavedDensity(next);
  }
  const [lineDrafts, setLineDrafts] = useState<LineDraft[]>([]);
  const [extraItems, setExtraItems] = useState<ItemOption[]>([]);
  const allItems = [
    ...initialItems,
    ...extraItems.filter((i) => !initialItems.some((ii) => ii.id === i.id)),
  ];
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentLines(lines);
  }, [lines]);

  function startEditing() {
    setLineDrafts(currentLines.length > 0 ? currentLines.map(lineToDraft) : [newLineDraft("ingredient")]);
    setSaveError(null);
    setIsEditing(true);
  }

  const updateLineDraft = useCallback((key: string, updates: Partial<LineDraft>) => {
    setLineDrafts((prev) => prev.map((l) => (l.key === key ? { ...l, ...updates } : l)));
  }, []);

  const removeLineDraft = useCallback((key: string) => {
    setLineDrafts((prev) => prev.filter((l) => l.key !== key));
  }, []);

  function addLineDraft() {
    setLineDrafts((prev) => [...prev, newLineDraft("ingredient")]);
  }

  function handleItemCreated(item: NewItemResult) {
    setExtraItems((prev) => [...prev, item]);
  }

  const lineDraftErrors: Record<string, string[]> = {};
  for (const line of lineDrafts) {
    const errs: string[] = [];
    if (!line.itemId) errs.push("item");
    if (!line.quantity || Number(line.quantity) <= 0) errs.push("quantity");
    if (!line.unitOfMeasure.trim()) errs.push("unit");
    if (errs.length > 0) lineDraftErrors[line.key] = errs;
  }
  const linesAreValid =
    lineDrafts.length > 0 && Object.keys(lineDraftErrors).length === 0;

  async function handleSaveLines() {
    if (!linesAreValid) return;
    setSaving(true);
    setSaveError(null);
    const result = await updateFormulaLines(
      formulaId,
      lineDrafts.map((l) => ({
        itemId: l.itemId,
        lineType: "ingredient" as const,
        quantity: Number(l.quantity),
        unitOfMeasure: l.unitOfMeasure.trim(),
        quantityBasis: l.quantityBasis,
      }))
    );
    if (!result.success) {
      setSaveError(result.error);
      setSaving(false);
      return;
    }
    setCurrentLines(lineDrafts.map((line) => {
      const item = allItems.find((i) => i.id === line.itemId);
      return {
        id: line.key,
        item_id: line.itemId,
        line_type: "ingredient",
        quantity: Number(line.quantity),
        unit_of_measure: line.unitOfMeasure.trim(),
        quantity_basis: line.quantityBasis,
        items: item
          ? {
              name: item.name,
              item_type: item.item_type,
              unit_of_measure: item.unit_of_measure,
            }
          : null,
      };
    }));
    setSaving(false);
    setIsEditing(false);
  }

  const presetBatchSizes = useMemo(() => {
    return STANDARD_BATCH_GALLONS.map((gallons) => {
      const value = getUnitAmountFromGallons(
        gallons,
        batchUnit,
        cansPerTray,
        canSizeOz,
      );
      return {
        label: `${formatQuantity(value)} ${batchUnit}`,
        value,
      };
    });
  }, [batchUnit, cansPerTray, canSizeOz]);

  const bufferedBatchAmount = applyBuffer(batchAmount, bufferPercent);
  const filledCanCount = getFilledCanCount(
    bufferedBatchAmount,
    batchUnit,
    cansPerTray,
    canSizeOz,
  );
  const equivalentGallons = getEquivalentGallons(
    bufferedBatchAmount,
    batchUnit,
    cansPerTray,
    canSizeOz,
  );
  const scale =
    equivalentGallons !== null && equivalentGallons > 0
      ? equivalentGallons / baseQuantity
      : 0;
  const requiredCans =
    filledCanCount === null ? null : Math.ceil(filledCanCount);
  const requiredTrays =
    requiredCans === null ? null : Math.ceil(requiredCans / cansPerTray);
  const percentageQtyLbs = useMemo(
    () =>
      getPercentageRequiredQuantitiesLbs(
        currentLines,
        equivalentGallons,
        densityLbsPerGallon,
      ),
    [currentLines, equivalentGallons, densityLbsPerGallon],
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Formula Lines</CardTitle>
            {!isEditing && (
              <button
                type="button"
                onClick={startEditing}
                aria-label="Edit formula lines"
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-4" />
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Base formula: {formatQuantity(baseQuantity)} {baseUnitOfMeasure}
          </p>
          {requiredCans !== null && (
            <p className="mt-1 text-sm text-muted-foreground">
              Packaging estimate: {requiredCans.toLocaleString()}{" "}
              {formatQuantity(canSizeOz)} oz cans and lids,{" "}
              {requiredTrays?.toLocaleString()} {cansPerTray}-pack trays
            </p>
          )}
          {equivalentGallons !== null && batchUnit !== "gallons" && (
            <p className="mt-1 text-sm text-muted-foreground">
              Liquid equivalent: {formatQuantity(equivalentGallons)} gallons
            </p>
          )}
          {bufferPercent > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              Buffered quantity: {formatQuantity(bufferedBatchAmount)}{" "}
              {batchUnit}
            </p>
          )}
          {showsDensityControl && (
            <p className="mt-1 text-sm text-muted-foreground">
              % ↔ Target Weight matches Quantum sheets using density{" "}
              {formatQuantity(densityLbsPerGallon)} lbs/gal (water{" "}
              {formatQuantity(WATER_LBS_PER_GALLON)}). Set density from the
              sheet — often 8.4, sometimes 8.345.
            </p>
          )}
        </div>

        {!isEditing && (
        <div className="flex w-full flex-col gap-2 md:w-auto md:min-w-80">
          <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
            <div className="flex flex-col gap-2">
              <Label htmlFor="batch-size">Order quantity</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="batch-size"
                  type="number"
                  min="0"
                  step="1"
                  value={batchAmount}
                  onChange={(event) => setBatchAmount(Number(event.target.value))}
                  className="w-32"
                />
                <div className="flex rounded-md border p-0.5">
                  {batchUnits.map((unit) => (
                    <Button
                      key={unit}
                      type="button"
                      variant={unit === batchUnit ? "default" : "ghost"}
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => {
                        const currentGallons = getEquivalentGallons(
                          batchAmount,
                          batchUnit,
                          cansPerTray,
                          canSizeOz,
                        );
                        setBatchUnit(unit);
                        if (currentGallons !== null) {
                          setBatchAmount(
                            getUnitAmountFromGallons(
                              currentGallons,
                              unit,
                              cansPerTray,
                              canSizeOz,
                            ),
                          );
                        }
                      }}
                    >
                      {unit}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="buffer-percent">Buffer</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="buffer-percent"
                  type="number"
                  min="0"
                  step="1"
                  value={bufferPercent}
                  onChange={(event) =>
                    setBufferPercent(Math.max(0, Number(event.target.value)))
                  }
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {presetBatchSizes.map((preset) => (
              <Button
                key={preset.value}
                type="button"
                variant={preset.value === batchAmount ? "default" : "outline"}
                size="sm"
                onClick={() => setBatchAmount(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
        )}
        {showsDensityControl && (
          <div className="flex w-full flex-col gap-2 md:w-auto">
            <Label htmlFor="density-lbs-per-gal">Density (lbs/gal)</Label>
            <Input
              id="density-lbs-per-gal"
              type="text"
              inputMode="decimal"
              value={String(densityLbsPerGallon)}
              onChange={(event) => {
                const v = event.target.value;
                if (v === "" || /^\d*\.?\d*$/.test(v)) {
                  const n = Number(v);
                  if (v !== "" && Number.isFinite(n)) {
                    setDensityLbsPerGallon(n);
                  } else if (v === "") {
                    setDensityLbsPerGallon(0);
                  }
                }
              }}
              onBlur={() => {
                void persistDensity(densityLbsPerGallon);
              }}
              className="w-32"
            />
            {densitySaveError && (
              <p className="text-xs text-destructive">{densitySaveError}</p>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="flex flex-col gap-3">
            {lineDrafts.map((line, i) => (
              <LineRow
                key={line.key}
                line={line}
                index={i}
                items={allItems}
                canRemove={lineDrafts.length > 1}
                clientId={clientId}
                onUpdate={updateLineDraft}
                onRemove={removeLineDraft}
                onItemCreated={handleItemCreated}
              />
            ))}

            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => addLineDraft()}>
                + Add Ingredient Line
              </Button>
            </div>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveLines} disabled={saving || !linesAreValid}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="pb-2 text-left font-medium">Item</th>
                <th className="pb-2 text-left font-medium">Type</th>
                <th className="pb-2 text-left font-medium">Line</th>
                <th className="pb-2 text-right font-medium">Basis</th>
                <th className="pb-2 text-right font-medium">
                  <div className="flex flex-col items-end gap-1.5">
                    <span>Required Qty</span>
                    <div className="flex rounded-md border p-0.5">
                      {requiredQtyUnits.map((unit) => (
                        <Button
                          key={unit}
                          type="button"
                          variant={unit === requiredQtyUnit ? "default" : "ghost"}
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => setRequiredQtyUnit(unit)}
                        >
                          {unit === "native" ? "as entered" : unit}
                        </Button>
                      ))}
                    </div>
                  </div>
                </th>
                <th className="pb-2 text-center font-medium">On Hand</th>
                <th className="pb-2 text-center font-medium">Location</th>
              </tr>
            </thead>
            <tbody>
              {currentLines.map((line) => {
                const quantity =
                  line.quantity_basis === "percentage"
                    ? (percentageQtyLbs[line.id] ?? 0)
                    : getRequiredQuantity(line, scale, filledCanCount);
                const display = getRequiredQuantityDisplay(
                  line,
                  quantity,
                  requiredQtyUnit,
                );
                const itemAvailability = inventoryAvailability[line.item_id];
                const availableQuantity = getAvailableQuantity(
                  itemAvailability?.total,
                  display.unit,
                );
                const hasEnough = availableQuantity >= display.quantity;
                const location = getInventoryLocationStatus(
                  itemAvailability,
                  display.unit,
                  display.quantity,
                );
                const itemName = line.items?.name ?? "Unnamed item";
                const quantityLbs =
                  line.quantity_basis === "percentage"
                    ? (percentageQtyLbs[line.id] ?? 0)
                    : convertQuantity(quantity, line.unit_of_measure, "lbs");
                const waterGallons =
                  isWaterIngredient(line) && quantityLbs != null
                    ? quantityLbs / WATER_LBS_PER_GALLON
                    : null;

                return (
                  <tr key={line.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">
                      <Link
                        href={`/dashboard/inventory?clientId=${clientId}&itemId=${line.item_id}`}
                        className="hover:underline"
                      >
                        {itemName}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {line.items?.item_type}
                    </td>
                    <td className="py-2 pr-4">
                      <LineTypeBadge type="ingredient" />
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatBasis(
                        line,
                        baseQuantity,
                        baseUnitOfMeasure,
                        densityLbsPerGallon,
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      <div>
                        {formatRequiredQuantity(line, display.quantity)}{" "}
                        <span className="text-muted-foreground font-normal">
                          {display.unit}
                        </span>
                      </div>
                      {waterGallons !== null && (
                        <div className="text-xs text-muted-foreground font-normal">
                          ≈ {formatQuantity(waterGallons)} gal @{" "}
                          {formatQuantity(WATER_LBS_PER_GALLON)} lbs/gal
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-center">
                      <span
                        title={`${formatInventoryAvailability(itemAvailability?.total)} on hand`}
                        aria-label={
                          hasEnough
                            ? "Inventory is sufficient"
                            : "Inventory is insufficient"
                        }
                        className={
                          hasEnough
                            ? "inline-flex text-green-600"
                            : "inline-flex text-red-600"
                        }
                      >
                        {hasEnough ? (
                          <Check className="size-4" />
                        ) : (
                          <X className="size-4" />
                        )}
                      </span>
                    </td>
                    <td className="py-2 text-center">
                      <InventoryLocationBadge status={location} />
                    </td>
                  </tr>
                );
              })}
              {packagingLines.map((line) => {
                const quantity = getPackagingRequiredQuantity(
                  line,
                  filledCanCount,
                  cansPerTray,
                );
                const itemAvailability = inventoryAvailability[line.item_id];
                const availableQuantity = getAvailableQuantity(
                  itemAvailability?.total,
                  line.unit_of_measure,
                );
                const hasEnough = availableQuantity >= quantity;
                const location = getInventoryLocationStatus(
                  itemAvailability,
                  line.unit_of_measure,
                  quantity,
                );
                const itemName = line.items?.name ?? "Unnamed item";

                return (
                  <tr key={`pkg-${line.id}`} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">
                      <Link
                        href={`/dashboard/inventory?clientId=${clientId}&itemId=${line.item_id}`}
                        className="hover:underline"
                      >
                        {itemName}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {line.items?.item_type ?? "packaging"}
                    </td>
                    <td className="py-2 pr-4">
                      <LineTypeBadge type="packaging" />
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatPackagingBasis(line, cansPerTray)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {Math.ceil(quantity).toLocaleString()}{" "}
                      <span className="text-muted-foreground font-normal">
                        {line.unit_of_measure}
                      </span>
                    </td>
                    <td className="py-2 text-center">
                      <span
                        title={`${formatInventoryAvailability(itemAvailability?.total)} on hand`}
                        aria-label={
                          hasEnough
                            ? "Inventory is sufficient"
                            : "Inventory is insufficient"
                        }
                        className={
                          hasEnough
                            ? "inline-flex text-green-600"
                            : "inline-flex text-red-600"
                        }
                      >
                        {hasEnough ? (
                          <Check className="size-4" />
                        ) : (
                          <X className="size-4" />
                        )}
                      </span>
                    </td>
                    <td className="py-2 text-center">
                      <InventoryLocationBadge status={location} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </CardContent>
    </Card>
  );
}

function LineTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    ingredient: "bg-blue-50 text-blue-700 border-blue-200",
    packaging: "bg-violet-50 text-violet-700 border-violet-200",
  };
  return <Badge className={map[type] ?? ""}>{type}</Badge>;
}

function formatQuantity(value: number) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

function getFilledCanCount(
  batchAmount: number,
  batchUnit: BatchUnit,
  cansPerTray: number,
  canSizeOz: number,
) {
  if (batchUnit === "cans") {
    return batchAmount;
  }

  if (batchUnit === "cases") {
    return batchAmount * cansPerTray;
  }

  return (batchAmount * FLUID_OUNCES_PER_GALLON) / canSizeOz;
}

function getEquivalentGallons(
  batchAmount: number,
  batchUnit: BatchUnit,
  cansPerTray: number,
  canSizeOz: number,
) {
  if (batchUnit === "gallons") {
    return batchAmount;
  }

  const cans = getFilledCanCount(
    batchAmount,
    batchUnit,
    cansPerTray,
    canSizeOz,
  );
  return (cans * canSizeOz) / FLUID_OUNCES_PER_GALLON;
}

function getUnitAmountFromGallons(
  gallons: number,
  batchUnit: BatchUnit,
  cansPerTray: number,
  canSizeOz: number,
) {
  if (batchUnit === "gallons") {
    return gallons;
  }

  const cans = (gallons * FLUID_OUNCES_PER_GALLON) / canSizeOz;
  if (batchUnit === "cans") {
    return Math.ceil(cans);
  }

  return Math.ceil(cans / cansPerTray);
}

function isWaterIngredient(line: Pick<FormulaLine, "items">) {
  return line.items?.name.toLowerCase().includes("water") ?? false;
}

/**
 * Match Quantum batching sheets:
 * target lbs = (pct/100) × batch gal × (3785.41/453.59237) × (density/water).
 */
function getPercentageRequiredQuantitiesLbs(
  lines: FormulaLine[],
  equivalentGallons: number | null,
  densityLbsPerGallon: number,
): Record<string, number> {
  const result: Record<string, number> = {};
  if (
    equivalentGallons === null ||
    equivalentGallons <= 0 ||
    densityLbsPerGallon <= 0
  ) {
    return result;
  }

  for (const line of lines) {
    if (line.quantity_basis !== "percentage") continue;
    result[line.id] = targetWeightLbsFromPercent(
      Number(line.quantity),
      equivalentGallons,
      densityLbsPerGallon,
    );
  }

  return result;
}

function getRequiredQuantity(
  line: FormulaLine,
  scale: number,
  filledCanCount: number | null,
) {
  if (line.quantity_basis === "percentage") {
    return 0;
  }

  if (line.quantity_basis !== "per_can" || filledCanCount === null) {
    return Number(line.quantity) * scale;
  }

  return Math.ceil(filledCanCount * Number(line.quantity));
}

function getPackagingRequiredQuantity(
  line: PackagingLineView,
  filledCanCount: number | null,
  cansPerTray: number,
) {
  const cans = filledCanCount === null ? 0 : Math.ceil(filledCanCount);
  const qty = Number(line.quantity);
  switch (line.quantity_basis) {
    case "per_can":
      return Math.ceil(cans * qty);
    case "per_tray":
      return Math.ceil(Math.ceil(cans / cansPerTray) * qty);
    case "per_case":
      return Math.ceil(Math.ceil(cans / cansPerTray) * qty);
    case "per_unit":
      return Math.ceil(qty);
    default: {
      const _exhaustive: never = line.quantity_basis;
      return _exhaustive;
    }
  }
}

function formatRequiredQuantity(line: FormulaLine, value: number) {
  if (line.quantity_basis === "per_can") {
    return Math.ceil(value).toLocaleString();
  }

  return formatQuantity(value);
}

function getRequiredQuantityDisplay(
  line: FormulaLine,
  quantity: number,
  preferredUnit: RequiredQtyUnit,
): { quantity: number; unit: string } {
  // Percentage lines are computed as lbs (sheet Target Weight default).
  if (line.quantity_basis === "percentage") {
    if (preferredUnit === "native") {
      return { quantity, unit: "lbs" };
    }
    const converted = convertQuantity(quantity, "lbs", preferredUnit);
    return {
      quantity: converted ?? quantity,
      unit: preferredUnit,
    };
  }

  if (preferredUnit === "native") {
    return { quantity, unit: line.unit_of_measure };
  }

  const converted = convertQuantity(
    quantity,
    line.unit_of_measure,
    preferredUnit,
  );
  if (converted === null) {
    return { quantity, unit: line.unit_of_measure };
  }

  return { quantity: converted, unit: preferredUnit };
}

function formatBasis(
  line: FormulaLine,
  baseQuantity: number,
  baseUnitOfMeasure: string,
  densityLbsPerGallon: number,
) {
  if (line.quantity_basis === "percentage") {
    return `${formatQuantity(line.quantity)}%`;
  }

  // Target-weight lines are stored as per_batch weight; show sheet-style %
  // using the same density/water factor as Excel Target Weight.
  if (
    line.quantity_basis === "per_batch" &&
    isGallonUnit(baseUnitOfMeasure)
  ) {
    const quantityLbs = convertQuantity(
      Number(line.quantity),
      line.unit_of_measure,
      "lbs",
    );
    if (quantityLbs != null) {
      const pct = percentFromTargetWeightLbs(
        quantityLbs,
        baseQuantity,
        densityLbsPerGallon,
      );
      if (pct != null) {
        return `${formatQuantity(pct)}% · ${formatQuantity(line.quantity)} ${line.unit_of_measure}`;
      }
    }
  }

  if (line.quantity_basis !== "per_can") {
    return `${formatQuantity(line.quantity)} ${line.unit_of_measure} / ${formatQuantity(baseQuantity)} ${baseUnitOfMeasure}`;
  }

  return `${formatQuantity(line.quantity)} ${line.unit_of_measure} / can`;
}

function formatPackagingBasis(
  line: PackagingLineView,
  cansPerTray: number,
) {
  switch (line.quantity_basis) {
    case "per_can":
      return `${formatQuantity(line.quantity)} ${line.unit_of_measure} / can`;
    case "per_tray":
      return `${formatQuantity(line.quantity)} ${line.unit_of_measure} / tray (${cansPerTray} cans)`;
    case "per_case":
      return `${formatQuantity(line.quantity)} ${line.unit_of_measure} / case`;
    case "per_unit":
      return `${formatQuantity(line.quantity)} ${line.unit_of_measure}`;
    default: {
      const _exhaustive: never = line.quantity_basis;
      return _exhaustive;
    }
  }
}

function isGallonUnit(unit: string) {
  const normalized = unit.trim().toLowerCase();
  return normalized === "gallons" || normalized === "gallon" || normalized === "gal";
}

function applyBuffer(batchAmount: number, bufferPercent: number) {
  return batchAmount * (1 + bufferPercent / 100);
}

function getAvailableQuantity(
  availability: InventoryByUnit | undefined,
  requiredUnit: string,
) {
  if (!availability) {
    return 0;
  }

  return Object.entries(availability).reduce((total, [unit, quantity]) => {
    const converted = convertQuantity(quantity, unit, requiredUnit);
    return converted === null ? total : total + converted;
  }, 0);
}

type InventoryLocationKind = "onsite" | "offsite" | "both" | "none";

type InventoryLocationStatus = {
  kind: InventoryLocationKind;
  label: string;
  title: string;
  needsRetrieval: boolean;
};

function getInventoryLocationStatus(
  availability: ItemInventoryAvailability | undefined,
  requiredUnit: string,
  requiredQuantity: number,
): InventoryLocationStatus {
  const onsiteQty = getAvailableQuantity(availability?.onsite, requiredUnit);
  const offsiteQty = getAvailableQuantity(availability?.offsite, requiredUnit);
  const totalQty = getAvailableQuantity(availability?.total, requiredUnit);
  const breakdown = [
    onsiteQty > 0 ? `${formatQuantity(onsiteQty)} ${requiredUnit} on-site` : null,
    offsiteQty > 0
      ? `${formatQuantity(offsiteQty)} ${requiredUnit} off-site`
      : null,
  ]
    .filter(Boolean)
    .join("; ");

  if (onsiteQty <= 0 && offsiteQty <= 0) {
    return {
      kind: "none",
      label: "—",
      title: "No inventory on hand",
      needsRetrieval: false,
    };
  }

  // Enough at plant (Skyway) — no retrieval needed, even if off-site also exists.
  if (onsiteQty >= requiredQuantity) {
    return {
      kind: "onsite",
      label: "On-site",
      title: breakdown || "On-site",
      needsRetrieval: false,
    };
  }

  // Requirement only met (or only stocked) using off-site inventory.
  if (offsiteQty > 0 && totalQty >= requiredQuantity) {
    return {
      kind: "offsite",
      label: "Off-site",
      title: `${breakdown}. Needs retrieval from off-site.`,
      needsRetrieval: true,
    };
  }

  if (onsiteQty > 0 && offsiteQty > 0) {
    return {
      kind: "both",
      label: "Both",
      title: `${breakdown}. On-site alone is not enough.`,
      needsRetrieval: true,
    };
  }

  if (offsiteQty > 0) {
    return {
      kind: "offsite",
      label: "Off-site",
      title: `${breakdown}. Needs retrieval from off-site.`,
      needsRetrieval: true,
    };
  }

  return {
    kind: "onsite",
    label: "On-site",
    title: breakdown || "On-site",
    needsRetrieval: false,
  };
}

function InventoryLocationBadge({ status }: { status: InventoryLocationStatus }) {
  if (status.kind === "none") {
    return (
      <span className="text-muted-foreground" title={status.title}>
        {status.label}
      </span>
    );
  }

  const className =
    status.kind === "onsite"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : status.kind === "offsite"
        ? "bg-amber-50 text-amber-900 border-amber-200"
        : "bg-sky-50 text-sky-900 border-sky-200";

  return (
    <Badge className={className} title={status.title}>
      {status.label}
    </Badge>
  );
}

type WeightUnit = "g" | "kg" | "lbs";

function isWeightUnit(unit: string): unit is WeightUnit {
  return unit === "g" || unit === "kg" || unit === "lbs";
}

function convertQuantity(
  quantity: number,
  fromUnit: string,
  toUnit: string,
) {
  const normalizedFromUnit = normalizeUnit(fromUnit);
  const normalizedToUnit = normalizeUnit(toUnit);

  if (normalizedFromUnit === normalizedToUnit) {
    return quantity;
  }

  if (!isWeightUnit(normalizedFromUnit) || !isWeightUnit(normalizedToUnit)) {
    return null;
  }

  return fromGramsUnit(toGrams(quantity, normalizedFromUnit), normalizedToUnit);
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

function fromGramsUnit(grams: number, unit: WeightUnit): number {
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

function normalizeUnit(unit: string) {
  const normalized = unit.toLowerCase().trim();
  if (
    normalized === "g" ||
    normalized === "gram" ||
    normalized === "grams"
  ) {
    return "g";
  }
  if (normalized === "lb" || normalized === "pound" || normalized === "pounds") {
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

function formatInventoryAvailability(
  availability: InventoryByUnit | undefined,
) {
  if (!availability || Object.keys(availability).length === 0) {
    return "0";
  }

  return Object.entries(availability)
    .map(([unit, quantity]) => `${formatQuantity(quantity)} ${unit}`)
    .join(", ");
}

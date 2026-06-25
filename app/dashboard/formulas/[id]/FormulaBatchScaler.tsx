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
  LineRow,
  newLineDraft,
  type ItemOption,
  type LineDraft,
  type LineType,
} from "../shared";
import { updateFormulaLines } from "./actions";
import type { NewItemResult } from "../../receiving/actions";

const FLUID_OUNCES_PER_GALLON = 128;
const CAN_SIZE_OUNCES = 12;
const CANS_PER_TRAY = 24;
const batchUnits = ["gallons", "cases", "cans"] as const;

type BatchUnit = (typeof batchUnits)[number];

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

export type InventoryAvailability = Record<
  string,
  Record<string, number>
>;

type FormulaBatchScalerProps = {
  baseQuantity: number;
  baseUnitOfMeasure: string;
  clientId: string;
  formulaId: string;
  lines: FormulaLine[];
  items: ItemOption[];
  inventoryAvailability: InventoryAvailability;
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
  items: initialItems,
  inventoryAvailability,
}: FormulaBatchScalerProps) {
  const [batchAmount, setBatchAmount] = useState(baseQuantity);
  const [batchUnit, setBatchUnit] = useState<BatchUnit>("gallons");
  const [bufferPercent, setBufferPercent] = useState(0);

  const [isEditing, setIsEditing] = useState(false);
  const [currentLines, setCurrentLines] = useState(lines);
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

  function addLineDraft(lineType: LineType = "ingredient") {
    setLineDrafts((prev) => [...prev, newLineDraft(lineType)]);
  }

  function handleItemCreated(item: NewItemResult) {
    setExtraItems((prev) => [...prev, item]);
  }

  const lineDraftErrors: Record<string, string[]> = {};
  for (const line of lineDrafts) {
    const errs: string[] = [];
    if (!line.itemId) errs.push("ingredient");
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
        lineType: l.lineType,
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
        line_type: line.lineType,
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
    return [0.25, 0.5, 1, 1.5, 2].map((multiplier) => {
      const value = getUnitAmountFromGallons(
        baseQuantity * multiplier,
        batchUnit,
      );

      return {
        label: `${formatQuantity(value)} ${batchUnit}`,
        value,
      };
    });
  }, [baseQuantity, batchUnit]);

  const bufferedBatchAmount = applyBuffer(batchAmount, bufferPercent);
  const filledCanCount = getFilledCanCount(bufferedBatchAmount, batchUnit);
  const equivalentGallons = getEquivalentGallons(bufferedBatchAmount, batchUnit);
  const scale =
    equivalentGallons !== null && equivalentGallons > 0
      ? equivalentGallons / baseQuantity
      : 0;
  const requiredCans =
    filledCanCount === null ? null : Math.ceil(filledCanCount);
  const requiredTrays =
    requiredCans === null ? null : Math.ceil(requiredCans / CANS_PER_TRAY);

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
              Packaging estimate: {requiredCans.toLocaleString()} 12 oz cans
              and lids, {requiredTrays?.toLocaleString()} 24-pack trays
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
                        );
                        setBatchUnit(unit);
                        if (currentGallons !== null) {
                          setBatchAmount(
                            getUnitAmountFromGallons(currentGallons, unit),
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
              <Button type="button" variant="outline" size="sm" onClick={() => addLineDraft("ingredient")}>
                + Add Ingredient Line
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addLineDraft("packaging")}>
                + Add Packaging Line
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
                <th className="pb-2 text-right font-medium">Required Qty</th>
                <th className="pb-2 text-center font-medium">On Hand</th>
              </tr>
            </thead>
            <tbody>
              {currentLines.map((line) => {
                const quantity = getRequiredQuantity(line, scale, filledCanCount);
                const availableQuantity = getAvailableQuantity(
                  inventoryAvailability[line.item_id],
                  line.unit_of_measure,
                );
                const hasEnough = availableQuantity >= quantity;
                const itemName = line.items?.name ?? "Unnamed item";

                return (
                  <tr key={line.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">
                      {line.line_type === "ingredient" ? (
                        <Link
                          href={`/dashboard/inventory?clientId=${clientId}&itemId=${line.item_id}`}
                          className="hover:underline"
                        >
                          {itemName}
                        </Link>
                      ) : (
                        itemName
                      )}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {line.items?.item_type}
                    </td>
                    <td className="py-2 pr-4">
                      <LineTypeBadge type={line.line_type} />
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatBasis(line, baseQuantity, baseUnitOfMeasure)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {formatRequiredQuantity(line, quantity)}{" "}
                      <span className="text-muted-foreground font-normal">
                        {line.unit_of_measure}
                      </span>
                    </td>
                    <td className="py-2 text-center">
                      {line.quantity_basis === "percentage" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          title={`${formatInventoryAvailability(inventoryAvailability[line.item_id])} on hand`}
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
                      )}
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

function getFilledCanCount(batchAmount: number, batchUnit: BatchUnit) {
  if (batchUnit === "cans") {
    return batchAmount;
  }

  if (batchUnit === "cases") {
    return batchAmount * CANS_PER_TRAY;
  }

  return (batchAmount * FLUID_OUNCES_PER_GALLON) / CAN_SIZE_OUNCES;
}

function getEquivalentGallons(batchAmount: number, batchUnit: BatchUnit) {
  if (batchUnit === "gallons") {
    return batchAmount;
  }

  const cans = getFilledCanCount(batchAmount, batchUnit);
  return cans === null ? null : (cans * CAN_SIZE_OUNCES) / FLUID_OUNCES_PER_GALLON;
}

function getUnitAmountFromGallons(gallons: number, batchUnit: BatchUnit) {
  if (batchUnit === "gallons") {
    return gallons;
  }

  const cans = (gallons * FLUID_OUNCES_PER_GALLON) / CAN_SIZE_OUNCES;
  if (batchUnit === "cans") {
    return Math.ceil(cans);
  }

  return Math.ceil(cans / CANS_PER_TRAY);
}

function getRequiredQuantity(
  line: FormulaLine,
  scale: number,
  filledCanCount: number | null,
) {
  if (line.quantity_basis === "percentage") {
    return Number(line.quantity);
  }

  if (line.quantity_basis !== "per_can" || filledCanCount === null) {
    return Number(line.quantity) * scale;
  }

  if (isTray(line)) {
    return Math.ceil(Math.ceil(filledCanCount) / CANS_PER_TRAY);
  }

  return Math.ceil(filledCanCount * Number(line.quantity));
}

function formatRequiredQuantity(line: FormulaLine, value: number) {
  if (line.quantity_basis === "per_can") {
    return Math.ceil(value).toLocaleString();
  }

  return formatQuantity(value);
}

function formatBasis(
  line: FormulaLine,
  baseQuantity: number,
  baseUnitOfMeasure: string,
) {
  if (line.quantity_basis === "percentage") {
    return `${formatQuantity(line.quantity)}%`;
  }

  if (line.quantity_basis !== "per_can") {
    return `${formatQuantity(line.quantity)} ${line.unit_of_measure} / ${formatQuantity(baseQuantity)} ${baseUnitOfMeasure}`;
  }

  if (isTray(line)) {
    return `1 ${line.unit_of_measure} / ${CANS_PER_TRAY} cans`;
  }

  return `${formatQuantity(line.quantity)} ${line.unit_of_measure} / can`;
}

function isTray(line: FormulaLine) {
  return line.items?.name.toLowerCase().includes("tray") ?? false;
}

function applyBuffer(batchAmount: number, bufferPercent: number) {
  return batchAmount * (1 + bufferPercent / 100);
}

function getAvailableQuantity(
  availability: Record<string, number> | undefined,
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

  if (normalizedFromUnit === "kg" && normalizedToUnit === "lbs") {
    return quantity * 2.2046226218;
  }

  if (normalizedFromUnit === "lbs" && normalizedToUnit === "kg") {
    return quantity / 2.2046226218;
  }

  return null;
}

function normalizeUnit(unit: string) {
  const normalized = unit.toLowerCase();
  if (normalized === "lb" || normalized === "pound" || normalized === "pounds") {
    return "lbs";
  }
  if (normalized === "kilogram" || normalized === "kilograms") {
    return "kg";
  }
  return normalized;
}

function formatInventoryAvailability(
  availability: Record<string, number> | undefined,
) {
  if (!availability) {
    return "0";
  }

  return Object.entries(availability)
    .map(([unit, quantity]) => `${formatQuantity(quantity)} ${unit}`)
    .join(", ");
}

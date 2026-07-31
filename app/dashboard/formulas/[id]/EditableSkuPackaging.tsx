"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil } from "lucide-react";
import { randomId } from "@/lib/utils";
import {
  CAN_TYPES,
  DEFAULT_CAN_SIZE_OZ,
  DEFAULT_CAN_TYPE,
  DEFAULT_CANS_PER_TRAY,
  DEFAULT_LID_COLOR,
  OPT,
  PACKAGING_QUANTITY_BASES,
  SECONDARY_PACKAGING_OPTIONS,
  SEL,
  NewIngredientForm,
  type CanType,
  type ItemOption,
  type PackagingQuantityBasis,
  type SecondaryPackaging,
} from "../shared";
import type { NewItemResult } from "../../receiving/actions";
import { updateSkuPackaging } from "./actions";

export type SkuPackagingHeader = {
  sku_id: string;
  cans_per_tray: number;
  can_size_oz: number;
  can_type: CanType;
  lid_color: string;
  secondary_packaging: SecondaryPackaging;
  tray_notes: string | null;
  lid_notes: string | null;
  notes: string | null;
};

export type SkuPackagingLine = {
  id: string;
  item_id: string;
  quantity: number;
  unit_of_measure: string;
  quantity_basis: PackagingQuantityBasis;
  items: { name: string; item_type: string; unit_of_measure: string } | null;
};

type LineDraft = {
  key: string;
  itemId: string;
  quantity: string;
  unitOfMeasure: string;
  quantityBasis: PackagingQuantityBasis;
};

function toLineDraft(line: SkuPackagingLine): LineDraft {
  return {
    key: line.id,
    itemId: line.item_id,
    quantity: String(line.quantity),
    unitOfMeasure: line.unit_of_measure,
    quantityBasis: line.quantity_basis,
  };
}

function newLineDraft(): LineDraft {
  return {
    key: randomId(),
    itemId: "",
    quantity: "1",
    unitOfMeasure: "each",
    quantityBasis: "per_can",
  };
}

function defaultHeader(skuId: string): SkuPackagingHeader {
  return {
    sku_id: skuId,
    cans_per_tray: DEFAULT_CANS_PER_TRAY,
    can_size_oz: DEFAULT_CAN_SIZE_OZ,
    can_type: DEFAULT_CAN_TYPE,
    lid_color: DEFAULT_LID_COLOR,
    secondary_packaging: "none",
    tray_notes: null,
    lid_notes: null,
    notes: null,
  };
}

export function EditableSkuPackaging({
  formulaId,
  clientId,
  skuId,
  packaging,
  lines,
  items: initialItems,
}: {
  formulaId: string;
  clientId: string;
  skuId: string | null;
  packaging: SkuPackagingHeader | null;
  lines: SkuPackagingLine[];
  items: ItemOption[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentHeader, setCurrentHeader] = useState(
    packaging ?? (skuId ? defaultHeader(skuId) : null),
  );
  const [currentLines, setCurrentLines] = useState(lines);
  const [cansPerTray, setCansPerTray] = useState(
    String(packaging?.cans_per_tray ?? DEFAULT_CANS_PER_TRAY),
  );
  const [canSizeOz, setCanSizeOz] = useState(
    String(packaging?.can_size_oz ?? DEFAULT_CAN_SIZE_OZ),
  );
  const [canType, setCanType] = useState<CanType>(
    packaging?.can_type ?? DEFAULT_CAN_TYPE,
  );
  const [lidColor, setLidColor] = useState(
    packaging?.lid_color ?? DEFAULT_LID_COLOR,
  );
  const [secondaryPackaging, setSecondaryPackaging] =
    useState<SecondaryPackaging>(packaging?.secondary_packaging ?? "none");
  const [trayNotes, setTrayNotes] = useState(packaging?.tray_notes ?? "");
  const [lidNotes, setLidNotes] = useState(packaging?.lid_notes ?? "");
  const [notes, setNotes] = useState(packaging?.notes ?? "");
  const [lineDrafts, setLineDrafts] = useState<LineDraft[]>([]);
  const [creatingItemForKey, setCreatingItemForKey] = useState<string | null>(
    null,
  );
  const [extraItems, setExtraItems] = useState<ItemOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allItems = [
    ...initialItems,
    ...extraItems.filter((i) => !initialItems.some((ii) => ii.id === i.id)),
  ];
  const packagingItems = allItems.filter((i) => i.item_type === "packaging");

  useEffect(() => {
    setCurrentHeader(packaging ?? (skuId ? defaultHeader(skuId) : null));
    setCurrentLines(lines);
  }, [packaging, lines, skuId]);

  function startEditing() {
    if (!skuId) return;
    const header = currentHeader ?? defaultHeader(skuId);
    setCansPerTray(String(header.cans_per_tray));
    setCanSizeOz(String(header.can_size_oz));
    setCanType(header.can_type);
    setLidColor(header.lid_color);
    setSecondaryPackaging(header.secondary_packaging);
    setTrayNotes(header.tray_notes ?? "");
    setLidNotes(header.lid_notes ?? "");
    setNotes(header.notes ?? "");
    setLineDrafts(
      currentLines.length > 0 ? currentLines.map(toLineDraft) : [newLineDraft()],
    );
    setCreatingItemForKey(null);
    setError(null);
    setIsEditing(true);
  }

  const updateLineDraft = useCallback(
    (key: string, updates: Partial<LineDraft>) => {
      setLineDrafts((prev) =>
        prev.map((l) => (l.key === key ? { ...l, ...updates } : l)),
      );
    },
    [],
  );

  async function handleSave() {
    if (!skuId) return;
    const cans = Math.floor(Number(cansPerTray));
    const sizeOz = Number(canSizeOz);
    if (!Number.isFinite(cans) || cans <= 0) {
      setError("Cans per tray must be a positive whole number");
      return;
    }
    if (!Number.isFinite(sizeOz) || sizeOz <= 0) {
      setError("Can size must be a positive number");
      return;
    }

    const validLines = lineDrafts.filter(
      (l) => l.itemId && Number(l.quantity) > 0 && l.unitOfMeasure.trim(),
    );
    for (const line of lineDrafts) {
      if (!line.itemId && !line.quantity && !line.unitOfMeasure.trim()) continue;
      if (!line.itemId || !(Number(line.quantity) > 0) || !line.unitOfMeasure.trim()) {
        setError("Each packaging component needs an item, quantity, and unit");
        return;
      }
    }

    setSaving(true);
    setError(null);
    const result = await updateSkuPackaging({
      skuId,
      formulaId,
      header: {
        cansPerTray: cans,
        canSizeOz: sizeOz,
        canType,
        lidColor: lidColor.trim() || DEFAULT_LID_COLOR,
        secondaryPackaging,
        trayNotes: trayNotes.trim() || null,
        lidNotes: lidNotes.trim() || null,
        notes: notes.trim() || null,
      },
      lines: validLines.map((l) => ({
        itemId: l.itemId,
        quantity: Number(l.quantity),
        unitOfMeasure: l.unitOfMeasure.trim(),
        quantityBasis: l.quantityBasis,
      })),
    });
    if (!result.success) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setCurrentHeader({
      sku_id: skuId,
      cans_per_tray: cans,
      can_size_oz: sizeOz,
      can_type: canType,
      lid_color: lidColor.trim() || DEFAULT_LID_COLOR,
      secondary_packaging: secondaryPackaging,
      tray_notes: trayNotes.trim() || null,
      lid_notes: lidNotes.trim() || null,
      notes: notes.trim() || null,
    });
    setCurrentLines(
      validLines.map((l) => {
        const item = allItems.find((i) => i.id === l.itemId);
        return {
          id: l.key,
          item_id: l.itemId,
          quantity: Number(l.quantity),
          unit_of_measure: l.unitOfMeasure.trim(),
          quantity_basis: l.quantityBasis,
          items: item
            ? {
                name: item.name,
                item_type: item.item_type,
                unit_of_measure: item.unit_of_measure,
              }
            : null,
        };
      }),
    );
    setSaving(false);
    setIsEditing(false);
  }

  if (!skuId) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Packaging</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Link a SKU to manage packaging specs and components.
          </p>
        </CardContent>
      </Card>
    );
  }

  const header = currentHeader ?? defaultHeader(skuId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Packaging</CardTitle>
        {!isEditing && (
          <button
            type="button"
            onClick={startEditing}
            aria-label="Edit packaging"
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isEditing ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Cans per tray</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={cansPerTray}
                  onChange={(e) => setCansPerTray(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Can size (oz)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={canSizeOz}
                  onChange={(e) => setCanSizeOz(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Can type</Label>
                <select
                  className={SEL}
                  value={canType}
                  onChange={(e) => setCanType(e.target.value as CanType)}
                >
                  {CAN_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value} className={OPT}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Lid color</Label>
                <Input
                  value={lidColor}
                  onChange={(e) => setLidColor(e.target.value)}
                  placeholder="silver"
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label className="text-xs">Secondary packaging</Label>
                <select
                  className={SEL}
                  value={secondaryPackaging}
                  onChange={(e) =>
                    setSecondaryPackaging(e.target.value as SecondaryPackaging)
                  }
                >
                  {SECONDARY_PACKAGING_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className={OPT}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label className="text-xs">Tray notes</Label>
                <Input
                  value={trayNotes}
                  onChange={(e) => setTrayNotes(e.target.value)}
                  placeholder="Custom print, color, etc."
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label className="text-xs">Lid notes</Label>
                <Input
                  value={lidNotes}
                  onChange={(e) => setLidNotes(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label className="text-xs">Other notes</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs">Components</Label>
              {lineDrafts.map((line) => (
                <div key={line.key} className="flex flex-col gap-2 rounded-md border p-2">
                  <div className="grid gap-2 sm:grid-cols-[1fr_5rem_5rem_7rem_auto]">
                    <select
                      className={SEL}
                      value={
                        creatingItemForKey === line.key ? "__new__" : line.itemId
                      }
                      onChange={(e) => {
                        if (e.target.value === "__new__") {
                          setCreatingItemForKey(line.key);
                          return;
                        }
                        setCreatingItemForKey(null);
                        const item = packagingItems.find(
                          (i) => i.id === e.target.value,
                        );
                        updateLineDraft(line.key, {
                          itemId: e.target.value,
                          unitOfMeasure:
                            item?.unit_of_measure || line.unitOfMeasure,
                        });
                      }}
                    >
                      <option value="" className={OPT}>Select item…</option>
                      {packagingItems.map((item) => (
                        <option key={item.id} value={item.id} className={OPT}>
                          {item.name}
                        </option>
                      ))}
                      <option disabled className={OPT}>──────────</option>
                      <option value="__new__" className={OPT}>
                        + Create packaging item…
                      </option>
                    </select>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={(e) =>
                        updateLineDraft(line.key, { quantity: e.target.value })
                      }
                      placeholder="Qty"
                    />
                    <Input
                      value={line.unitOfMeasure}
                      onChange={(e) =>
                        updateLineDraft(line.key, {
                          unitOfMeasure: e.target.value,
                        })
                      }
                      placeholder="UOM"
                    />
                    <select
                      className={SEL}
                      value={line.quantityBasis}
                      onChange={(e) =>
                        updateLineDraft(line.key, {
                          quantityBasis: e.target
                            .value as PackagingQuantityBasis,
                        })
                      }
                    >
                      {PACKAGING_QUANTITY_BASES.map((opt) => (
                        <option key={opt.value} value={opt.value} className={OPT}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setLineDrafts((prev) =>
                          prev.filter((l) => l.key !== line.key),
                        )
                      }
                      disabled={lineDrafts.length <= 1}
                    >
                      Remove
                    </Button>
                  </div>
                  {creatingItemForKey === line.key && (
                    <NewIngredientForm
                      clientId={clientId}
                      defaultItemType="packaging"
                      onCreated={(item: NewItemResult) => {
                        setExtraItems((prev) => [...prev, item]);
                        updateLineDraft(line.key, {
                          itemId: item.id,
                          unitOfMeasure: item.unit_of_measure,
                        });
                        setCreatingItemForKey(null);
                      }}
                      onCancel={() => setCreatingItemForKey(null)}
                    />
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => setLineDrafts((prev) => [...prev, newLineDraft()])}
              >
                + Add component
              </Button>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Cans per tray</dt>
                <dd>{header.cans_per_tray}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Can size</dt>
                <dd>{Number(header.can_size_oz)} oz</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Can type</dt>
                <dd className="capitalize">{header.can_type}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Lid color</dt>
                <dd className="capitalize">{header.lid_color}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Secondary</dt>
                <dd>
                  {SECONDARY_PACKAGING_OPTIONS.find(
                    (o) => o.value === header.secondary_packaging,
                  )?.label ?? header.secondary_packaging}
                </dd>
              </div>
              {(header.tray_notes || header.lid_notes || header.notes) && (
                <div className="sm:col-span-2 flex flex-col gap-1">
                  {header.tray_notes && (
                    <p className="text-muted-foreground">
                      Tray: {header.tray_notes}
                    </p>
                  )}
                  {header.lid_notes && (
                    <p className="text-muted-foreground">
                      Lid: {header.lid_notes}
                    </p>
                  )}
                  {header.notes && (
                    <p className="text-muted-foreground">{header.notes}</p>
                  )}
                </div>
              )}
            </dl>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Components
              </p>
              {currentLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No packaging components yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {currentLines.map((line) => (
                    <li
                      key={line.id}
                      className="flex flex-wrap items-center gap-2 border-b pb-1 last:border-0"
                    >
                      <span className="font-medium">
                        {line.items?.name ?? "Unknown item"}
                      </span>
                      <span className="text-muted-foreground ml-auto tabular-nums">
                        {Number(line.quantity).toLocaleString()}{" "}
                        {line.unit_of_measure} /{" "}
                        {line.quantity_basis.replace("per_", "")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

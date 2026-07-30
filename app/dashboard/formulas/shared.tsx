"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { randomId } from "@/lib/utils";
import { createItem, type NewItemResult } from "../receiving/actions";
import { createSkuRecord, type NewSkuResult } from "./new/actions";

// ---------------------------------------------------------------------------
// Types shared between formula creation and formula editing
// ---------------------------------------------------------------------------

export type ItemOption = {
  id: string;
  name: string;
  item_type: string;
  unit_of_measure: string;
  requires_coa: boolean;
  shelf_life_days: number | null;
  client_id: string | null;
  supplier_id: string | null;
};

export type SkuOption = {
  id: string;
  client_id: string;
  code: string;
  name: string;
  shelf_life_days: number | null;
  formula_id?: string | null;
};

export type LineType = "ingredient" | "packaging";
export type QuantityBasis = "per_batch" | "per_can" | "percentage";
export type ItemType = "raw_ingredient" | "packaging" | "wip" | "finished_good";

export type LineDraft = {
  key: string;
  lineType: LineType;
  itemId: string;
  quantity: string;
  unitOfMeasure: string;
  quantityBasis: QuantityBasis;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Matches ReceivingForm.tsx — explicit bg + text colors fix white-on-white
export const SEL =
  "flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export const OPT = "bg-background text-foreground";

export const LINE_TYPES: { value: LineType; label: string }[] = [
  { value: "ingredient", label: "Ingredient" },
  { value: "packaging", label: "Packaging" },
];

export const QUANTITY_BASES: { value: QuantityBasis; label: string }[] = [
  { value: "per_batch", label: "Per batch" },
  { value: "per_can", label: "Per can" },
  { value: "percentage", label: "Percentage" },
];

export const itemTypeForLine: Record<LineType, ItemType> = {
  ingredient: "raw_ingredient",
  packaging: "packaging",
};

export function newLineDraft(lineType: LineType = "ingredient"): LineDraft {
  return {
    key: randomId(),
    lineType,
    itemId: "",
    quantity: "",
    unitOfMeasure: "",
    quantityBasis: "per_batch",
  };
}

// ---------------------------------------------------------------------------
// NewSkuForm — inline panel shown when "Create new SKU" is selected
// ---------------------------------------------------------------------------

export function NewSkuForm({
  clientId,
  onCreated,
  onCancel,
}: {
  clientId: string;
  onCreated: (sku: NewSkuResult) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [shelfLife, setShelfLife] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = !!code.trim() && !!name.trim();

  async function handleSave() {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    const result = await createSkuRecord({
      clientId,
      code,
      name,
      shelfLifeDays: shelfLife ? Number(shelfLife) : null,
    });
    if ("error" in result) {
      setError(result.error);
      setSaving(false);
      return;
    }
    onCreated(result);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
      className="rounded-md border border-dashed border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-blue-800 dark:text-blue-200">New SKU</span>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Code *</Label>
          <Input
            placeholder="e.g. ACME-ORAN-12"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Shelf Life (days)</Label>
          <Input
            type="number"
            min="1"
            placeholder="365"
            value={shelfLife}
            onChange={(e) => setShelfLife(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1 col-span-2">
          <Label className="text-xs">Name *</Label>
          <Input
            placeholder="e.g. Orange Soda 12oz"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button type="submit" size="sm" disabled={!isValid || saving}>
        {saving ? "Saving…" : "Save SKU"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// NewIngredientForm — inline panel shown when "Create new item" is
// selected on a formula line. Reuses the createItem action shared with
// ReceivingForm.tsx.
// ---------------------------------------------------------------------------

export function NewIngredientForm({
  clientId,
  defaultItemType,
  onCreated,
  onCancel,
}: {
  clientId: string;
  defaultItemType: ItemType;
  onCreated: (item: NewItemResult) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [itemType, setItemType] = useState<ItemType>(defaultItemType);
  const [uom, setUom] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = !!name.trim() && !!uom.trim();

  async function handleSave() {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    const result = await createItem({
      clientId,
      supplierId: null,
      name,
      itemType,
      unitOfMeasure: uom,
      requiresCoa: false,
      shelfLifeDays: null,
    });
    if ("error" in result) {
      setError(result.error);
      setSaving(false);
      return;
    }
    onCreated(result);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
      className="rounded-md border border-dashed border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-blue-800 dark:text-blue-200">New Item</span>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1 col-span-2">
          <Label className="text-xs">Name *</Label>
          <Input
            placeholder="e.g. ACME Orange Flavoring"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Type *</Label>
          <select
            className={SEL}
            value={itemType}
            onChange={(e) => setItemType(e.target.value as ItemType)}
          >
            <option value="raw_ingredient" className={OPT}>Raw Ingredient</option>
            <option value="packaging" className={OPT}>Packaging</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Unit of Measure *</Label>
          <Input
            placeholder="lbs / each / kg…"
            value={uom}
            onChange={(e) => setUom(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button type="submit" size="sm" disabled={!isValid || saving}>
        {saving ? "Saving…" : "Save Item"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// LineRow — a single editable formula line (ingredient or packaging), used
// by both the formula creation form and the formula detail page's lines
// editor.
// ---------------------------------------------------------------------------

export function LineRow({
  line,
  index,
  items,
  canRemove,
  clientId,
  onUpdate,
  onRemove,
  onItemCreated,
}: {
  line: LineDraft;
  index: number;
  items: ItemOption[];
  canRemove: boolean;
  clientId: string;
  onUpdate: (key: string, updates: Partial<LineDraft>) => void;
  onRemove: (key: string) => void;
  onItemCreated: (item: NewItemResult) => void;
}) {
  const [creatingItem, setCreatingItem] = useState(false);

  const wantedItemType = itemTypeForLine[line.lineType];
  const availableItems = items.filter(
    (i) =>
      i.item_type === wantedItemType &&
      (!i.client_id || i.client_id === clientId)
  );
  const selectedItem = items.find((i) => i.id === line.itemId) ?? null;

  function handleLineTypeChange(value: LineType) {
    setCreatingItem(false);
    onUpdate(line.key, { lineType: value, itemId: "" });
  }

  function handleItemChange(value: string) {
    if (value === "__new__") {
      setCreatingItem(true);
      return;
    }
    setCreatingItem(false);
    const item = items.find((i) => i.id === value) ?? null;
    onUpdate(line.key, {
      itemId: value,
      unitOfMeasure:
        line.quantityBasis === "percentage"
          ? "%"
          : item?.unit_of_measure ?? line.unitOfMeasure,
    });
  }

  function handleBasisChange(value: QuantityBasis) {
    onUpdate(line.key, {
      quantityBasis: value,
      unitOfMeasure:
        value === "percentage" ? "%" : selectedItem?.unit_of_measure ?? "",
    });
  }

  function handleNewItemCreated(item: NewItemResult) {
    setCreatingItem(false);
    onItemCreated(item);
    onUpdate(line.key, {
      itemId: item.id,
      unitOfMeasure: line.quantityBasis === "percentage" ? "%" : item.unit_of_measure,
    });
  }

  return (
    <div className="rounded-lg border p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Line {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(line.key)}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      {/* Row 1: line type + item */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Line Type *</Label>
          <select
            className={SEL}
            value={line.lineType}
            onChange={(e) => handleLineTypeChange(e.target.value as LineType)}
          >
            {LINE_TYPES.map((t) => (
              <option key={t.value} value={t.value} className={OPT}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Item *</Label>
          <select
            className={SEL}
            value={creatingItem ? "__new__" : line.itemId}
            onChange={(e) => handleItemChange(e.target.value)}
          >
            <option value="" className={OPT}>Select item…</option>
            {availableItems.map((item) => (
              <option key={item.id} value={item.id} className={OPT}>
                {item.name}
              </option>
            ))}
            <option disabled className={OPT}>──────────</option>
            <option value="__new__" className={OPT}>+ Create new item…</option>
          </select>
        </div>
      </div>

      {/* New item form — shown when "Create new item" is selected */}
      {creatingItem && (
        <NewIngredientForm
          clientId={clientId}
          defaultItemType={wantedItemType}
          onCreated={handleNewItemCreated}
          onCancel={() => {
            setCreatingItem(false);
            onUpdate(line.key, { itemId: "" });
          }}
        />
      )}

      {/* Row 2: quantity + basis */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Quantity *</Label>
          <Input
            type="number"
            min="0"
            step="any"
            placeholder="0"
            value={line.quantity}
            onChange={(e) => onUpdate(line.key, { quantity: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Basis *</Label>
          <select
            className={SEL}
            value={line.quantityBasis}
            onChange={(e) => handleBasisChange(e.target.value as QuantityBasis)}
          >
            {QUANTITY_BASES.map((b) => (
              <option key={b.value} value={b.value} className={OPT}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 3: unit of measure */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Unit of Measure *</Label>
          <Input
            placeholder="lbs / each / kg…"
            value={line.unitOfMeasure}
            disabled={line.quantityBasis === "percentage"}
            onChange={(e) => onUpdate(line.key, { unitOfMeasure: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

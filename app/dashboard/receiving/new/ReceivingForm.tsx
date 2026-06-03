"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  extractFromBol,
  submitReceiving,
  createItem,
  type NewItemResult,
  type ReceivingLotInput,
} from "../actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ItemOption = {
  id: string;
  name: string;
  unit_of_measure: string;
  requires_coa: boolean;
  shelf_life_days: number | null;
  client_id: string | null;
  supplier_id: string | null;
};

type ClientOption = { id: string; name: string; code: string };
type SupplierOption = { id: string; name: string; code: string };
type TplOption = { id: string; name: string; code: string };

type LotDraft = {
  key: string;
  itemId: string;
  lotNumber: string;
  quantity: string;
  unitOfMeasure: string;
  manufactureDate: string;
  expirationDate: string;
  poNumber: string;
  notes: string;
  coaFile: File | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Matches ReceivingFilters.tsx — explicit bg + text colors fix white-on-white
const SEL =
  "flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const OPT = "bg-background text-foreground";

const ITEM_TYPES = [
  { value: "raw_ingredient", label: "Raw Ingredient" },
  { value: "packaging",      label: "Packaging" },
  { value: "wip",            label: "WIP" },
  { value: "finished_good",  label: "Finished Good" },
] as const;

type ItemType = (typeof ITEM_TYPES)[number]["value"];

function today() {
  return new Date().toISOString().split("T")[0];
}

function newLotDraft(): LotDraft {
  return {
    key: crypto.randomUUID(),
    itemId: "",
    lotNumber: "",
    quantity: "",
    unitOfMeasure: "",
    manufactureDate: "",
    expirationDate: "",
    poNumber: "",
    notes: "",
    coaFile: null,
  };
}

function addExpiryFromShelfLife(mfrDate: string, shelfLifeDays: number): string {
  const d = new Date(mfrDate);
  d.setDate(d.getDate() + shelfLifeDays);
  return d.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// NewItemForm — inline panel inside LotRow
// ---------------------------------------------------------------------------

function NewItemForm({
  clientId,
  supplierId,
  onCreated,
  onCancel,
}: {
  clientId: string;
  supplierId: string | null;
  onCreated: (item: NewItemResult) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [itemType, setItemType] = useState<ItemType>("raw_ingredient");
  const [uom, setUom] = useState("");
  const [requiresCoa, setRequiresCoa] = useState(false);
  const [shelfLife, setShelfLife] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = !!name.trim() && !!uom.trim();

  async function handleSave() {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    const result = await createItem({
      clientId,
      supplierId,
      name,
      itemType,
      unitOfMeasure: uom,
      requiresCoa,
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
    <div className="rounded-md border border-dashed border-blue-300 bg-blue-50 p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-blue-800">New Item</span>
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
            {ITEM_TYPES.map((t) => (
              <option key={t.value} value={t.value} className={OPT}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Unit of Measure *</Label>
          <Input
            placeholder="kg / each / lbs…"
            value={uom}
            onChange={(e) => setUom(e.target.value)}
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
        <div className="flex items-center gap-2 pt-4">
          <input
            id="requires-coa"
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={requiresCoa}
            onChange={(e) => setRequiresCoa(e.target.checked)}
          />
          <Label htmlFor="requires-coa" className="text-xs cursor-pointer">
            Requires COA
          </Label>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button size="sm" disabled={!isValid || saving} onClick={handleSave}>
        {saving ? "Saving…" : "Save Item"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LotRow
// ---------------------------------------------------------------------------

function LotRow({
  lot,
  index,
  items,
  canRemove,
  clientId,
  supplierId,
  onUpdate,
  onRemove,
  onItemCreated,
  extractedDescription,
}: {
  lot: LotDraft;
  index: number;
  items: ItemOption[];
  canRemove: boolean;
  clientId: string;
  supplierId: string;
  onUpdate: (key: string, updates: Partial<LotDraft>) => void;
  onRemove: (key: string) => void;
  onItemCreated: (item: NewItemResult) => void;
  extractedDescription?: string;
}) {
  const [creatingItem, setCreatingItem] = useState(false);

  const selectedItem = items.find((i) => i.id === lot.itemId) ?? null;
  const requiresCoa = selectedItem?.requires_coa ?? false;

  function handleItemChange(value: string) {
    if (value === "__new__") {
      setCreatingItem(true);
      return;
    }
    setCreatingItem(false);
    const item = items.find((i) => i.id === value) ?? null;
    const updates: Partial<LotDraft> = { itemId: value };
    if (item) {
      updates.unitOfMeasure = item.unit_of_measure;
      if (item.shelf_life_days && lot.manufactureDate) {
        updates.expirationDate = addExpiryFromShelfLife(
          lot.manufactureDate,
          item.shelf_life_days
        );
      }
    }
    onUpdate(lot.key, updates);
  }

  function handleManufactureDateChange(date: string) {
    const updates: Partial<LotDraft> = { manufactureDate: date };
    if (date && selectedItem?.shelf_life_days) {
      updates.expirationDate = addExpiryFromShelfLife(
        date,
        selectedItem.shelf_life_days
      );
    }
    onUpdate(lot.key, updates);
  }

  function handleNewItemCreated(item: NewItemResult) {
    setCreatingItem(false);
    onItemCreated(item);
    const updates: Partial<LotDraft> = {
      itemId: item.id,
      unitOfMeasure: item.unit_of_measure,
    };
    if (item.shelf_life_days && lot.manufactureDate) {
      updates.expirationDate = addExpiryFromShelfLife(
        lot.manufactureDate,
        item.shelf_life_days
      );
    }
    onUpdate(lot.key, updates);
  }

  return (
    <div className="rounded-lg border p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Lot {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(lot.key)}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      {extractedDescription && (
        <div className="rounded bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
          From BOL: <span className="font-medium">{extractedDescription}</span>
        </div>
      )}

      {/* Row 1: item + lot number */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Item *</Label>
          <select
            className={SEL}
            value={creatingItem ? "__new__" : lot.itemId}
            onChange={(e) => handleItemChange(e.target.value)}
          >
            <option value="" className={OPT}>Select item…</option>
            {items.map((item) => (
              <option key={item.id} value={item.id} className={OPT}>
                {item.name}
              </option>
            ))}
            <option disabled className={OPT}>──────────</option>
            <option value="__new__" className={OPT}>+ Create new item…</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Lot # *</Label>
          <Input
            placeholder="e.g. FLVR-RASP-2026001"
            value={lot.lotNumber}
            onChange={(e) => onUpdate(lot.key, { lotNumber: e.target.value })}
          />
        </div>
      </div>

      {/* New item form — shown when "Create new item" is selected */}
      {creatingItem && (
        <NewItemForm
          clientId={clientId}
          supplierId={supplierId || null}
          onCreated={handleNewItemCreated}
          onCancel={() => {
            setCreatingItem(false);
            onUpdate(lot.key, { itemId: "" });
          }}
        />
      )}

      {/* Row 2: quantity + UOM */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Quantity *</Label>
          <Input
            type="number"
            min="0"
            step="any"
            placeholder="0"
            value={lot.quantity}
            onChange={(e) => onUpdate(lot.key, { quantity: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Unit of Measure *</Label>
          <Input
            placeholder="kg / each / lbs…"
            value={lot.unitOfMeasure}
            onChange={(e) =>
              onUpdate(lot.key, { unitOfMeasure: e.target.value })
            }
          />
        </div>
      </div>

      {/* Row 3: dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Manufacture Date</Label>
          <Input
            type="date"
            value={lot.manufactureDate}
            onChange={(e) => handleManufactureDateChange(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">
            Expiration Date
            {selectedItem?.shelf_life_days && (
              <span className="ml-1 font-normal text-muted-foreground">
                (auto-calculated)
              </span>
            )}
          </Label>
          <Input
            type="date"
            value={lot.expirationDate}
            onChange={(e) =>
              onUpdate(lot.key, { expirationDate: e.target.value })
            }
          />
        </div>
      </div>

      {/* Row 4: PO + notes */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">PO Number</Label>
          <Input
            placeholder="PO-2024-001"
            value={lot.poNumber}
            onChange={(e) => onUpdate(lot.key, { poNumber: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Notes</Label>
          <Input
            placeholder="Optional"
            value={lot.notes}
            onChange={(e) => onUpdate(lot.key, { notes: e.target.value })}
          />
        </div>
      </div>

      {/* COA upload — only when required */}
      {requiresCoa && (
        <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
              COA Required
            </Badge>
            <span className="text-xs text-muted-foreground">
              {selectedItem?.name} requires a Certificate of Analysis
            </span>
          </div>
          {lot.coaFile ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono truncate max-w-xs">
                {lot.coaFile.name}
              </span>
              <button
                type="button"
                onClick={() => onUpdate(lot.key, { coaFile: null })}
                className="text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            </div>
          ) : (
            <Label className="cursor-pointer">
              <span className="text-xs text-blue-600 underline underline-offset-2">
                Upload COA (PDF or PNG)
              </span>
              <input
                type="file"
                className="sr-only"
                accept=".pdf,image/png"
                onChange={(e) =>
                  onUpdate(lot.key, { coaFile: e.target.files?.[0] ?? null })
                }
              />
            </Label>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

export function ReceivingForm({
  clients,
  suppliers,
  items: initialItems,
  thirdPartyLogistics,
}: {
  clients: ClientOption[];
  suppliers: SupplierOption[];
  items: ItemOption[];
  thirdPartyLogistics: TplOption[];
}) {
  const router = useRouter();

  // Shipment header
  const [clientId, setClientId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [receivedAt, setReceivedAt] = useState(today());

  // BOL section
  const [bolFile, setBolFile] = useState<File | null>(null);
  const [carrierName, setCarrierName] = useState("");
  const [tplId, setTplId] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);
  const [extractedDescriptions, setExtractedDescriptions] = useState<
    Record<string, string>
  >({});

  // Items — seeded from server, extended client-side when new items are created
  const [extraItems, setExtraItems] = useState<ItemOption[]>([]);
  const allItems = [...initialItems, ...extraItems];
  const clientItems = clientId
    ? allItems.filter((i) => !i.client_id || i.client_id === clientId)
    : allItems;

  // Lots
  const [lots, setLots] = useState<LotDraft[]>([newLotDraft()]);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function handleItemCreated(item: NewItemResult) {
    setExtraItems((prev) => [...prev, item]);
  }

  // Try to match a supplier by name (case-insensitive)
  function matchSupplier(name: string): string {
    const lower = name.toLowerCase();
    return (
      suppliers.find(
        (s) =>
          s.name.toLowerCase().includes(lower) ||
          lower.includes(s.name.toLowerCase())
      )?.id ?? ""
    );
  }

  // ── BOL extraction ────────────────────────────────────────────────────────

  async function handleExtract() {
    if (!bolFile) return;
    setExtracting(true);
    setExtractNote(null);

    const fd = new FormData();
    fd.append("file", bolFile);
    const result = await extractFromBol(fd);

    if (!result.ok) {
      setExtractNote(result.message);
      setExtracting(false);
      return;
    }

    const { data } = result;
    const notes: string[] = [];

    if (data.carrierName) {
      setCarrierName(data.carrierName);
      notes.push(`carrier: ${data.carrierName}`);
    }

    if (data.supplierName) {
      const matched = matchSupplier(data.supplierName);
      if (matched) {
        setSupplierId(matched);
        notes.push("supplier matched");
      } else {
        notes.push(`supplier "${data.supplierName}" not matched — select manually`);
      }
    }

    if (data.lots && data.lots.length > 0) {
      const isDefaultEmpty =
        lots.length === 1 &&
        !lots[0].lotNumber &&
        !lots[0].quantity &&
        !lots[0].itemId;

      const newLots: LotDraft[] = data.lots.map((l) => ({
        key: crypto.randomUUID(),
        itemId: "",
        lotNumber: l.lotNumber ?? "",
        quantity: l.quantity != null ? String(l.quantity) : "",
        unitOfMeasure: l.unitOfMeasure ?? "",
        manufactureDate: l.manufactureDate ?? "",
        expirationDate: l.expirationDate ?? "",
        poNumber: "",
        notes: "",
        coaFile: null,
      }));

      const descMap: Record<string, string> = {};
      data.lots.forEach((l, i) => {
        if (l.itemDescription && newLots[i]) {
          descMap[newLots[i].key] = l.itemDescription;
        }
      });
      setExtractedDescriptions(descMap);
      setLots(isDefaultEmpty ? newLots : [...lots, ...newLots]);
      notes.push(
        `${data.lots.length} lot line${data.lots.length !== 1 ? "s" : ""} extracted — select items`
      );
    }

    setExtractNote(
      notes.length > 0
        ? `Extracted: ${notes.join("; ")}.`
        : "BOL scanned but no data found — fill in fields manually."
    );
    setExtracting(false);
  }

  // ── Lot management ────────────────────────────────────────────────────────

  const updateLot = useCallback((key: string, updates: Partial<LotDraft>) => {
    setLots((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...updates } : l))
    );
  }, []);

  const removeLot = useCallback((key: string) => {
    setLots((prev) => prev.filter((l) => l.key !== key));
  }, []);

  function addLot() {
    setLots((prev) => [...prev, newLotDraft()]);
  }

  // ── Validation ────────────────────────────────────────────────────────────

  const lotErrors: Record<string, string[]> = {};
  for (const lot of lots) {
    const errs: string[] = [];
    if (!lot.itemId) errs.push("item");
    if (!lot.lotNumber.trim()) errs.push("lot number");
    if (!lot.quantity || Number(lot.quantity) <= 0) errs.push("quantity");
    if (!lot.unitOfMeasure.trim()) errs.push("unit");
    if (errs.length > 0) lotErrors[lot.key] = errs;
  }

  const isValid =
    !!clientId &&
    !!receivedAt &&
    lots.length > 0 &&
    Object.keys(lotErrors).length === 0;

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!isValid) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const supabase = createClient();

      let bolStoragePath: string | null = null;
      let bolFileName: string | null = null;
      if (bolFile) {
        const bolId = crypto.randomUUID();
        const path = `${clientId}/bol/${bolId}/${bolFile.name}`;
        const { error } = await supabase.storage
          .from("documents")
          .upload(path, bolFile);
        if (error) throw new Error(error.message);
        bolStoragePath = path;
        bolFileName = bolFile.name;
      }

      const lotInputs: ReceivingLotInput[] = await Promise.all(
        lots.map(async (lot) => {
          let coaStoragePath: string | null = null;
          let coaFileName: string | null = null;
          if (lot.coaFile) {
            const coaId = crypto.randomUUID();
            const path = `${clientId}/coa/${coaId}/${lot.coaFile.name}`;
            const { error } = await supabase.storage
              .from("documents")
              .upload(path, lot.coaFile);
            if (error) throw new Error(error.message);
            coaStoragePath = path;
            coaFileName = lot.coaFile.name;
          }
          return {
            itemId: lot.itemId,
            lotNumber: lot.lotNumber.trim(),
            quantity: Number(lot.quantity),
            unitOfMeasure: lot.unitOfMeasure.trim(),
            manufactureDate: lot.manufactureDate || null,
            expirationDate: lot.expirationDate || null,
            poNumber: lot.poNumber.trim() || null,
            notes: lot.notes.trim() || null,
            coaFileName,
            coaStoragePath,
          };
        })
      );

      const result = await submitReceiving({
        clientId,
        supplierId: supplierId || null,
        receivedAt,
        carrierName: carrierName.trim() || null,
        tplId: tplId || null,
        bolFileName,
        bolStoragePath,
        lots: lotInputs,
      });

      if (!result.success) {
        setSubmitError(result.error);
        return;
      }

      router.push("/dashboard/receiving");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New Receipt</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/dashboard/receiving")}
        >
          Cancel
        </Button>
      </div>

      {/* ── Shipment Details ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Shipment Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client">Client *</Label>
              <select
                id="client"
                className={SEL}
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setLots((prev) =>
                    prev.map((l) => ({ ...l, itemId: "", unitOfMeasure: "" }))
                  );
                }}
              >
                <option value="" className={OPT}>Select client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id} className={OPT}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="received-at">Date Received *</Label>
              <Input
                id="received-at"
                type="date"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier">Supplier</Label>
            <select
              id="supplier"
              className={SEL}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="" className={OPT}>Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id} className={OPT}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* ── Bill of Lading ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bill of Lading</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="carrier">Carrier</Label>
              <Input
                id="carrier"
                placeholder="e.g. FedEx Freight"
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl">3PL (if delivered offsite)</Label>
              <select
                id="tpl"
                className={SEL}
                value={tplId}
                onChange={(e) => setTplId(e.target.value)}
              >
                <option value="" className={OPT}>None — delivered on-site</option>
                {thirdPartyLogistics.map((t) => (
                  <option key={t.id} value={t.id} className={OPT}>
                    {t.code} — {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>BOL Document</Label>
            {bolFile ? (
              <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-mono truncate flex-1">{bolFile.name}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExtract}
                  disabled={extracting}
                >
                  {extracting ? "Extracting…" : "Extract info from BOL"}
                </Button>
                <button
                  type="button"
                  onClick={() => { setBolFile(null); setExtractNote(null); }}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              </div>
            ) : (
              <Label
                htmlFor="bol-file"
                className="cursor-pointer flex items-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
              >
                <span>Upload BOL (PDF or PNG) — optional but recommended</span>
                <input
                  id="bol-file"
                  type="file"
                  className="sr-only"
                  accept=".pdf,image/png,image/jpeg"
                  onChange={(e) => {
                    setBolFile(e.target.files?.[0] ?? null);
                    setExtractNote(null);
                  }}
                />
              </Label>
            )}

            {extractNote && (
              <p className={`text-xs ${extractNote.startsWith("ANTHROPIC") || extractNote.startsWith("API") ? "text-destructive" : extractNote.startsWith("Extracted") ? "text-muted-foreground" : "text-amber-600"}`}>
                {extractNote}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Lots ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Lots Received
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({lots.length})
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              All lots enter quarantine pending QA release.
            </p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!clientId && (
            <p className="text-sm text-muted-foreground">
              Select a client above to filter available items.
            </p>
          )}

          {lots.map((lot, i) => (
            <LotRow
              key={lot.key}
              lot={lot}
              index={i}
              items={clientItems}
              canRemove={lots.length > 1}
              clientId={clientId}
              supplierId={supplierId}
              onUpdate={updateLot}
              onRemove={removeLot}
              onItemCreated={handleItemCreated}
              extractedDescription={extractedDescriptions[lot.key]}
            />
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={addLot}
          >
            + Add Another Lot
          </Button>
        </CardContent>
      </Card>

      {/* ── Submit ───────────────────────────────────────────────────── */}
      {submitError && (
        <p className="text-sm text-destructive">{submitError}</p>
      )}

      {!isValid && !submitting && (
        <p className="text-xs text-muted-foreground">
          {!clientId
            ? "Select a client to continue."
            : Object.keys(lotErrors).length > 0
              ? `Complete required fields: ${Object.values(lotErrors).flat().filter((v, i, a) => a.indexOf(v) === i).join(", ")}.`
              : ""}
        </p>
      )}

      <div className="flex justify-end gap-3 pb-8">
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/receiving")}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!isValid || submitting}>
          {submitting
            ? "Saving…"
            : `Submit Receipt (${lots.length} lot${lots.length !== 1 ? "s" : ""})`}
        </Button>
      </div>
    </div>
  );
}

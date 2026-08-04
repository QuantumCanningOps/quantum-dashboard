"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Pencil } from "lucide-react";
import {
  updateProductionOrder,
  type ProductionOrderStatus,
} from "../../production-orders/actions";

export type SkuOption = {
  id: string;
  code: string;
  name: string;
  formula_id: string | null;
};

export type FormulaOption = {
  id: string;
  formula_number: string | null;
  name: string | null;
  version: number;
  status: string;
};

export type EditableProductionOrderProps = {
  orderId: string;
  orderNumber: string;
  status: ProductionOrderStatus;
  skuId: string;
  formulaId: string | null;
  orderedQuantity: number;
  unitOfMeasure: string;
  actualQuantity: number | null;
  notes: string | null;
  skus: SkuOption[];
  formulas: FormulaOption[];
};

const STATUSES: { value: ProductionOrderStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
  { value: "cancelled", label: "Cancelled" },
];

const UOM_OPTIONS = [
  "gallons",
  "liters",
  "cases",
  "trays",
  "cans",
  "each",
] as const;

const SEL =
  "flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const OPT = "bg-background text-foreground";

function formulaLabel(formula: FormulaOption): string {
  const name = formula.name?.trim() || "Untitled";
  const number = formula.formula_number?.trim();
  return number
    ? `${name} · ${number} · v${formula.version}`
    : `${name} · v${formula.version}`;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "pending":
      return "bg-gray-100 text-gray-600 border-gray-200";
    case "scheduled":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "in_progress":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "complete":
      return "bg-green-100 text-green-800 border-green-200";
    case "cancelled":
      return "bg-red-50 text-red-600 border-red-200";
    default:
      return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

function statusLabel(status: string): string {
  return STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function EditableProductionOrder({
  orderId,
  orderNumber,
  status,
  skuId,
  formulaId,
  orderedQuantity,
  unitOfMeasure,
  actualQuantity,
  notes,
  skus,
  formulas,
}: EditableProductionOrderProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [current, setCurrent] = useState({
    orderNumber,
    status,
    skuId,
    formulaId: formulaId ?? "",
    orderedQuantity: String(orderedQuantity),
    unitOfMeasure,
    actualQuantity:
      actualQuantity != null && Number.isFinite(actualQuantity)
        ? String(actualQuantity)
        : "",
    notes: notes ?? "",
  });

  const [draft, setDraft] = useState(current);

  useEffect(() => {
    const next = {
      orderNumber,
      status,
      skuId,
      formulaId: formulaId ?? "",
      orderedQuantity: String(orderedQuantity),
      unitOfMeasure,
      actualQuantity:
        actualQuantity != null && Number.isFinite(actualQuantity)
          ? String(actualQuantity)
          : "",
      notes: notes ?? "",
    };
    setCurrent(next);
    if (!isEditing) setDraft(next);
  }, [
    orderNumber,
    status,
    skuId,
    formulaId,
    orderedQuantity,
    unitOfMeasure,
    actualQuantity,
    notes,
    isEditing,
  ]);

  const selectedSku = useMemo(
    () => skus.find((sku) => sku.id === (isEditing ? draft.skuId : current.skuId)),
    [skus, isEditing, draft.skuId, current.skuId],
  );
  const selectedFormula = useMemo(
    () =>
      formulas.find(
        (formula) =>
          formula.id === (isEditing ? draft.formulaId : current.formulaId),
      ),
    [formulas, isEditing, draft.formulaId, current.formulaId],
  );

  function startEditing() {
    setDraft(current);
    setError(null);
    setIsEditing(true);
  }

  function handleSkuChange(nextSkuId: string) {
    const sku = skus.find((s) => s.id === nextSkuId);
    setDraft((prev) => ({
      ...prev,
      skuId: nextSkuId,
      formulaId:
        sku?.formula_id && formulas.some((f) => f.id === sku.formula_id)
          ? sku.formula_id
          : prev.formulaId,
    }));
  }

  async function handleSave() {
    const qty = Number(draft.orderedQuantity);
    const actual =
      draft.actualQuantity.trim() === ""
        ? null
        : Number(draft.actualQuantity);

    setSaving(true);
    setError(null);
    const result = await updateProductionOrder({
      id: orderId,
      orderNumber: draft.orderNumber,
      status: draft.status,
      skuId: draft.skuId,
      formulaId: draft.formulaId,
      orderedQuantity: qty,
      unitOfMeasure: draft.unitOfMeasure,
      actualQuantity: actual,
      notes: draft.notes.trim() || null,
    });

    if (!result.success) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setCurrent({
      ...draft,
      notes: draft.notes.trim(),
    });
    setSaving(false);
    setIsEditing(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Order details</CardTitle>
          {!isEditing && (
            <Badge className={statusBadgeClass(current.status)}>
              {statusLabel(current.status)}
            </Badge>
          )}
        </div>
        {!isEditing && (
          <button
            type="button"
            onClick={startEditing}
            aria-label="Edit production order"
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isEditing ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="po-order-number">Order number</Label>
                <Input
                  id="po-order-number"
                  value={draft.orderNumber}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      orderNumber: event.target.value,
                    }))
                  }
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="po-status">Status</Label>
                <select
                  id="po-status"
                  className={SEL}
                  value={draft.status}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      status: event.target.value as ProductionOrderStatus,
                    }))
                  }
                >
                  {STATUSES.map((option) => (
                    <option key={option.value} className={OPT} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="po-sku">SKU</Label>
                <select
                  id="po-sku"
                  className={SEL}
                  value={draft.skuId}
                  onChange={(event) => handleSkuChange(event.target.value)}
                >
                  <option className={OPT} value="">
                    Select SKU…
                  </option>
                  {skus.map((sku) => (
                    <option key={sku.id} className={OPT} value={sku.id}>
                      {sku.code} — {sku.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="po-formula">Formula</Label>
                <select
                  id="po-formula"
                  className={SEL}
                  value={draft.formulaId}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      formulaId: event.target.value,
                    }))
                  }
                >
                  <option className={OPT} value="">
                    Select formula…
                  </option>
                  {formulas.map((formula) => (
                    <option key={formula.id} className={OPT} value={formula.id}>
                      {formulaLabel(formula)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="po-ordered-qty">Ordered quantity</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="po-ordered-qty"
                    type="text"
                    inputMode="decimal"
                    value={draft.orderedQuantity}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        orderedQuantity: event.target.value,
                      }))
                    }
                    className="min-w-0 flex-1 basis-0 bg-background text-foreground"
                    autoComplete="off"
                  />
                  <select
                    aria-label="Unit of measure"
                    className="flex h-9 w-28 shrink-0 rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={draft.unitOfMeasure}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        unitOfMeasure: event.target.value,
                      }))
                    }
                  >
                    {!UOM_OPTIONS.includes(
                      draft.unitOfMeasure as (typeof UOM_OPTIONS)[number],
                    ) &&
                      draft.unitOfMeasure && (
                        <option className={OPT} value={draft.unitOfMeasure}>
                          {draft.unitOfMeasure}
                        </option>
                      )}
                    {UOM_OPTIONS.map((uom) => (
                      <option key={uom} className={OPT} value={uom}>
                        {uom}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="po-actual-qty">Actual quantity</Label>
                <Input
                  id="po-actual-qty"
                  type="text"
                  inputMode="decimal"
                  value={draft.actualQuantity}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      actualQuantity: event.target.value,
                    }))
                  }
                  placeholder="Optional"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="po-notes">Notes</Label>
              <textarea
                id="po-notes"
                rows={3}
                value={draft.notes}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, notes: event.target.value }))
                }
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Optional client-facing notes"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setError(null);
                  setDraft(current);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Order number</dt>
              <dd className="mt-0.5 font-mono font-medium">
                {current.orderNumber}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">SKU</dt>
              <dd className="mt-0.5">
                {selectedSku ? (
                  <>
                    <span className="font-medium">{selectedSku.name}</span>
                    <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                      {selectedSku.code}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Formula</dt>
              <dd className="mt-0.5">
                {selectedFormula ? formulaLabel(selectedFormula) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ordered</dt>
              <dd className="mt-0.5 tabular-nums">
                {Number(current.orderedQuantity).toLocaleString()}{" "}
                <span className="text-muted-foreground">
                  {current.unitOfMeasure}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Actual</dt>
              <dd className="mt-0.5 tabular-nums">
                {current.actualQuantity !== "" ? (
                  <>
                    {Number(current.actualQuantity).toLocaleString()}{" "}
                    <span className="text-muted-foreground">
                      {current.unitOfMeasure}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Notes</dt>
              <dd className="mt-0.5 text-muted-foreground">
                {current.notes.trim() || "No notes"}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

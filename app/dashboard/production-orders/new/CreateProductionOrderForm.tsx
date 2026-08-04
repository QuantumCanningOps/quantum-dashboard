"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createProductionOrder } from "../actions";

export type ClientOption = { id: string; name: string; code: string };
export type SkuOption = {
  id: string;
  client_id: string;
  code: string;
  name: string;
  formula_id: string | null;
};
export type FormulaOption = {
  id: string;
  client_id: string;
  formula_number: string | null;
  name: string | null;
  version: number;
  status: string;
  base_unit_of_measure: string;
};

const SEL =
  "flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const OPT = "bg-background text-foreground";

const UOM_OPTIONS = [
  "gallons",
  "liters",
  "cases",
  "trays",
  "cans",
  "each",
] as const;

function formulaLabel(formula: FormulaOption): string {
  const name = formula.name?.trim() || "Untitled";
  const number = formula.formula_number?.trim();
  return number
    ? `${name} · ${number} · v${formula.version}`
    : `${name} · v${formula.version}`;
}

function suggestOrderNumber(
  clientCode: string,
  existingNumbers: string[],
): string {
  const year = new Date().getFullYear();
  const prefix = `${clientCode}-PO-${year}-`;
  let max = 0;
  for (const number of existingNumbers) {
    if (!number.startsWith(prefix)) continue;
    const suffix = number.slice(prefix.length);
    const n = Number.parseInt(suffix, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

type Props = {
  clients: ClientOption[];
  skus: SkuOption[];
  formulas: FormulaOption[];
  orderNumbersByClient: Record<string, string[]>;
  defaultClientId: string;
  defaultSkuId: string;
  defaultFormulaId: string;
  defaultOrderedQuantity?: string;
  defaultUnitOfMeasure?: string;
  lockClient?: boolean;
  lockFormula?: boolean;
};

export function CreateProductionOrderForm({
  clients,
  skus,
  formulas,
  orderNumbersByClient,
  defaultClientId,
  defaultSkuId,
  defaultFormulaId,
  defaultOrderedQuantity = "",
  defaultUnitOfMeasure = "",
  lockClient = false,
  lockFormula = false,
}: Props) {
  const router = useRouter();
  const [clientId, setClientId] = useState(defaultClientId);
  const [skuId, setSkuId] = useState(defaultSkuId);
  const [formulaId, setFormulaId] = useState(defaultFormulaId);
  const [orderNumber, setOrderNumber] = useState(() => {
    const client = clients.find((c) => c.id === defaultClientId);
    if (!client) return "";
    return suggestOrderNumber(
      client.code,
      orderNumbersByClient[defaultClientId] ?? [],
    );
  });
  const [orderedQuantity, setOrderedQuantity] = useState(
    defaultOrderedQuantity,
  );
  const [unitOfMeasure, setUnitOfMeasure] = useState(() => {
    if (defaultUnitOfMeasure) return defaultUnitOfMeasure;
    const formula = formulas.find((f) => f.id === defaultFormulaId);
    return formula?.base_unit_of_measure || "gallons";
  });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientSkus = useMemo(
    () => skus.filter((sku) => sku.client_id === clientId),
    [skus, clientId],
  );

  const clientFormulas = useMemo(
    () => formulas.filter((formula) => formula.client_id === clientId),
    [formulas, clientId],
  );

  const skuChoices = useMemo(() => {
    if (!formulaId) return clientSkus;
    const linked = clientSkus.filter((sku) => sku.formula_id === formulaId);
    return linked.length > 0 ? linked : clientSkus;
  }, [clientSkus, formulaId]);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  const selectedSku = skus.find((s) => s.id === skuId) ?? null;
  const selectedFormula = formulas.find((f) => f.id === formulaId) ?? null;

  const quantity = Number(orderedQuantity);
  const isValid =
    !!clientId &&
    !!skuId &&
    !!formulaId &&
    !!orderNumber.trim() &&
    !!unitOfMeasure.trim() &&
    Number.isFinite(quantity) &&
    quantity > 0;

  function handleClientChange(nextClientId: string) {
    setClientId(nextClientId);
    setError(null);

    const nextSkus = skus.filter((sku) => sku.client_id === nextClientId);
    const nextFormulas = formulas.filter(
      (formula) => formula.client_id === nextClientId,
    );

    const keepSku = nextSkus.some((sku) => sku.id === skuId);
    const nextSkuId = keepSku ? skuId : (nextSkus[0]?.id ?? "");
    setSkuId(nextSkuId);

    const skuFormulaId =
      nextSkus.find((sku) => sku.id === nextSkuId)?.formula_id ?? null;
    const keepFormula =
      lockFormula && nextFormulas.some((formula) => formula.id === formulaId);
    const nextFormulaId = keepFormula
      ? formulaId
      : skuFormulaId && nextFormulas.some((f) => f.id === skuFormulaId)
        ? skuFormulaId
        : (nextFormulas[0]?.id ?? "");
    setFormulaId(nextFormulaId);

    const formula = nextFormulas.find((f) => f.id === nextFormulaId);
    if (formula?.base_unit_of_measure) {
      setUnitOfMeasure(formula.base_unit_of_measure);
    }

    const client = clients.find((c) => c.id === nextClientId);
    if (client) {
      setOrderNumber(
        suggestOrderNumber(
          client.code,
          orderNumbersByClient[nextClientId] ?? [],
        ),
      );
    } else {
      setOrderNumber("");
    }
  }

  function handleSkuChange(nextSkuId: string) {
    setSkuId(nextSkuId);
    setError(null);
    if (lockFormula) return;

    const sku = skus.find((s) => s.id === nextSkuId);
    if (!sku?.formula_id) return;
    if (!clientFormulas.some((f) => f.id === sku.formula_id)) return;

    setFormulaId(sku.formula_id);
    const formula = clientFormulas.find((f) => f.id === sku.formula_id);
    if (formula?.base_unit_of_measure) {
      setUnitOfMeasure(formula.base_unit_of_measure);
    }
  }

  function handleFormulaChange(nextFormulaId: string) {
    setFormulaId(nextFormulaId);
    setError(null);

    const formula = clientFormulas.find((f) => f.id === nextFormulaId);
    if (formula?.base_unit_of_measure) {
      setUnitOfMeasure(formula.base_unit_of_measure);
    }

    const linkedSku = clientSkus.find(
      (sku) => sku.formula_id === nextFormulaId,
    );
    if (linkedSku) {
      setSkuId(linkedSku.id);
    }
  }

  async function handleSubmit() {
    if (!isValid) return;
    setSaving(true);
    setError(null);

    const result = await createProductionOrder({
      clientId,
      skuId,
      formulaId,
      orderNumber,
      orderedQuantity: quantity,
      unitOfMeasure,
      notes: notes.trim() || null,
    });

    if (!result.success) {
      setError(result.error);
      setSaving(false);
      return;
    }

    router.push(`/dashboard/production/${result.id}`);
    router.refresh();
  }

  return (
    <form
      className="flex max-w-2xl flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="flex flex-col gap-2">
        <Link
          href={
            defaultClientId
              ? `/dashboard/clients/${defaultClientId}`
              : "/dashboard/production-orders"
          }
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Cancel
        </Link>
        <h1 className="text-2xl font-bold">New Production Order</h1>
        <p className="text-sm text-muted-foreground">
          Capture what the client ordered. Scheduling and batches come later.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client">Client</Label>
            <select
              id="client"
              className={SEL}
              value={clientId}
              disabled={lockClient || clients.length === 0}
              onChange={(event) => handleClientChange(event.target.value)}
            >
              <option className={OPT} value="">
                Select client…
              </option>
              {clients.map((client) => (
                <option key={client.id} className={OPT} value={client.id}>
                  {client.name} ({client.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sku">SKU</Label>
            <select
              id="sku"
              className={SEL}
              value={skuId}
              disabled={!clientId || skuChoices.length === 0}
              onChange={(event) => handleSkuChange(event.target.value)}
            >
              <option className={OPT} value="">
                {clientId
                  ? skuChoices.length === 0
                    ? "No SKUs for this client"
                    : "Select SKU…"
                  : "Select a client first"}
              </option>
              {skuChoices.map((sku) => (
                <option key={sku.id} className={OPT} value={sku.id}>
                  {sku.code} — {sku.name}
                </option>
              ))}
            </select>
            {selectedSku &&
              selectedSku.formula_id &&
              formulaId &&
              selectedSku.formula_id !== formulaId && (
                <p className="text-xs text-amber-700">
                  This SKU is linked to a different formula. Confirm the formula
                  below is correct for this order.
                </p>
              )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="formula">Formula</Label>
            <select
              id="formula"
              className={SEL}
              value={formulaId}
              disabled={
                lockFormula || !clientId || clientFormulas.length === 0
              }
              onChange={(event) => handleFormulaChange(event.target.value)}
            >
              <option className={OPT} value="">
                {clientId
                  ? clientFormulas.length === 0
                    ? "No formulas for this client"
                    : "Select formula…"
                  : "Select a client first"}
              </option>
              {clientFormulas.map((formula) => (
                <option key={formula.id} className={OPT} value={formula.id}>
                  {formulaLabel(formula)}
                  {formula.status !== "authorized" ? ` (${formula.status})` : ""}
                </option>
              ))}
            </select>
            {selectedFormula && selectedFormula.status !== "authorized" && (
              <p className="text-xs text-amber-700">
                Formula status is {selectedFormula.status}. Production usually
                uses an authorized formula.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="orderNumber">Order number</Label>
              <Input
                id="orderNumber"
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value)}
                placeholder={
                  selectedClient
                    ? `${selectedClient.code}-PO-${new Date().getFullYear()}-001`
                    : "CLIENT-PO-YYYY-001"
                }
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="orderedQuantity">Ordered quantity</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="orderedQuantity"
                  type="text"
                  inputMode="decimal"
                  value={orderedQuantity}
                  onChange={(event) => setOrderedQuantity(event.target.value)}
                  placeholder="500"
                  autoComplete="off"
                  className="min-w-0 flex-1 basis-0 bg-background text-foreground"
                />
                <select
                  aria-label="Unit of measure"
                  className="flex h-9 w-28 shrink-0 rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={unitOfMeasure}
                  onChange={(event) => setUnitOfMeasure(event.target.value)}
                >
                  {!UOM_OPTIONS.includes(
                    unitOfMeasure as (typeof UOM_OPTIONS)[number],
                  ) &&
                    unitOfMeasure && (
                      <option className={OPT} value={unitOfMeasure}>
                        {unitOfMeasure}
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
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Optional client-facing notes"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!isValid || saving}>
              {saving ? "Creating…" : "Create production order"}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link
                href={
                  defaultClientId
                    ? `/dashboard/clients/${defaultClientId}`
                    : "/dashboard/production-orders"
                }
              >
                Cancel
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

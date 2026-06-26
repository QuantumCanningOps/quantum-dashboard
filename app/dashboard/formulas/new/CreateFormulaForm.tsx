"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type NewItemResult } from "../../receiving/actions";
import {
  SEL,
  OPT,
  LineRow,
  NewSkuForm,
  newLineDraft,
  type ItemOption,
  type SkuOption,
  type LineType,
  type LineDraft,
} from "../shared";
import {
  createClientRecord,
  createFormula,
  type NewClientResult,
  type NewSkuResult,
} from "./actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClientOption = { id: string; name: string; code: string };

type ArtworkDraft = { key: string; file: File };

const STATUSES: { value: "draft" | "pending_authorization"; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "pending_authorization", label: "Pending Authorization" },
];

// ---------------------------------------------------------------------------
// NewClientForm — inline panel shown when "Create new client" is selected
// ---------------------------------------------------------------------------

function NewClientForm({
  onCreated,
  onCancel,
}: {
  onCreated: (client: NewClientResult) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = !!name.trim() && !!code.trim();

  async function handleSave() {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    const result = await createClientRecord({ name, code });
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
        <span className="text-xs font-semibold text-blue-800 dark:text-blue-200">New Client</span>
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
            placeholder="e.g. Acme Beverage Co."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Code *</Label>
          <Input
            placeholder="e.g. ACME"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button type="submit" size="sm" disabled={!isValid || saving}>
        {saving ? "Saving…" : "Save Client"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

export function CreateFormulaForm({
  clients: initialClients,
  items: initialItems,
  skus: initialSkus,
}: {
  clients: ClientOption[];
  items: ItemOption[];
  skus: SkuOption[];
}) {
  const router = useRouter();
  const formulaLinesRequestId = useRef(0);

  // Clients — seeded from server, extended client-side when a new one is created.
  // Server actions below call revalidatePath, which can refresh initialClients
  // out from under us with the same row extraClients already has — dedupe by id.
  const [extraClients, setExtraClients] = useState<ClientOption[]>([]);
  const allClients = [
    ...initialClients,
    ...extraClients.filter((c) => !initialClients.some((ic) => ic.id === c.id)),
  ];
  const [creatingClient, setCreatingClient] = useState(false);

  // SKUs — seeded from server, extended client-side when a new one is created.
  // Same revalidatePath caveat as allClients above — dedupe by id.
  const [extraSkus, setExtraSkus] = useState<SkuOption[]>([]);
  const allSkus = [
    ...initialSkus,
    ...extraSkus.filter((s) => !initialSkus.some((is) => is.id === s.id)),
  ];
  const [creatingSku, setCreatingSku] = useState(false);

  // Formula identity
  const [clientId, setClientId] = useState("");
  const [skuId, setSkuId] = useState("");
  const [formulaNumber, setFormulaNumber] = useState("");
  const [name, setName] = useState("");
  const [baseQuantity, setBaseQuantity] = useState("");
  const [baseUnitOfMeasure, setBaseUnitOfMeasure] = useState("");
  const [batchingInstructions, setBatchingInstructions] = useState("");
  const [status, setStatus] = useState<"draft" | "pending_authorization">("draft");

  // Items — seeded from server, extended client-side when new ones are created.
  // Same revalidatePath caveat as allClients above — dedupe by id.
  const [extraItems, setExtraItems] = useState<ItemOption[]>([]);
  const allItems = [
    ...initialItems,
    ...extraItems.filter((i) => !initialItems.some((ii) => ii.id === i.id)),
  ];

  // Formula lines
  const [lines, setLines] = useState<LineDraft[]>([newLineDraft("ingredient")]);
  const [loadingFormulaLines, setLoadingFormulaLines] = useState(false);

  // Documents
  const [paLetterFile, setPaLetterFile] = useState<File | null>(null);
  const [artworkFiles, setArtworkFiles] = useState<ArtworkDraft[]>([]);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function handleClientChange(value: string) {
    if (value === "__new__") {
      setCreatingClient(true);
      return;
    }
    setCreatingClient(false);
    setClientId(value);
    setCreatingSku(false);
    setSkuId("");
  }

  function handleClientCreated(client: NewClientResult) {
    setCreatingClient(false);
    setExtraClients((prev) => [...prev, client]);
    setClientId(client.id);
    setCreatingSku(false);
    setSkuId("");
  }

  function handleItemCreated(item: NewItemResult) {
    setExtraItems((prev) => [...prev, item]);
  }

  async function handleSkuChange(value: string) {
    const requestId = ++formulaLinesRequestId.current;
    if (value === "__new__") {
      setCreatingSku(true);
      setLoadingFormulaLines(false);
      return;
    }
    setCreatingSku(false);
    setSkuId(value);
    setSubmitError(null);

    const selectedSku = allSkus.find((s) => s.id === value);
    if (!selectedSku?.formula_id) {
      setLoadingFormulaLines(false);
      return;
    }

    setLoadingFormulaLines(true);
    const supabase = createClient();
    type FormulaLineRow = { id: string; item_id: string; line_type: string; quantity: number; unit_of_measure: string; quantity_basis: string };

    let data: FormulaLineRow[] | null = null;
    let errorMessage: string | null = null;

    try {
      const { data: fetched, error } = await supabase
        .from("formula_lines")
        .select("id, item_id, line_type, quantity, unit_of_measure, quantity_basis")
        .eq("formula_id", selectedSku.formula_id)
        .order("line_type")
        .order("quantity", { ascending: false });

    if (requestId !== formulaLinesRequestId.current) {
      return;
    }

      if (error) {
        errorMessage = error.message;
      } else {
        data = fetched as FormulaLineRow[] | null;
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : "Failed to load formula lines";
    } finally {
      setLoadingFormulaLines(false);
    }

    if (errorMessage) {
      setSubmitError(errorMessage);
      return;
    }
    if (!data || data.length === 0) {
      return;
    }

    setLines(
      data.map((line) => ({
        key: line.id,
        lineType: line.line_type as LineType,
        itemId: line.item_id,
        quantity: String(line.quantity),
        unitOfMeasure: line.unit_of_measure,
        quantityBasis: line.quantity_basis as LineDraft["quantityBasis"],
      }))
    );
  }

  function handleSkuCreated(sku: NewSkuResult) {
    setCreatingSku(false);
    setExtraSkus((prev) => [...prev, sku]);
    setSkuId(sku.id);
  }

  // ── Line management ──────────────────────────────────────────────────────

  const updateLine = useCallback((key: string, updates: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...updates } : l)));
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  function addLine(lineType: LineType = "ingredient") {
    setLines((prev) => [...prev, newLineDraft(lineType)]);
  }

  // ── Artwork file management ──────────────────────────────────────────────

  function addArtworkFile(file: File) {
    setArtworkFiles((prev) => [...prev, { key: crypto.randomUUID(), file }]);
  }

  function removeArtworkFile(key: string) {
    setArtworkFiles((prev) => prev.filter((a) => a.key !== key));
  }

  // ── Validation ────────────────────────────────────────────────────────────

  const lineErrors: Record<string, string[]> = {};
  for (const line of lines) {
    const errs: string[] = [];
    if (!line.itemId) errs.push("item");
    if (!line.quantity || Number(line.quantity) <= 0) errs.push("quantity");
    if (!line.unitOfMeasure.trim()) errs.push("unit");
    if (errs.length > 0) lineErrors[line.key] = errs;
  }

  const isValid =
    !!clientId &&
    !!baseQuantity &&
    Number(baseQuantity) > 0 &&
    !!baseUnitOfMeasure.trim() &&
    lines.length > 0 &&
    Object.keys(lineErrors).length === 0;

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!isValid) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const supabase = createClient();

      let paLetter: { fileName: string; storagePath: string } | null = null;
      if (paLetterFile) {
        const uuid = crypto.randomUUID();
        const path = `${clientId}/pa_letter/${uuid}/${paLetterFile.name}`;
        const { error } = await supabase.storage.from("documents").upload(path, paLetterFile);
        if (error) throw new Error(error.message);
        paLetter = { fileName: paLetterFile.name, storagePath: path };
      }

      const artworkUploads = await Promise.all(
        artworkFiles.map(async ({ file }) => {
          const uuid = crypto.randomUUID();
          const path = `${clientId}/artwork/${uuid}/${file.name}`;
          const { error } = await supabase.storage.from("documents").upload(path, file);
          if (error) throw new Error(error.message);
          return { fileName: file.name, storagePath: path };
        })
      );

      const result = await createFormula({
        clientId,
        skuId: skuId || null,
        formulaNumber: formulaNumber.trim() || null,
        name: name.trim() || null,
        baseQuantity: Number(baseQuantity),
        baseUnitOfMeasure: baseUnitOfMeasure.trim(),
        batchingInstructions: batchingInstructions.trim() || null,
        status,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          lineType: l.lineType,
          quantity: Number(l.quantity),
          unitOfMeasure: l.unitOfMeasure.trim(),
          quantityBasis: l.quantityBasis,
        })),
        paLetter,
        artworkFiles: artworkUploads,
      });

      if (!result.success) {
        setSubmitError(result.error);
        return;
      }

      router.push(`/dashboard/formulas/${result.id}`);
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
        <h1 className="text-2xl font-bold">New Formula</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/dashboard/clients")}
        >
          Cancel
        </Button>
      </div>

      {/* ── Formula Identity ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Formula Identity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client">Client *</Label>
            <select
              id="client"
              className={SEL}
              value={creatingClient ? "__new__" : clientId}
              onChange={(e) => handleClientChange(e.target.value)}
            >
              <option value="" className={OPT}>Select client…</option>
              {allClients.map((c) => (
                <option key={c.id} value={c.id} className={OPT}>
                  {c.code} — {c.name}
                </option>
              ))}
              <option disabled className={OPT}>──────────</option>
              <option value="__new__" className={OPT}>+ Create new client…</option>
            </select>
          </div>

          {creatingClient && (
            <NewClientForm
              onCreated={handleClientCreated}
              onCancel={() => setCreatingClient(false)}
            />
          )}

          {clientId && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sku">SKU</Label>
              <select
                id="sku"
                className={SEL}
                value={creatingSku ? "__new__" : skuId}
                onChange={(e) => {
                  void handleSkuChange(e.target.value);
                }}
              >
                <option value="" className={OPT}>Select SKU…</option>
                {allSkus
                  .filter((s) => s.client_id === clientId)
                  .map((s) => (
                    <option key={s.id} value={s.id} className={OPT}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                <option disabled className={OPT}>──────────</option>
                <option value="__new__" className={OPT}>+ Create new SKU…</option>
              </select>
            </div>
          )}

          {creatingSku && (
            <NewSkuForm
              clientId={clientId}
              onCreated={handleSkuCreated}
              onCancel={() => setCreatingSku(false)}
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="formula-number">Formula Number</Label>
              <Input
                id="formula-number"
                placeholder="e.g. ACME-F004"
                value={formulaNumber}
                onChange={(e) => setFormulaNumber(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="formula-name">Name</Label>
              <Input
                id="formula-name"
                placeholder="e.g. Orange Soda"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="base-quantity">Base Quantity *</Label>
              <Input
                id="base-quantity"
                type="number"
                min="0"
                step="any"
                placeholder="1000"
                value={baseQuantity}
                onChange={(e) => setBaseQuantity(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="base-unit">Base Unit of Measure *</Label>
              <Input
                id="base-unit"
                placeholder="gallons"
                value={baseUnitOfMeasure}
                onChange={(e) => setBaseUnitOfMeasure(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              className={SEL}
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value} className={OPT}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="batching-instructions">Batching Instructions</Label>
            <textarea
              id="batching-instructions"
              className="flex min-h-24 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Optional"
              value={batchingInstructions}
              onChange={(e) => setBatchingInstructions(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Formula Lines ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Formula Lines
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({lines.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!clientId && (
            <p className="text-sm text-muted-foreground">
              Select a client above to filter available ingredients.
            </p>
          )}
          {loadingFormulaLines && (
            <p className="text-sm text-muted-foreground">
              Loading existing formula lines…
            </p>
          )}

          {lines.map((line, i) => (
            <LineRow
              key={line.key}
              line={line}
              index={i}
              items={allItems}
              canRemove={lines.length > 1}
              clientId={clientId}
              onUpdate={updateLine}
              onRemove={removeLine}
              onItemCreated={handleItemCreated}
            />
          ))}

          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => addLine("ingredient")}>
              + Add Ingredient Line
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => addLine("packaging")}>
              + Add Packaging Line
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Documents ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>PA Letter</Label>
            {paLetterFile ? (
              <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-mono truncate flex-1">{paLetterFile.name}</span>
                <button
                  type="button"
                  onClick={() => setPaLetterFile(null)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              </div>
            ) : (
              <Label
                htmlFor="pa-letter-file"
                className="cursor-pointer flex items-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
              >
                <span>Upload PA Letter (PDF or PNG) — optional</span>
                <input
                  id="pa-letter-file"
                  type="file"
                  className="sr-only"
                  accept=".pdf,image/png,image/jpeg"
                  onChange={(e) => setPaLetterFile(e.target.files?.[0] ?? null)}
                />
              </Label>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Can Artwork</Label>
            {artworkFiles.map((a) => (
              <div key={a.key} className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-mono truncate flex-1">{a.file.name}</span>
                <button
                  type="button"
                  onClick={() => removeArtworkFile(a.key)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              </div>
            ))}
            <Label
              htmlFor="artwork-file"
              className="cursor-pointer flex items-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
            >
              <span>+ Add artwork file (PDF or PNG) — optional</span>
              <input
                id="artwork-file"
                type="file"
                className="sr-only"
                accept=".pdf,image/png,image/jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) addArtworkFile(file);
                  e.target.value = "";
                }}
              />
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* ── Submit ───────────────────────────────────────────────────── */}
      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      {!isValid && !submitting && (
        <p className="text-xs text-muted-foreground">
          {!clientId
            ? "Select a client to continue."
            : !baseQuantity || Number(baseQuantity) <= 0
              ? "Enter a base quantity."
              : !baseUnitOfMeasure.trim()
                ? "Enter a base unit of measure."
                : Object.keys(lineErrors).length > 0
                  ? `Complete required fields: ${Object.values(lineErrors).flat().filter((v, i, a) => a.indexOf(v) === i).join(", ")}.`
                  : ""}
        </p>
      )}

      <div className="flex justify-end gap-3 pb-8">
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/clients")}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!isValid || submitting}>
          {submitting ? "Saving…" : "Create Formula"}
        </Button>
      </div>
    </div>
  );
}

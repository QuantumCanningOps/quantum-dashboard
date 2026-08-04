"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GoogleDrivePickerButton } from "@/components/GoogleDrivePickerButton";
import {
  DEFAULT_DENSITY_LBS_PER_GALLON,
  normalizeSheetUnit,
} from "@/lib/formula-batching";
import { matchItemByDescription } from "@/lib/match-item";
import { randomId } from "@/lib/utils";
import { type NewItemResult } from "../../receiving/actions";
import {
  SEL,
  OPT,
  LineRow,
  NewSkuForm,
  newLineDraft,
  itemTypeForLine,
  type ItemOption,
  type SkuOption,
  type LineType,
  type LineDraft,
  type QuantityBasis,
} from "../shared";
import { createDocumentRecord } from "../../documents/actions";
import {
  updateFormulaSpecs,
  updateSkuPackaging,
  type FormulaSpecInput,
  type SkuPackagingLineInput,
} from "../[id]/actions";
import {
  createClientRecord,
  createFormula,
  extractFromFormulaPdf,
  type ExtractedFormulaLine,
  type NewClientResult,
  type NewSkuResult,
} from "./actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClientOption = { id: string; name: string; code: string };

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
  defaultClientId = "",
  defaultSkuId = "",
  defaultName = "",
}: {
  clients: ClientOption[];
  items: ItemOption[];
  skus: SkuOption[];
  defaultClientId?: string;
  defaultSkuId?: string;
  defaultName?: string;
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
  const [clientId, setClientId] = useState(defaultClientId);
  const [skuId, setSkuId] = useState(defaultSkuId);
  const [formulaNumber, setFormulaNumber] = useState("");
  const [name, setName] = useState(defaultName);
  const [baseQuantity, setBaseQuantity] = useState("");
  const [baseUnitOfMeasure, setBaseUnitOfMeasure] = useState("");
  const [densityLbsPerGallon, setDensityLbsPerGallon] = useState(
    String(DEFAULT_DENSITY_LBS_PER_GALLON),
  );
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
  const [extractedDescriptions, setExtractedDescriptions] = useState<
    Record<string, string>
  >({});
  const [pendingSpecs, setPendingSpecs] = useState<FormulaSpecInput[]>([]);
  const [pendingPackagingLines, setPendingPackagingLines] = useState<
    SkuPackagingLineInput[]
  >([]);

  // Formula sheet import
  const [formulaSheetFile, setFormulaSheetFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);

  // Documents
  const [paLetterFile, setPaLetterFile] = useState<File | null>(null);
  const [artworkFile, setArtworkFile] = useState<File | null>(null);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function matchItem(description: string, lineType: LineType): string {
    const wanted = itemTypeForLine[lineType];
    const candidates = allItems.filter(
      (i) =>
        i.item_type === wanted &&
        (!clientId || !i.client_id || i.client_id === clientId)
    );
    return matchItemByDescription(description, candidates);
  }

  function normalizeExtractedLine(raw: ExtractedFormulaLine): {
    lineType: LineType;
    quantity: string;
    unitOfMeasure: string;
    quantityBasis: QuantityBasis;
    itemDescription: string;
  } | null {
    const lineType: LineType =
      raw.lineType === "packaging" ? "packaging" : "ingredient";

    // Server refine already converts Target Weight → per_batch with the sheet
    // Units column (lbs or g). Prefer that; fall back to targetWeight(+Unit).
    const refinedPerBatch =
      raw.quantityBasis === "per_batch" &&
      raw.quantity != null &&
      Number.isFinite(Number(raw.quantity)) &&
      Number(raw.quantity) > 0;

    if (refinedPerBatch) {
      const unit =
        normalizeSheetUnit(raw.unitOfMeasure) ??
        normalizeSheetUnit(raw.targetUnit) ??
        ((raw.unitOfMeasure ?? "").trim() || "lbs");
      return {
        lineType,
        quantity: String(raw.quantity),
        unitOfMeasure: unit === "%" ? "lbs" : unit,
        quantityBasis: "per_batch",
        itemDescription: (raw.itemDescription ?? "").trim(),
      };
    }

    const targetWeight =
      raw.targetWeight != null && Number.isFinite(Number(raw.targetWeight))
        ? Number(raw.targetWeight)
        : raw.targetWeightLbs != null &&
            Number.isFinite(Number(raw.targetWeightLbs))
          ? Number(raw.targetWeightLbs)
          : null;
    if (targetWeight != null && targetWeight > 0) {
      const unit =
        normalizeSheetUnit(raw.targetUnit) ??
        normalizeSheetUnit(raw.unitOfMeasure) ??
        "lbs";
      return {
        lineType,
        quantity: String(targetWeight),
        unitOfMeasure: unit === "%" ? "lbs" : unit,
        quantityBasis: "per_batch",
        itemDescription: (raw.itemDescription ?? "").trim(),
      };
    }

    const quantity =
      raw.quantity != null && Number.isFinite(Number(raw.quantity))
        ? Number(raw.quantity)
        : null;
    if (quantity == null || quantity <= 0) return null;

    const quantityBasis: QuantityBasis =
      raw.quantityBasis === "per_can" ||
      raw.quantityBasis === "percentage" ||
      raw.quantityBasis === "per_batch"
        ? raw.quantityBasis
        : "per_batch";
    const unitOfMeasure =
      quantityBasis === "percentage"
        ? "%"
        : (normalizeSheetUnit(raw.unitOfMeasure) ??
          (raw.unitOfMeasure ?? "").trim());

    return {
      lineType,
      quantity: String(quantity),
      unitOfMeasure,
      quantityBasis,
      itemDescription: (raw.itemDescription ?? "").trim(),
    };
  }

  async function handleExtractFromSheet() {
    if (!formulaSheetFile) return;
    if (!clientId) {
      setExtractNote("Select a client first so extracted ingredients can be matched correctly.");
      return;
    }

    setExtracting(true);
    setExtractNote(null);

    try {
      const fd = new FormData();
      fd.append("file", formulaSheetFile);
      const result = await extractFromFormulaPdf(fd);

      if (!result.ok) {
        setExtractNote(result.message);
        return;
      }

      const { data } = result;
      const notes: string[] = [];

      if (data.formulaNumber) {
        setFormulaNumber(data.formulaNumber);
        notes.push(`formula # ${data.formulaNumber}`);
      }
      if (data.name) {
        setName(data.name);
        notes.push(`name "${data.name}"`);
      }
      if (data.baseQuantity != null && Number(data.baseQuantity) > 0) {
        setBaseQuantity(String(data.baseQuantity));
        notes.push(`batch ${data.baseQuantity}`);
      }
      if (data.baseUnitOfMeasure) {
        setBaseUnitOfMeasure(data.baseUnitOfMeasure);
      }
      if (
        data.densityLbsPerGallon != null &&
        Number(data.densityLbsPerGallon) > 0
      ) {
        setDensityLbsPerGallon(String(data.densityLbsPerGallon));
        notes.push(`density ${data.densityLbsPerGallon}`);
      }
      if (data.batchingInstructions) {
        setBatchingInstructions(data.batchingInstructions);
        notes.push("batching instructions");
      }

      const validLines = (data.lines ?? [])
        .map(normalizeExtractedLine)
        .filter((l): l is NonNullable<typeof l> => l != null);

      const ingredientLines = validLines.filter((l) => l.lineType === "ingredient");
      const packagingExtracted = validLines.filter((l) => l.lineType === "packaging");

      const nextPackaging: SkuPackagingLineInput[] = [];
      for (const l of packagingExtracted) {
        const itemId = l.itemDescription
          ? matchItem(l.itemDescription, "packaging")
          : "";
        if (!itemId) continue;
        const matchedItem = allItems.find((i) => i.id === itemId);
        const isTray = (l.itemDescription ?? "").toLowerCase().includes("tray");
        nextPackaging.push({
          itemId,
          quantity: Number(l.quantity),
          unitOfMeasure:
            l.unitOfMeasure || matchedItem?.unit_of_measure || "each",
          quantityBasis: isTray
            ? "per_tray"
            : l.quantityBasis === "per_can"
              ? "per_can"
              : "per_unit",
        });
      }
      setPendingPackagingLines(nextPackaging);
      if (nextPackaging.length > 0) {
        notes.push(`${nextPackaging.length} packaging component(s)`);
      }

      if (ingredientLines.length > 0) {
        // Replace existing lines — re-extract should refresh, not duplicate.
        const newLines: LineDraft[] = ingredientLines.map((l) => {
          const itemId = l.itemDescription
            ? matchItem(l.itemDescription, "ingredient")
            : "";
          const matchedItem = itemId
            ? allItems.find((i) => i.id === itemId)
            : null;
          return {
            key: randomId(),
            lineType: "ingredient" as const,
            itemId,
            quantity: l.quantity,
            unitOfMeasure:
              l.quantityBasis === "percentage"
                ? "%"
                : l.unitOfMeasure || matchedItem?.unit_of_measure || "",
            quantityBasis: l.quantityBasis,
          };
        });

        const descMap: Record<string, string> = {};
        ingredientLines.forEach((l, i) => {
          if (l.itemDescription && newLines[i]) {
            descMap[newLines[i].key] = l.itemDescription;
          }
        });
        setExtractedDescriptions(descMap);
        setLines(newLines);

        const matchedCount = newLines.filter((l) => l.itemId).length;
        const unmatched = newLines.length - matchedCount;
        notes.push(
          `${newLines.length} line${newLines.length !== 1 ? "s" : ""} extracted` +
            (unmatched > 0
              ? ` (${matchedCount} item${matchedCount !== 1 ? "s" : ""} matched, ${unmatched} need selection)`
              : " (all items matched)")
        );
      }

      const specs: FormulaSpecInput[] = (data.specs ?? [])
        .filter((s) => !!s.name?.trim())
        .map((s) => ({
          name: s.name!.trim(),
          targetValue: s.targetValue ?? null,
          minValue: s.minValue ?? null,
          maxValue: s.maxValue ?? null,
          unit: s.unit ?? null,
          notes: s.notes ?? null,
        }));
      setPendingSpecs(specs);
      if (specs.length > 0) {
        notes.push(
          `${specs.length} spec${specs.length !== 1 ? "s" : ""} will be saved on create`
        );
      }

      setExtractNote(
        notes.length > 0
          ? `Extracted: ${notes.join("; ")}.`
          : "Sheet scanned but no data found — fill in fields manually."
      );
    } finally {
      setExtracting(false);
    }
  }

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
      data
        .filter((line) => line.line_type === "ingredient")
        .map((line) => ({
          key: line.id,
          lineType: "ingredient" as const,
          itemId: line.item_id,
          quantity: String(line.quantity),
          unitOfMeasure: line.unit_of_measure,
          quantityBasis: line.quantity_basis as LineDraft["quantityBasis"],
        })),
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
        const uuid = randomId();
        const path = `${clientId}/pa_letter/${uuid}/${paLetterFile.name}`;
        const { error } = await supabase.storage.from("documents").upload(path, paLetterFile);
        if (error) throw new Error(error.message);
        paLetter = { fileName: paLetterFile.name, storagePath: path };
      }

      let artwork: { fileName: string; storagePath: string } | null = null;
      if (artworkFile) {
        const uuid = randomId();
        const path = `${clientId}/artwork/${uuid}/${artworkFile.name}`;
        const { error } = await supabase.storage
          .from("documents")
          .upload(path, artworkFile);
        if (error) throw new Error(error.message);
        artwork = { fileName: artworkFile.name, storagePath: path };
      }

      const density = Number(densityLbsPerGallon);
      const result = await createFormula({
        clientId,
        skuId: skuId || null,
        formulaNumber: formulaNumber.trim() || null,
        name: name.trim() || null,
        baseQuantity: Number(baseQuantity),
        baseUnitOfMeasure: baseUnitOfMeasure.trim(),
        batchingInstructions: batchingInstructions.trim() || null,
        status,
        densityLbsPerGallon:
          density > 0 ? density : DEFAULT_DENSITY_LBS_PER_GALLON,
        lines: lines
          .filter((l) => l.lineType === "ingredient")
          .map((l) => ({
            itemId: l.itemId,
            lineType: "ingredient" as const,
            quantity: Number(l.quantity),
            unitOfMeasure: l.unitOfMeasure.trim(),
            quantityBasis: l.quantityBasis,
          })),
        paLetter,
        artworkFiles: artwork ? [artwork] : [],
      });

      if (!result.success) {
        setSubmitError(result.error);
        return;
      }

      const postCreateWarnings: string[] = [];

      if (skuId && pendingPackagingLines.length > 0) {
        const packagingResult = await updateSkuPackaging({
          skuId,
          formulaId: result.id,
          header: {
            cansPerTray: 24,
            canSizeOz: 12,
            canType: "sleek",
            lidColor: "silver",
            secondaryPackaging: "none",
            trayNotes: null,
            lidNotes: null,
            notes: null,
          },
          lines: pendingPackagingLines,
        });
        if (!packagingResult.success) {
          postCreateWarnings.push(
            `packaging failed to save: ${packagingResult.error}`,
          );
        }
      } else if (!skuId && pendingPackagingLines.length > 0) {
        postCreateWarnings.push(
          "packaging components were extracted but no SKU was linked — add them under Packaging on the formula detail",
        );
      }

      if (formulaSheetFile) {
        try {
          const uuid = randomId();
          const path = `${clientId}/spec_sheet/${uuid}/${formulaSheetFile.name}`;
          const { error } = await supabase.storage
            .from("documents")
            .upload(path, formulaSheetFile);
          if (error) throw new Error(error.message);
          await createDocumentRecord({
            clientId,
            documentType: "spec_sheet",
            fileName: formulaSheetFile.name,
            storagePath: path,
            formulaId: result.id,
          });
        } catch (e) {
          postCreateWarnings.push(
            `sheet upload failed: ${e instanceof Error ? e.message : "unknown error"}`
          );
        }
      }

      if (pendingSpecs.length > 0) {
        const specsResult = await updateFormulaSpecs(result.id, pendingSpecs);
        if (!specsResult.success) {
          postCreateWarnings.push(`specs failed to save: ${specsResult.error}`);
        }
      }

      if (postCreateWarnings.length > 0) {
        const warn = encodeURIComponent(
          postCreateWarnings.join("; ").slice(0, 500)
        );
        router.push(`/dashboard/formulas/${result.id}?importWarn=${warn}`);
      } else {
        router.push(`/dashboard/formulas/${result.id}`);
      }
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

      {/* ── Import from formula sheet ────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Import from Formula Sheet</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Upload a batching data sheet (PDF or image) to prefill formula identity,
            lines, batching instructions, and specs. Select a client first, then extract
            and review item matches before saving.
          </p>
          {formulaSheetFile ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-mono truncate flex-1">{formulaSheetFile.name}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void handleExtractFromSheet();
                  }}
                  disabled={extracting || !clientId}
                  title={!clientId ? "Select a client first" : undefined}
                >
                  {extracting ? "Extracting…" : "Extract from sheet"}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setFormulaSheetFile(null);
                    setExtractNote(null);
                  }}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              </div>
              {extractNote && (
                <p className="text-xs text-muted-foreground">{extractNote}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <Label
                htmlFor="formula-sheet-file"
                className="cursor-pointer flex flex-1 items-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
              >
                <span>Upload formula sheet (PDF or PNG) — optional</span>
                <input
                  id="formula-sheet-file"
                  type="file"
                  className="sr-only"
                  accept=".pdf,image/png,image/jpeg"
                  onChange={(e) => {
                    setFormulaSheetFile(e.target.files?.[0] ?? null);
                    setExtractNote(null);
                  }}
                />
              </Label>
              <GoogleDrivePickerButton
                disabled={extracting}
                onFile={(file) => {
                  setFormulaSheetFile(file);
                  setExtractNote(null);
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

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

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="density-lbs-per-gal">Density (lbs/gal)</Label>
              <Input
                id="density-lbs-per-gal"
                type="text"
                inputMode="decimal"
                placeholder="8.4"
                value={densityLbsPerGallon}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d*\.?\d*$/.test(v)) {
                    setDensityLbsPerGallon(v);
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                From the sheet&apos;s density (lbs/gal). Often 8.4; Dappled-style
                sheets use 8.345. This must match the sheet or % and Target
                Weight will disagree.
              </p>
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
              extractedDescription={extractedDescriptions[line.key]}
            />
          ))}

          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => addLine("ingredient")}>
              + Add Ingredient Line
            </Button>
          </div>
          {pendingPackagingLines.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {pendingPackagingLines.length} packaging component
              {pendingPackagingLines.length !== 1 ? "s" : ""} from the sheet
              will be saved to the linked SKU on create.
            </p>
          )}
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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <Label
                  htmlFor="pa-letter-file"
                  className="cursor-pointer flex flex-1 items-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
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
                <GoogleDrivePickerButton
                  onFile={(file) => {
                    setPaLetterFile(file);
                  }}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Can Artwork</Label>
            {artworkFile ? (
              <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-mono truncate flex-1">{artworkFile.name}</span>
                <button
                  type="button"
                  onClick={() => setArtworkFile(null)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <Label
                  htmlFor="artwork-file"
                  className="cursor-pointer flex flex-1 items-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
                >
                  <span>Upload artwork (PDF or PNG) — optional</span>
                  <input
                    id="artwork-file"
                    type="file"
                    className="sr-only"
                    accept=".pdf,image/png,image/jpeg"
                    onChange={(e) =>
                      setArtworkFile(e.target.files?.[0] ?? null)
                    }
                  />
                </Label>
                <GoogleDrivePickerButton
                  onFile={(file) => {
                    setArtworkFile(file);
                  }}
                />
              </div>
            )}
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

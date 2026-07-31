import { createClient } from "@/lib/supabase/server";
import {
  FormulaBatchScaler,
  type FormulaLine,
  type InventoryAvailability,
  type PackagingLineView,
} from "./FormulaBatchScaler";
import { EditableSku, type SkuRow } from "./EditableSku";
import {
  EditableSkuPackaging,
  type SkuPackagingHeader,
  type SkuPackagingLine,
} from "./EditableSkuPackaging";
import { EditableBatchingInstructions } from "./EditableBatchingInstructions";
import { EditableSpecs, type FormulaSpec } from "./EditableSpecs";
import {
  FormulaDocuments,
  type FormulaDocument,
} from "./FormulaDocuments";
import { ImportWarningBanner } from "./ImportWarningBanner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { CanType, ItemOption, SecondaryPackaging, SkuOption } from "../shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

type FormulaPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ importWarn?: string }>;
};

export default function FormulaPage({ params, searchParams }: FormulaPageProps) {
  return (
    <Suspense fallback={<FormulaFallback />}>
      <FormulaDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function FormulaDetail({ params, searchParams }: FormulaPageProps) {
  const { id } = await params;
  const importWarn = ((await searchParams)?.importWarn ?? "").trim();
  const supabase = await createClient();

  const { data: formula } = await supabase
    .from("formulas")
    .select(
      "id, client_id, formula_number, name, version, base_quantity, base_unit_of_measure, batching_instructions, status, notes, created_at, clients(name, code)"
    )
    .eq("id", id)
    .single();

  if (!formula) {
    notFound();
  }

  const [
    { data: skus },
    { data: lines },
    { data: specs },
    { data: items },
    { data: clientSkus },
    { data: documents },
    { count: orphanPackagingCount },
  ] = await Promise.all([
    supabase
      .from("skus")
      .select("id, code, name, shelf_life_days")
      .eq("formula_id", id),
    supabase
      .from("formula_lines")
      .select("id, item_id, line_type, quantity, unit_of_measure, quantity_basis, items(name, item_type, unit_of_measure)")
      .eq("formula_id", id)
      .eq("line_type", "ingredient")
      .order("quantity", { ascending: false }),
    supabase
      .from("formula_specs")
      .select("id, name, target_value, min_value, max_value, unit, notes")
      .eq("formula_id", id)
      .order("name"),
    supabase
      .from("items")
      .select(
        "id, name, item_type, unit_of_measure, requires_coa, shelf_life_days, client_id, supplier_id"
      )
      .order("name"),
    supabase
      .from("skus")
      .select("id, client_id, code, name, shelf_life_days")
      .eq("client_id", formula.client_id)
      .order("code"),
    supabase
      .from("documents")
      .select(
        "id, document_type, file_name, storage_path, uploaded_at, artwork_status",
      )
      .eq("formula_id", id)
      .in("document_type", ["pa_letter", "artwork"])
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("formula_lines")
      .select("id", { count: "exact", head: true })
      .eq("formula_id", id)
      .eq("line_type", "packaging"),
  ]);

  const linkedSkus = (skus ?? []) as SkuRow[];
  const linkedSkuId = linkedSkus[0]?.id ?? null;

  let packagingHeader: SkuPackagingHeader | null = null;
  let packagingLines: SkuPackagingLine[] = [];
  if (linkedSkuId) {
    const [{ data: packaging }, { data: pkgLines }] = await Promise.all([
      supabase
        .from("sku_packaging")
        .select(
          "sku_id, cans_per_tray, can_size_oz, can_type, lid_color, secondary_packaging, tray_notes, lid_notes, notes",
        )
        .eq("sku_id", linkedSkuId)
        .maybeSingle(),
      supabase
        .from("sku_packaging_lines")
        .select(
          "id, item_id, quantity, unit_of_measure, quantity_basis, items(name, item_type, unit_of_measure)",
        )
        .eq("packaging_id", linkedSkuId)
        .order("quantity", { ascending: false }),
    ]);
    packagingHeader = packaging
      ? ({
          ...packaging,
          can_type: packaging.can_type as CanType,
          secondary_packaging:
            packaging.secondary_packaging as SecondaryPackaging,
        } as SkuPackagingHeader)
      : null;
    packagingLines = (pkgLines ?? []) as unknown as SkuPackagingLine[];
  }

  const client = formula.clients as unknown as { name: string; code: string } | null;
  const formulaLines = (lines ?? []) as unknown as FormulaLine[];
  const formulaSpecs = (specs ?? []) as FormulaSpec[];
  const formulaDocuments = await withArtworkPreviewUrls(
    supabase,
    (documents ?? []) as Array<
      FormulaDocument & { storage_path: string }
    >,
  );
  const packagingLineViews: PackagingLineView[] = packagingLines.map((line) => ({
    id: line.id,
    item_id: line.item_id,
    quantity: Number(line.quantity),
    unit_of_measure: line.unit_of_measure,
    quantity_basis: line.quantity_basis,
    items: line.items,
  }));
  const inventoryAvailability = await getInventoryAvailability(
    supabase,
    formulaLines,
    packagingLineViews,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/dashboard/clients/${formula.client_id}`}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← {client?.name ?? "Clients"}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">
            {formula.name ?? skus?.[0]?.name ?? "Formula"}
          </h1>
          {formula.formula_number && (
            <Badge className="bg-slate-100 text-slate-600 border-slate-200 font-mono">
              {formula.formula_number}
            </Badge>
          )}
          <FormulaStatusBadge status={formula.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {client?.name} · Formula v{formula.version} ·{" "}
          {Number(formula.base_quantity).toLocaleString()}{" "}
          {formula.base_unit_of_measure}
        </p>
      </div>

      {importWarn && <ImportWarningBanner message={importWarn} />}

      {(orphanPackagingCount ?? 0) > 0 && !linkedSkuId && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This formula still has packaging lines but no linked SKU. Link a SKU
          and move packaging into SKU Packaging specs.
        </div>
      )}

      <div className="grid md:grid-cols-[1fr_2fr] gap-6">
        <EditableSku
          formulaId={formula.id}
          clientId={formula.client_id}
          linkedSkus={linkedSkus}
          clientSkus={(clientSkus ?? []) as SkuOption[]}
        />

        <EditableBatchingInstructions
          formulaId={formula.id}
          batchingInstructions={formula.batching_instructions}
        />
      </div>

      <EditableSkuPackaging
        formulaId={formula.id}
        clientId={formula.client_id}
        skuId={linkedSkuId}
        packaging={packagingHeader}
        lines={packagingLines}
        items={(items ?? []) as ItemOption[]}
      />

      <FormulaBatchScaler
        baseQuantity={Number(formula.base_quantity)}
        baseUnitOfMeasure={formula.base_unit_of_measure}
        clientId={formula.client_id}
        formulaId={formula.id}
        lines={formulaLines}
        packagingLines={packagingLineViews}
        items={(items ?? []) as ItemOption[]}
        inventoryAvailability={inventoryAvailability}
        cansPerTray={packagingHeader?.cans_per_tray}
        canSizeOz={
          packagingHeader?.can_size_oz != null
            ? Number(packagingHeader.can_size_oz)
            : undefined
        }
      />

      <EditableSpecs formulaId={formula.id} specs={formulaSpecs} />

      <FormulaDocuments
        formulaId={formula.id}
        clientId={formula.client_id}
        documents={formulaDocuments}
      />
    </div>
  );
}

function FormulaFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid md:grid-cols-[1fr_2fr] gap-6">
        {[0, 1].map((item) => (
          <Card key={item}>
            <CardHeader>
              <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function FormulaStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 border-gray-200",
    pending_authorization: "bg-yellow-100 text-yellow-800 border-yellow-200",
    authorized: "bg-green-100 text-green-800 border-green-200",
    retired: "bg-red-100 text-red-800 border-red-200",
  };
  const labels: Record<string, string> = {
    draft: "Draft",
    pending_authorization: "Pending Authorization",
    authorized: "Authorized",
    retired: "Retired",
  };
  return <Badge className={map[status] ?? ""}>{labels[status] ?? status}</Badge>;
}

async function withArtworkPreviewUrls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documents: Array<FormulaDocument & { storage_path: string }>,
): Promise<FormulaDocument[]> {
  return Promise.all(
    documents.map(async (doc) => {
      const { storage_path: _storagePath, ...rest } = doc;
      if (doc.document_type !== "artwork") {
        return rest;
      }

      const { data: signed } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.storage_path, 60 * 60);

      return {
        ...rest,
        previewUrl: signed?.signedUrl ?? null,
      };
    }),
  );
}

async function getInventoryAvailability(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formulaLines: FormulaLine[],
  packagingLines: PackagingLineView[],
) {
  const itemIds = Array.from(
    new Set([
      ...formulaLines.map((line) => line.item_id),
      ...packagingLines.map((line) => line.item_id),
    ]),
  );

  if (itemIds.length === 0) {
    return {};
  }

  const { data: inventory } = await supabase
    .from("inventory_on_hand")
    .select("item_id, unit_of_measure, quantity_on_hand")
    .in("item_id", itemIds);

  const availability = (inventory ?? []).reduce((acc, row) => {
    acc[row.item_id] ??= {};
    acc[row.item_id][row.unit_of_measure] =
      (acc[row.item_id][row.unit_of_measure] ?? 0) +
      Number(row.quantity_on_hand);
    return acc;
  }, {} as InventoryAvailability);

  for (const line of formulaLines) {
    if (line.items?.name.toLowerCase() !== "filtered water") {
      continue;
    }

    availability[line.item_id] ??= {};
    availability[line.item_id][line.unit_of_measure] = Number.MAX_SAFE_INTEGER;
  }

  return availability;
}

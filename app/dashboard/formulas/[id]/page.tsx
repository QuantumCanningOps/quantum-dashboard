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
import {
  ClientFormulasNav,
  type ClientFormulaNavItem,
} from "./ClientFormulasNav";
import { DeleteFormulaButton } from "./DeleteFormulaButton";
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
      "id, client_id, formula_number, name, version, base_quantity, base_unit_of_measure, density_lbs_per_gallon, batching_instructions, status, notes, created_at, clients(name, code)"
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
    { data: clientFormulas },
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
      .select("id, document_type, file_name, uploaded_at, artwork_status")
      .eq("formula_id", id)
      .in("document_type", ["pa_letter", "artwork"])
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("formula_lines")
      .select("id", { count: "exact", head: true })
      .eq("formula_id", id)
      .eq("line_type", "packaging"),
    supabase
      .from("formulas")
      .select("id, formula_number, name, version, status, skus(code, name)")
      .eq("client_id", formula.client_id)
      .order("name")
      .order("formula_number")
      .order("version", { ascending: false }),
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
  const formulaDocuments = (documents ?? []) as FormulaDocument[];
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

  const siblingFormulas: ClientFormulaNavItem[] = (clientFormulas ?? [])
    .map((row) => {
      const linked = row.skus as
        | { code: string; name: string }
        | { code: string; name: string }[]
        | null;
      const sku = Array.isArray(linked) ? linked[0] : linked;
      return {
        id: row.id,
        formula_number: row.formula_number,
        name: row.name,
        version: row.version,
        status: row.status,
        sku_code: sku?.code ?? null,
        sku_name: sku?.name ?? null,
      };
    })
    .sort((a, b) => {
      const labelA =
        a.name?.trim() ||
        a.sku_name?.trim() ||
        a.formula_number?.trim() ||
        "";
      const labelB =
        b.name?.trim() ||
        b.sku_name?.trim() ||
        b.formula_number?.trim() ||
        "";
      const byLabel = labelA.localeCompare(labelB, undefined, {
        sensitivity: "base",
      });
      if (byLabel !== 0) return byLabel;
      return b.version - a.version;
    });

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <ClientFormulasNav
        clientId={formula.client_id}
        clientName={client?.name ?? "Client"}
        formulas={siblingFormulas}
        currentFormulaId={formula.id}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link
            href={`/dashboard/clients/${formula.client_id}`}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            ← {client?.name ?? "Clients"}
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-2">
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
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/dashboard/production-orders/new?clientId=${formula.client_id}&formulaId=${formula.id}${
                  linkedSkuId ? `&skuId=${linkedSkuId}` : ""
                }`}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
              >
                Create production order
              </Link>
              <DeleteFormulaButton
                formulaId={formula.id}
                formulaLabel={
                  formula.name ??
                  formula.formula_number ??
                  skus?.[0]?.name ??
                  "this formula"
                }
              />
            </div>
          </div>
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
          skuId={linkedSkuId}
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
          densityLbsPerGallon={
            formula.density_lbs_per_gallon != null
              ? Number(formula.density_lbs_per_gallon)
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
    </div>
  );
}

function FormulaFallback() {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <aside className="w-full shrink-0 md:w-56 lg:w-64">
        <div className="rounded-lg border bg-card">
          <div className="border-b px-3 py-2.5">
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-28 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-6">
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
    .select("item_id, unit_of_measure, quantity_on_hand, is_offsite")
    .in("item_id", itemIds);

  const availability = (inventory ?? []).reduce((acc, row) => {
    const qty = Number(row.quantity_on_hand);
    const item = (acc[row.item_id] ??= { total: {}, onsite: {}, offsite: {} });
    const bucket = row.is_offsite ? item.offsite : item.onsite;
    item.total[row.unit_of_measure] =
      (item.total[row.unit_of_measure] ?? 0) + qty;
    bucket[row.unit_of_measure] = (bucket[row.unit_of_measure] ?? 0) + qty;
    return acc;
  }, {} as InventoryAvailability);

  for (const line of formulaLines) {
    if (line.items?.name.toLowerCase() !== "filtered water") {
      continue;
    }

    // Plant water — treat as unlimited on-site.
    availability[line.item_id] = {
      total: { [line.unit_of_measure]: Number.MAX_SAFE_INTEGER },
      onsite: { [line.unit_of_measure]: Number.MAX_SAFE_INTEGER },
      offsite: {},
    };
  }

  return availability;
}

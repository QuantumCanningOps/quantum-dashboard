import { createClient } from "@/lib/supabase/server";
import {
  FormulaBatchScaler,
  type FormulaLine,
  type InventoryAvailability,
} from "./FormulaBatchScaler";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

type FormulaPageProps = {
  params: Promise<{ id: string }>;
};

type FormulaSpec = {
  id: string;
  name: string;
  target_value: number | null;
  min_value: number | null;
  max_value: number | null;
  unit: string | null;
  notes: string | null;
};

export default function FormulaPage({ params }: FormulaPageProps) {
  return (
    <Suspense fallback={<FormulaFallback />}>
      <FormulaDetail params={params} />
    </Suspense>
  );
}

async function FormulaDetail({ params }: FormulaPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: formula },
    { data: skus },
    { data: lines },
    { data: specs },
  ] = await Promise.all([
    supabase
      .from("formulas")
      .select(
        "id, client_id, version, base_quantity, base_unit_of_measure, batching_instructions, status, notes, created_at, clients(name, code)"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("skus")
      .select("id, code, name, shelf_life_days")
      .eq("formula_id", id),
    supabase
      .from("formula_lines")
      .select("id, item_id, line_type, quantity, unit_of_measure, items(name, item_type, unit_of_measure)")
      .eq("formula_id", id)
      .order("line_type")
      .order("quantity", { ascending: false }),
    supabase
      .from("formula_specs")
      .select("id, name, target_value, min_value, max_value, unit, notes")
      .eq("formula_id", id)
      .order("name"),
  ]);

  if (!formula) {
    notFound();
  }

  const client = formula.clients as unknown as { name: string; code: string } | null;
  const formulaLines = (lines ?? []) as unknown as FormulaLine[];
  const formulaSpecs = (specs ?? []) as FormulaSpec[];
  const inventoryAvailability = await getInventoryAvailability(
    supabase,
    formulaLines,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/dashboard/clients"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          Back to clients
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">
            {skus?.[0]?.name ?? "Formula"}
          </h1>
          <Badge className="bg-slate-100 text-slate-600 border-slate-200 font-mono">
            {skus?.[0]?.code ?? client?.code}
          </Badge>
          <FormulaStatusBadge status={formula.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {client?.name} · Formula v{formula.version} ·{" "}
          {Number(formula.base_quantity).toLocaleString()}{" "}
          {formula.base_unit_of_measure}
        </p>
      </div>

      <div className="grid md:grid-cols-[1fr_2fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">SKU</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {(skus ?? []).map((sku) => (
                <li key={sku.id} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                    {sku.code}
                  </span>
                  <span className="font-medium">{sku.name}</span>
                  <span className="ml-auto text-muted-foreground">
                    {sku.shelf_life_days} days
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Batching Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              {formula.batching_instructions ?? "No batching instructions recorded."}
            </p>
          </CardContent>
        </Card>
      </div>

      <FormulaBatchScaler
        baseQuantity={Number(formula.base_quantity)}
        baseUnitOfMeasure={formula.base_unit_of_measure}
        clientId={formula.client_id}
        lines={formulaLines}
        inventoryAvailability={inventoryAvailability}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Specs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Name</th>
                  <th className="pb-2 text-right font-medium">Min</th>
                  <th className="pb-2 text-right font-medium">Target</th>
                  <th className="pb-2 text-right font-medium">Max</th>
                  <th className="pb-2 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {formulaSpecs.map((spec) => (
                  <tr key={spec.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{spec.name}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatSpecValue(spec.min_value, spec.unit)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatSpecValue(spec.target_value, spec.unit)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatSpecValue(spec.max_value, spec.unit)}
                    </td>
                    <td className="py-2 pl-4 text-muted-foreground">
                      {spec.notes ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
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

function formatSpecValue(value: number | null, unit: string | null) {
  if (value === null) {
    return "-";
  }
  return `${Number(value).toLocaleString()}${unit ? ` ${unit}` : ""}`;
}

async function getInventoryAvailability(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formulaLines: FormulaLine[],
) {
  const itemIds = Array.from(new Set(formulaLines.map((line) => line.item_id)));

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

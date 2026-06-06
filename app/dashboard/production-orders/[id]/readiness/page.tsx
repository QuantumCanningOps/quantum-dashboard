import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

type PageProps = { params: Promise<{ id: string }> };

type OrderRow = {
  id: string;
  client_id: string;
  formula_id: string | null;
  order_number: string;
  ordered_quantity: number;
  unit_of_measure: string;
  status: string;
  clients: { name: string; code: string } | null;
  skus: { code: string; name: string } | null;
  formulas: { base_quantity: number | null; base_unit_of_measure: string | null } | null;
  batches: { id: string; status: string }[] | null;
};

type RawBatchLine = {
  item_id: string;
  planned_quantity: number;
  unit_of_measure: string;
  items: { name: string; item_type: string } | null;
};

type RawFormulaLine = {
  item_id: string;
  quantity: number;
  unit_of_measure: string;
  items: { name: string; item_type: string } | null;
};

type MaterialLine = {
  item_id: string;
  item_name: string;
  item_type: string;
  required: number;
  available: number;
  uom: string;
  sufficient: boolean;
};

export default function ReadinessPage({ params }: PageProps) {
  return (
    <Suspense fallback={<ReadinessFallback />}>
      <ReadinessContent params={params} />
    </Suspense>
  );
}

async function ReadinessContent({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: orderRow } = await supabase
    .from("production_orders")
    .select(
      "id, client_id, formula_id, order_number, ordered_quantity, unit_of_measure, status, clients(name, code), skus(code, name), formulas(base_quantity, base_unit_of_measure), batches(id, status)"
    )
    .eq("id", id)
    .single();

  if (!orderRow) notFound();

  const order = orderRow as unknown as OrderRow;
  const activeBatch =
    (order.batches ?? []).find((b) => b.status !== "cancelled") ??
    (order.batches ?? [])[0] ??
    null;

  const [{ data: batchLineRows }, { data: formulaLineRows }] = await Promise.all([
    activeBatch?.id
      ? supabase
          .from("batch_lines")
          .select("item_id, planned_quantity, unit_of_measure, items(name, item_type)")
          .eq("batch_id", activeBatch.id)
      : Promise.resolve({ data: [] as RawBatchLine[] }),
    order.formula_id
      ? supabase
          .from("formula_lines")
          .select("item_id, quantity, unit_of_measure, items(name, item_type)")
          .eq("formula_id", order.formula_id)
      : Promise.resolve({ data: [] as RawFormulaLine[] }),
  ]);

  const useBatchLines = ((batchLineRows ?? []) as RawBatchLine[]).length > 0;

  let rawLines: { item_id: string; item_name: string; item_type: string; required: number; uom: string }[];

  if (useBatchLines) {
    rawLines = ((batchLineRows ?? []) as RawBatchLine[]).map((line) => ({
      item_id: line.item_id,
      item_name: line.items?.name ?? "—",
      item_type: line.items?.item_type ?? "",
      required: Number(line.planned_quantity),
      uom: line.unit_of_measure,
    }));
  } else {
    const baseQty = order.formulas?.base_quantity ?? 0;
    const baseUom = order.formulas?.base_unit_of_measure ?? "";
    const orderGallons = toGallons(order.ordered_quantity, order.unit_of_measure);
    const baseGallons = toGallons(baseQty, baseUom);
    const scale = orderGallons !== null && baseGallons ? orderGallons / baseGallons : null;

    rawLines =
      scale !== null
        ? ((formulaLineRows ?? []) as RawFormulaLine[]).map((line) => ({
            item_id: line.item_id,
            item_name: line.items?.name ?? "—",
            item_type: line.items?.item_type ?? "",
            required: Number(line.quantity) * scale,
            uom: line.unit_of_measure,
          }))
        : [];
  }

  const itemIds = [...new Set(rawLines.map((l) => l.item_id))];

  const { data: invRows } = itemIds.length
    ? await supabase
        .from("inventory_item_summary")
        .select("item_id, quantity_available")
        .eq("client_id", order.client_id)
        .in("item_id", itemIds)
    : { data: [] as { item_id: string; quantity_available: number }[] };

  const invAvail: Record<string, number> = {};
  for (const row of invRows ?? []) {
    invAvail[row.item_id] = Number(row.quantity_available);
  }

  const TYPE_ORDER: Record<string, number> = {
    raw_ingredient: 0,
    wip: 1,
    packaging: 2,
    finished_good: 3,
  };

  const lines: MaterialLine[] = rawLines
    .map((line) => {
      const available = invAvail[line.item_id] ?? 0;
      return { ...line, available, sufficient: available >= line.required };
    })
    .sort((a, b) => {
      if (a.sufficient !== b.sufficient) return a.sufficient ? 1 : -1;
      return (TYPE_ORDER[a.item_type] ?? 9) - (TYPE_ORDER[b.item_type] ?? 9);
    });

  const shortCount = lines.filter((l) => !l.sufficient).length;
  const allSufficient = shortCount === 0 && lines.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/dashboard/production-orders"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Production orders
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold">{order.order_number}</h1>
          <StatusBadge status={order.status} />
          {lines.length > 0 && (
            <Badge
              className={
                allSufficient
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-red-50 text-red-700 border-red-200"
              }
            >
              {allSufficient
                ? "All materials ready"
                : `${shortCount} item${shortCount !== 1 ? "s" : ""} short`}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {order.clients?.name}
          {order.skus ? (
            <>
              {" · "}
              <span className="font-medium text-foreground">{order.skus.name}</span>
              <span className="ml-1.5 font-mono text-xs">{order.skus.code}</span>
            </>
          ) : null}
          {" · "}
          {Number(order.ordered_quantity).toLocaleString()} {order.unit_of_measure}
        </p>
        {!useBatchLines && order.formula_id && (
          <p className="text-xs text-muted-foreground">
            Requirements calculated from formula, scaled to ordered quantity.
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Material Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No bill of materials found for this order.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Item</th>
                    <th className="pb-2 text-left font-medium">Type</th>
                    <th className="pb-2 text-right font-medium">Required</th>
                    <th className="pb-2 text-right font-medium">Available</th>
                    <th className="pb-2 text-right font-medium">Gap</th>
                    <th className="pb-2 text-left font-medium pl-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const gap = line.available - line.required;
                    return (
                      <tr
                        key={line.item_id}
                        className="border-b last:border-0 hover:bg-muted/30"
                      >
                        <td className="py-2 pr-4 font-medium">
                          <Link
                            href={`/dashboard/inventory?clientId=${order.client_id}&itemId=${line.item_id}`}
                            className="hover:underline"
                          >
                            {line.item_name}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">
                          <ItemTypeBadge type={line.item_type} />
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {fmtQty(line.required)}{" "}
                          <span className="text-muted-foreground">{line.uom}</span>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {fmtQty(line.available)}{" "}
                          <span className="text-muted-foreground">{line.uom}</span>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          <span className={gap >= 0 ? "text-green-700" : "text-red-600"}>
                            {gap >= 0 ? "+" : ""}
                            {fmtQty(gap)}{" "}
                            <span className="font-normal text-muted-foreground">{line.uom}</span>
                          </span>
                        </td>
                        <td className="py-2 pl-4">
                          {line.sufficient ? (
                            <Badge className="bg-green-50 text-green-700 border-green-200">
                              Ready
                            </Badge>
                          ) : (
                            <Badge className="bg-red-50 text-red-700 border-red-200">
                              Short
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function fmtQty(n: number) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function toGallons(qty: number, uom: string): number | null {
  switch (uom.toLowerCase()) {
    case "gal": case "gallon": case "gallons": return qty;
    case "can": case "cans": return qty * 12 / 128;
    case "case": case "cases": return qty * 24 * 12 / 128;
    default: return null;
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-gray-100 text-gray-600 border-gray-200",
    scheduled: "bg-blue-50 text-blue-700 border-blue-200",
    in_progress: "bg-amber-50 text-amber-700 border-amber-200",
    complete: "bg-green-100 text-green-800 border-green-200",
    cancelled: "bg-red-50 text-red-600 border-red-200",
  };
  const labels: Record<string, string> = {
    pending: "Pending",
    scheduled: "Scheduled",
    in_progress: "In Progress",
    complete: "Complete",
    cancelled: "Cancelled",
  };
  return <Badge className={map[status] ?? ""}>{labels[status] ?? status}</Badge>;
}

function ItemTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    raw_ingredient: "bg-blue-50 text-blue-700 border-blue-200",
    packaging: "bg-violet-50 text-violet-700 border-violet-200",
    wip: "bg-orange-50 text-orange-700 border-orange-200",
    finished_good: "bg-teal-50 text-teal-700 border-teal-200",
  };
  const labels: Record<string, string> = {
    raw_ingredient: "Ingredient",
    packaging: "Packaging",
    wip: "WIP",
    finished_good: "Finished",
  };
  return (
    <Badge className={map[type] ?? "bg-gray-100 text-gray-600 border-gray-200"}>
      {labels[type] ?? type}
    </Badge>
  );
}

function ReadinessFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted" />
      </div>
      <Card>
        <CardHeader>
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-5 w-full animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

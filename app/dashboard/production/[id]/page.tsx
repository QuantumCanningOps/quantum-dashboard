import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

type DetailPageProps = {
  params: Promise<{ id: string }>;
};

type BatchDetail = {
  id: string;
  batch_number: string | null;
  status: string;
  batching_date: string | null;
  canning_date: string | null;
  planned_quantity: number;
  actual_quantity: number | null;
  unit_of_measure: string;
  tanks: { name: string } | null;
};

type OrderLine = {
  id: string;
  item_id: string;
  planned_quantity: number;
  actual_quantity: number | null;
  unit_of_measure: string;
  items: {
    name: string;
    item_type: string;
    unit_of_measure: string;
  } | null;
};

type ItemSummary = {
  item_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  unit_of_measure: string;
};

type LotPick = {
  id: string;
  batch_line_id: string;
  quantity: number;
  unit_of_measure: string;
  lots: {
    id: string;
    lot_number: string;
    expiration_date: string | null;
    status: string;
  } | null;
};

export default function ProductionDetailPage({ params }: DetailPageProps) {
  return (
    <Suspense fallback={<DetailFallback />}>
      <ProductionDetail params={params} />
    </Suspense>
  );
}

async function ProductionDetail({ params }: DetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: order }, { data: batchRows }] = await Promise.all([
    supabase
      .from("production_orders")
      .select("*, clients(name, code), skus(code, name)")
      .eq("id", id)
      .single(),
    supabase
      .from("batches")
      .select(
        "id, batch_number, status, batching_date, canning_date, planned_quantity, actual_quantity, unit_of_measure, tanks(name)",
      )
      .eq("production_order_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!order) notFound();

  const client = order.clients as unknown as { name: string; code: string } | null;
  const sku = order.skus as unknown as { name: string; code: string } | null;
  const batches = (batchRows ?? []) as unknown as BatchDetail[];
  const batch = batches.find((b) => b.status !== "cancelled") ?? batches[0] ?? null;
  const tank = batch?.tanks ?? null;

  const { data: lineRows } = batch
    ? await supabase
        .from("batch_lines")
        .select(
          "id, item_id, planned_quantity, actual_quantity, unit_of_measure, items(name, item_type, unit_of_measure)",
        )
        .eq("batch_id", batch.id)
    : { data: [] };

  const orderLines = (lineRows ?? []) as unknown as OrderLine[];
  const itemIds = orderLines.map((l) => l.item_id);
  const lineIds = orderLines.map((l) => l.id);

  const [{ data: summaryRows }, { data: lotPickRows }] = await Promise.all([
    itemIds.length
      ? supabase
          .from("inventory_item_summary")
          .select(
            "item_id, quantity_on_hand, quantity_reserved, quantity_available, unit_of_measure",
          )
          .eq("client_id", order.client_id)
          .in("item_id", itemIds)
      : Promise.resolve({ data: [] as unknown[] }),
    lineIds.length
      ? supabase
          .from("batch_lot_picks")
          .select(
            "id, batch_line_id, quantity, unit_of_measure, lots(id, lot_number, expiration_date, status)",
          )
          .in("batch_line_id", lineIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const summaryByItem = ((summaryRows ?? []) as ItemSummary[]).reduce(
    (acc, row) => {
      acc[row.item_id] = row;
      return acc;
    },
    {} as Record<string, ItemSummary>,
  );

  const picksByLine = ((lotPickRows ?? []) as unknown as LotPick[]).reduce(
    (acc, pick) => {
      (acc[pick.batch_line_id] ??= []).push(pick);
      return acc;
    },
    {} as Record<string, LotPick[]>,
  );

  // Sort lines: ingredients first, then packaging (derived from item_type)
  const sortedLines = [...orderLines].sort((a, b) => {
    const typeOrder: Record<string, number> = {
      raw_ingredient: 0,
      wip: 1,
      packaging: 2,
      finished_good: 3,
    };
    const ta = typeOrder[a.items?.item_type ?? ""] ?? 9;
    const tb = typeOrder[b.items?.item_type ?? ""] ?? 9;
    return ta - tb;
  });

  const isActive =
    batch?.status === "scheduled" || batch?.status === "in_progress";

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
        </div>
        <p className="text-sm text-muted-foreground">
          {client?.name}
          {sku ? (
            <>
              {" · "}
              <span className="font-medium text-foreground">{sku.name}</span>
              <span className="ml-1 font-mono text-xs">{sku.code}</span>
            </>
          ) : null}
        </p>
        {batch?.batch_number && (
          <p className="font-mono text-xs text-muted-foreground">
            Batch{" "}
            <span className="font-medium text-foreground">
              {batch.batch_number}
            </span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ordered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">
              {Number(order.ordered_quantity).toLocaleString()}
            </span>
            <span className="ml-1.5 text-sm text-muted-foreground">
              {order.unit_of_measure}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Actual
            </CardTitle>
          </CardHeader>
          <CardContent>
            {batch?.actual_quantity != null ? (
              <>
                <span className="text-2xl font-bold">
                  {Number(batch.actual_quantity).toLocaleString()}
                </span>
                <span className="ml-1.5 text-sm text-muted-foreground">
                  {batch.unit_of_measure}
                </span>
              </>
            ) : (
              <span className="text-2xl font-bold text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tank
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">
              {tank?.name ?? "—"}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Batching
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">
              {batch?.batching_date
                ? new Date(batch.batching_date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                : "—"}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Canning
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">
              {batch?.canning_date
                ? new Date(batch.canning_date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                : "—"}
            </span>
          </CardContent>
        </Card>
      </div>

      {(order.notes || batch?.notes) && (
        <Card>
          <CardContent className="flex flex-col gap-1 pt-4 text-sm text-muted-foreground">
            {order.notes && <p>{order.notes}</p>}
            {batch?.notes && order.notes !== batch.notes && (
              <p>{batch.notes}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isActive ? "Inventory Requirements" : "Bill of Materials"}
          </CardTitle>
          {isActive && (
            <p className="text-sm text-muted-foreground">
              On Hand and Available reflect current inventory including all
              active reservations.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Item</th>
                  <th className="pb-2 text-left font-medium">Type</th>
                  <th className="pb-2 text-right font-medium">Planned</th>
                  {order.status === "complete" && (
                    <th className="pb-2 text-right font-medium">Actual</th>
                  )}
                  {isActive && (
                    <>
                      <th className="pb-2 text-right font-medium">On Hand</th>
                      <th className="pb-2 text-right font-medium">Reserved</th>
                      <th className="pb-2 text-right font-medium">Available</th>
                    </>
                  )}
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {sortedLines.map((line) => {
                  const inv = summaryByItem[line.item_id];
                  const picks = picksByLine[line.id] ?? [];
                  return (
                    <tr
                      key={line.id}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="py-2 pr-4">
                        <div className="flex flex-col gap-0.5">
                          {line.items?.name ? (
                            <Link
                              href={`/dashboard/inventory?clientId=${order.client_id}&itemId=${line.item_id}`}
                              className="font-medium hover:underline"
                            >
                              {line.items.name}
                            </Link>
                          ) : (
                            <span className="font-medium">—</span>
                          )}
                          {picks.map((pick) => {
                            const lot = pick.lots;
                            if (!lot) return null;
                            const isWarning =
                              lot.status === "on_hold" ||
                              lot.status === "quarantine";
                            const expLabel = lot.expiration_date
                              ? new Date(
                                  lot.expiration_date,
                                ).toLocaleDateString(undefined, {
                                  month: "short",
                                  year: "numeric",
                                })
                              : null;
                            return (
                              <Link
                                key={pick.id}
                                href={`/dashboard/lots/${lot.id}`}
                                className={`flex items-baseline gap-1.5 text-xs hover:underline ${
                                  isWarning
                                    ? "text-amber-700 hover:text-amber-900"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                <span className="shrink-0 select-none text-muted-foreground/40">
                                  ↳
                                </span>
                                <span className="font-mono">
                                  {lot.lot_number}
                                </span>
                                <span className="tabular-nums">
                                  {Number(pick.quantity).toLocaleString()}{" "}
                                  {pick.unit_of_measure}
                                </span>
                                {expLabel && (
                                  <span className="text-muted-foreground/70">
                                    exp {expLabel}
                                  </span>
                                )}
                                {isWarning && (
                                  <span className="font-medium">
                                    (
                                    {lot.status === "on_hold"
                                      ? "on hold"
                                      : "quarantine"}
                                    )
                                  </span>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-2 pr-4 align-top">
                        <ItemTypeBadge type={line.items?.item_type ?? ""} />
                      </td>
                      <td className="py-2 pr-4 text-right align-top tabular-nums">
                        {Number(line.planned_quantity).toLocaleString()}{" "}
                        <span className="text-muted-foreground">
                          {line.unit_of_measure}
                        </span>
                      </td>
                      {order.status === "complete" && (
                        <td className="py-2 pr-4 text-right align-top tabular-nums">
                          {line.actual_quantity != null ? (
                            <>
                              {Number(line.actual_quantity).toLocaleString()}{" "}
                              <span className="text-muted-foreground">
                                {line.unit_of_measure}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}
                      {isActive && (
                        <>
                          <td className="py-2 pr-4 text-right align-top tabular-nums">
                            {inv ? (
                              <>
                                {Number(inv.quantity_on_hand).toLocaleString()}{" "}
                                <span className="text-muted-foreground">
                                  {inv.unit_of_measure}
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-right align-top tabular-nums">
                            {inv && inv.quantity_reserved > 0 ? (
                              <span className="text-amber-700">
                                {Number(inv.quantity_reserved).toLocaleString()}{" "}
                                <span className="font-normal text-muted-foreground">
                                  {inv.unit_of_measure}
                                </span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-right align-top tabular-nums font-medium">
                            {inv ? (
                              <AvailableQty inv={inv} />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </>
                      )}
                      <td className="py-2 text-right align-top">
                        <Link
                          href={`/dashboard/inventory?clientId=${order.client_id}&itemId=${line.item_id}`}
                          className="whitespace-nowrap text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          View lots →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {sortedLines.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No lines on this order.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AvailableQty({ inv }: { inv: ItemSummary }) {
  const qty = Number(inv.quantity_available);
  const uom = (
    <span className="font-normal text-muted-foreground">
      {inv.unit_of_measure}
    </span>
  );
  if (qty < 0) {
    return (
      <span className="text-red-600">
        {qty.toLocaleString()} {uom}
      </span>
    );
  }
  if (inv.quantity_reserved > 0) {
    return (
      <span className="text-green-700">
        {qty.toLocaleString()} {uom}
      </span>
    );
  }
  return (
    <span>
      {qty.toLocaleString()} {uom}
    </span>
  );
}

function DetailFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-24 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
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
  return (
    <Badge className={map[status] ?? ""}>{labels[status] ?? status}</Badge>
  );
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

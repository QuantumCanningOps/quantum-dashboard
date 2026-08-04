import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  EditableProductionOrder,
  type FormulaOption,
  type SkuOption,
} from "./EditableProductionOrder";
import { MaterialReadinessCard } from "../MaterialReadinessCard";
import type { ProductionOrderStatus } from "../../production-orders/actions";

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
  notes: string | null;
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
      .select(
        "*, clients(name, code), skus(id, code, name), formulas(id, formula_number, name, version, status)",
      )
      .eq("id", id)
      .single(),
    supabase
      .from("batches")
      .select(
        "id, batch_number, status, batching_date, canning_date, planned_quantity, actual_quantity, unit_of_measure, notes, tanks(name)",
      )
      .eq("production_order_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!order) notFound();

  const client = order.clients as unknown as { name: string; code: string } | null;
  const sku = order.skus as unknown as {
    id: string;
    name: string;
    code: string;
  } | null;
  const formula = order.formulas as unknown as FormulaOption | null;
  const batches = (batchRows ?? []) as unknown as BatchDetail[];
  const batch = batches.find((b) => b.status !== "cancelled") ?? batches[0] ?? null;
  const tank = batch?.tanks ?? null;

  const [{ data: clientSkus }, { data: clientFormulas }] = await Promise.all([
    supabase
      .from("skus")
      .select("id, code, name, formula_id")
      .eq("client_id", order.client_id)
      .order("code"),
    supabase
      .from("formulas")
      .select("id, formula_number, name, version, status")
      .eq("client_id", order.client_id)
      .order("name")
      .order("formula_number")
      .order("version", { ascending: false }),
  ]);

  const { data: lineRows } = batch
    ? await supabase
        .from("batch_lines")
        .select(
          "id, item_id, planned_quantity, actual_quantity, unit_of_measure, items(name, item_type, unit_of_measure)",
        )
        .eq("batch_id", batch.id)
    : { data: [] };

  const orderLines = (lineRows ?? []) as unknown as OrderLine[];
  const lineIds = orderLines.map((l) => l.id);

  const { data: lotPickRows } = lineIds.length
    ? await supabase
        .from("batch_lot_picks")
        .select(
          "id, batch_line_id, quantity, unit_of_measure, lots(id, lot_number, expiration_date, status)",
        )
        .in("batch_line_id", lineIds)
    : { data: [] as unknown[] };

  const picksByLine = ((lotPickRows ?? []) as unknown as LotPick[]).reduce(
    (acc, pick) => {
      (acc[pick.batch_line_id] ??= []).push(pick);
      return acc;
    },
    {} as Record<string, LotPick[]>,
  );

  const linesWithPicks = orderLines.filter(
    (line) => (picksByLine[line.id] ?? []).length > 0,
  );

  const orderStatus = order.status as ProductionOrderStatus;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/dashboard/production-orders"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Production orders
        </Link>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-bold">
              {order.order_number}
            </h1>
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
            {formula ? (
              <>
                {" · "}
                <Link
                  href={`/dashboard/formulas/${formula.id}`}
                  className="hover:underline"
                >
                  {formula.formula_number ??
                    formula.name ??
                    `Formula v${formula.version}`}
                </Link>
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
      </div>

      <EditableProductionOrder
        orderId={order.id}
        orderNumber={order.order_number}
        status={orderStatus}
        skuId={order.sku_id}
        formulaId={order.formula_id}
        orderedQuantity={Number(order.ordered_quantity)}
        unitOfMeasure={order.unit_of_measure}
        actualQuantity={
          order.actual_quantity != null ? Number(order.actual_quantity) : null
        }
        notes={order.notes}
        skus={(clientSkus ?? []) as SkuOption[]}
        formulas={(clientFormulas ?? []) as FormulaOption[]}
      />

      <MaterialReadinessCard orderId={order.id} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Batch actual
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

      {batch?.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Batch notes
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {batch.notes}
          </CardContent>
        </Card>
      )}

      {linesWithPicks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lot assignments</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Lots picked against this order&apos;s batch lines.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3 text-sm">
              {linesWithPicks.map((line) => {
                const picks = picksByLine[line.id] ?? [];
                return (
                  <li key={line.id} className="flex flex-col gap-1">
                    <div className="font-medium">
                      {line.items?.name ? (
                        <Link
                          href={`/dashboard/inventory?clientId=${order.client_id}&itemId=${line.item_id}`}
                          className="hover:underline"
                        >
                          {line.items.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </div>
                    <ul className="flex flex-col gap-0.5">
                      {picks.map((pick) => {
                        const lot = pick.lots;
                        if (!lot) return null;
                        const isWarning =
                          lot.status === "on_hold" ||
                          lot.status === "quarantine";
                        const expLabel = lot.expiration_date
                          ? new Date(lot.expiration_date).toLocaleDateString(
                              undefined,
                              { month: "short", year: "numeric" },
                            )
                          : null;
                        return (
                          <li key={pick.id}>
                            <Link
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
                              <span className="font-mono">{lot.lot_number}</span>
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
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
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


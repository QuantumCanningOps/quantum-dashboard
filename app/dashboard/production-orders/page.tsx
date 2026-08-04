import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Suspense } from "react";
import {
  availableQuantityForItem,
  buildScaledRequirements,
  freeQuantityForOrder,
  hasReservationPriority,
  reservedQuantityForItem,
  type IngredientQuantityBasis,
  type InventoryAvailabilityRow,
  type ReservationLine,
} from "@/lib/material-readiness";

type PageProps = {
  searchParams?: Promise<{
    clientId?: string;
    status?: string;
    q?: string;
  }>;
};

type OrderRow = {
  id: string;
  client_id: string;
  formula_id: string | null;
  sku_id: string | null;
  order_number: string;
  ordered_quantity: number;
  actual_quantity: number | null;
  unit_of_measure: string;
  status: string;
  created_at: string;
  clients: { name: string; code: string } | null;
  skus: {
    code: string;
    name: string;
    sku_packaging:
      | { cans_per_tray: number; can_size_oz: number | null }
      | { cans_per_tray: number; can_size_oz: number | null }[]
      | null;
  } | null;
  formulas: {
    formula_number: string | null;
    name: string | null;
    version: number;
    base_quantity: number | null;
    base_unit_of_measure: string | null;
    density_lbs_per_gallon: number | null;
  } | null;
  batches: { id: string; batch_number: string | null; status: string }[] | null;
};

type MaterialStatus = "sufficient" | "short" | "unknown";

type NamedItem = { name: string };

function asNamedItem(
  value: NamedItem | NamedItem[] | null | undefined,
): NamedItem | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const STATUS_OPTIONS = ["pending", "scheduled", "in_progress", "complete", "cancelled"];

export default function ProductionOrdersPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<PageFallback />}>
      <ProductionOrdersContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ProductionOrdersContent({ searchParams }: PageProps) {
  const supabase = await createClient();
  const params = (await searchParams) ?? {};

  const clientId = params.clientId ?? "";
  const status = STATUS_OPTIONS.includes(params.status ?? "") ? (params.status ?? "") : "";
  const q = params.q?.trim() ?? "";

  let query = supabase
    .from("production_orders")
    .select(
      "id, client_id, formula_id, sku_id, order_number, ordered_quantity, actual_quantity, unit_of_measure, status, created_at, clients(name, code), skus(code, name, sku_packaging(cans_per_tray, can_size_oz)), formulas(formula_number, name, version, base_quantity, base_unit_of_measure, density_lbs_per_gallon), batches(id, batch_number, status)"
    )
    .order("created_at", { ascending: false });

  if (clientId) query = query.eq("client_id", clientId);
  if (status) query = query.eq("status", status);

  const [{ data: orders }, { data: clients }] = await Promise.all([
    query,
    supabase.from("clients").select("id, name").order("name"),
  ]);

  const allOrders = (orders ?? []) as unknown as OrderRow[];
  const filtered = q
    ? allOrders.filter((o) =>
        [o.order_number, o.clients?.name, o.skus?.name].some((v) =>
          v?.toLowerCase().includes(q.toLowerCase())
        )
      )
    : allOrders;

  const counts = {
    total: filtered.length,
    pending: filtered.filter((o) => o.status === "pending").length,
    active: filtered.filter((o) => o.status === "scheduled" || o.status === "in_progress").length,
    complete: filtered.filter((o) => o.status === "complete").length,
  };

  // Material availability check for pending orders
  const pendingOrders = filtered.filter((o) => o.status === "pending");

  const pendingBatchIds = pendingOrders.flatMap((o) => {
    const batch = o.batches?.find((b) => b.status !== "cancelled") ?? o.batches?.[0];
    return batch?.id ? [batch.id] : [];
  });
  const batchIdForOrder: Record<string, string> = {};
  for (const o of pendingOrders) {
    const batch = o.batches?.find((b) => b.status !== "cancelled") ?? o.batches?.[0];
    if (batch?.id) batchIdForOrder[o.id] = batch.id;
  }

  const pendingFormulaIds = [
    ...new Set(pendingOrders.map((o) => o.formula_id).filter(Boolean) as string[]),
  ];

  // Fetch batch lines and formula lines in parallel
  const [{ data: batchLineRows }, { data: formulaLineRows }] = await Promise.all([
    pendingBatchIds.length
      ? supabase
          .from("batch_lines")
          .select("batch_id, item_id, planned_quantity, unit_of_measure, items(name)")
          .in("batch_id", pendingBatchIds)
      : Promise.resolve({
          data: [] as {
            batch_id: string;
            item_id: string;
            planned_quantity: number;
            unit_of_measure: string;
            items: { name: string } | null;
          }[],
        }),
    pendingFormulaIds.length
      ? supabase
          .from("formula_lines")
          .select(
            "formula_id, item_id, quantity, unit_of_measure, quantity_basis, items(name)",
          )
          .eq("line_type", "ingredient")
          .in("formula_id", pendingFormulaIds)
      : Promise.resolve({
          data: [] as {
            formula_id: string;
            item_id: string;
            quantity: number;
            unit_of_measure: string;
            quantity_basis: IngredientQuantityBasis;
            items: { name: string } | null;
          }[],
        }),
  ]);

  const pendingSkuIds = [
    ...new Set(pendingOrders.map((o) => o.sku_id).filter(Boolean) as string[]),
  ];
  const { data: packagingLineRows } = pendingSkuIds.length
    ? await supabase
        .from("sku_packaging_lines")
        .select(
          "packaging_id, item_id, quantity, unit_of_measure, quantity_basis, items(name)",
        )
        .in("packaging_id", pendingSkuIds)
    : {
        data: [] as {
          packaging_id: string;
          item_id: string;
          quantity: number;
          unit_of_measure: string;
          quantity_basis: string;
          items: { name: string } | null;
        }[],
      };

  const batchItemIds = (batchLineRows ?? []).map((l) => l.item_id);
  const formulaItemIds = (formulaLineRows ?? []).map((l) => l.item_id);
  const packagingItemIds = (packagingLineRows ?? []).map((l) => l.item_id);
  const allItemIds = [
    ...new Set([...batchItemIds, ...formulaItemIds, ...packagingItemIds]),
  ];
  const clientIds = [...new Set(pendingOrders.map((o) => o.client_id))];

  // On-hand only from the summary. Reservations come from open batch_lines so
  // UOM mismatches (e.g. reserved in g, on hand in lbs) convert correctly, and
  // each order ignores its own reserve.
  const [{ data: invRows }, { data: openReservationOrders }] = await Promise.all([
    allItemIds.length
      ? supabase
          .from("inventory_item_summary")
          .select(
            "client_id, item_id, item_name, unit_of_measure, quantity_on_hand",
          )
          .in("item_id", allItemIds)
          .in("client_id", clientIds)
      : Promise.resolve({
          data: [] as {
            client_id: string;
            item_id: string;
            item_name: string;
            unit_of_measure: string;
            quantity_on_hand: number;
          }[],
        }),
    clientIds.length
      ? supabase
          .from("production_orders")
          .select(
            "id, client_id, created_at, batches(id, status, batch_lines(item_id, planned_quantity, unit_of_measure))",
          )
          .in("client_id", clientIds)
          .in("status", ["pending", "scheduled", "in_progress"])
      : Promise.resolve({
          data: [] as {
            id: string;
            client_id: string;
            created_at: string;
            batches:
              | {
                  id: string;
                  status: string;
                  batch_lines:
                    | {
                        item_id: string;
                        planned_quantity: number;
                        unit_of_measure: string;
                      }[]
                    | null;
                }[]
              | null;
          }[],
        }),
  ]);

  const onHandByClient: Record<string, InventoryAvailabilityRow[]> = {};
  for (const row of invRows ?? []) {
    (onHandByClient[row.client_id] ??= []).push({
      itemId: row.item_id,
      itemName: row.item_name,
      unitOfMeasure: row.unit_of_measure,
      quantity: Number(row.quantity_on_hand),
    });
  }

  const reservationsByOrder: Record<
    string,
    { clientId: string; createdAt: string; lines: ReservationLine[] }
  > = {};
  for (const openOrder of (openReservationOrders ?? []) as {
    id: string;
    client_id: string;
    created_at: string;
    batches:
      | {
          id: string;
          status: string;
          batch_lines:
            | {
                item_id: string;
                planned_quantity: number;
                unit_of_measure: string;
              }[]
            | null;
        }[]
      | null;
  }[]) {
    const lines: ReservationLine[] = [];
    for (const batch of openOrder.batches ?? []) {
      if (
        batch.status !== "draft" &&
        batch.status !== "scheduled" &&
        batch.status !== "in_progress"
      ) {
        continue;
      }
      for (const line of batch.batch_lines ?? []) {
        lines.push({
          itemId: line.item_id,
          quantity: Number(line.planned_quantity),
          unitOfMeasure: line.unit_of_measure,
        });
      }
    }
    reservationsByOrder[openOrder.id] = {
      clientId: openOrder.client_id,
      createdAt: openOrder.created_at,
      lines,
    };
  }

  // First-come-first-served: only orders created before `order` hold a claim
  // against it. Otherwise every order in a competing group counts every
  // other one as "using up" the same stock and all show short.
  function otherReservationLinesForOrder(order: {
    id: string;
    client_id: string;
    created_at: string;
  }) {
    const lines: ReservationLine[] = [];
    for (const [id, entry] of Object.entries(reservationsByOrder)) {
      if (id === order.id || entry.clientId !== order.client_id) continue;
      if (
        !hasReservationPriority(
          { id, createdAt: entry.createdAt },
          { id: order.id, createdAt: order.created_at },
        )
      ) {
        continue;
      }
      lines.push(...entry.lines);
    }
    return lines;
  }

  const linesByBatch: Record<
    string,
    {
      item_id: string;
      planned_quantity: number;
      unit_of_measure: string;
      items: NamedItem | null;
    }[]
  > = {};
  for (const line of (batchLineRows ?? []) as unknown as {
    batch_id: string;
    item_id: string;
    planned_quantity: number;
    unit_of_measure: string;
    items: NamedItem | NamedItem[] | null;
  }[]) {
    (linesByBatch[line.batch_id] ??= []).push({
      item_id: line.item_id,
      planned_quantity: Number(line.planned_quantity),
      unit_of_measure: line.unit_of_measure,
      items: asNamedItem(line.items),
    });
  }

  const linesByFormula: Record<
    string,
    {
      item_id: string;
      quantity: number;
      unit_of_measure: string;
      quantity_basis: IngredientQuantityBasis;
      items: NamedItem | null;
    }[]
  > = {};
  for (const line of (formulaLineRows ?? []) as unknown as {
    formula_id: string;
    item_id: string;
    quantity: number;
    unit_of_measure: string;
    quantity_basis: IngredientQuantityBasis;
    items: NamedItem | NamedItem[] | null;
  }[]) {
    (linesByFormula[line.formula_id] ??= []).push({
      item_id: line.item_id,
      quantity: Number(line.quantity),
      unit_of_measure: line.unit_of_measure,
      quantity_basis: line.quantity_basis ?? "per_batch",
      items: asNamedItem(line.items),
    });
  }

  const linesBySku: Record<
    string,
    {
      item_id: string;
      quantity: number;
      unit_of_measure: string;
      quantity_basis: string;
      items: NamedItem | null;
    }[]
  > = {};
  for (const line of (packagingLineRows ?? []) as unknown as {
    packaging_id: string;
    item_id: string;
    quantity: number;
    unit_of_measure: string;
    quantity_basis: string;
    items: NamedItem | NamedItem[] | null;
  }[]) {
    (linesBySku[line.packaging_id] ??= []).push({
      item_id: line.item_id,
      quantity: Number(line.quantity),
      unit_of_measure: line.unit_of_measure,
      quantity_basis: line.quantity_basis,
      items: asNamedItem(line.items),
    });
  }

  const materialStatus: Record<string, MaterialStatus> = {};
  for (const order of pendingOrders) {
    const batchId = batchIdForOrder[order.id];
    const batchLines = batchId ? (linesByBatch[batchId] ?? []) : [];
    const onHandInventory = onHandByClient[order.client_id] ?? [];
    const otherReservations = otherReservationLinesForOrder(order);

    if (batchLines.length > 0) {
      const hasShortage = batchLines.some((line) => {
        const freeForOrder = freeQuantityForOrder({
          onHand: availableQuantityForItem(
            onHandInventory,
            line.item_id,
            line.unit_of_measure,
            line.items?.name,
          ),
          reservedOther: reservedQuantityForItem(
            otherReservations,
            line.item_id,
            line.unit_of_measure,
          ),
        });
        return freeForOrder < Number(line.planned_quantity);
      });
      materialStatus[order.id] = hasShortage ? "short" : "sufficient";
      continue;
    }

    // Fall back to formula ingredients + SKU packaging scaled to ordered qty
    const formulaId = order.formula_id;
    const baseQty = order.formulas?.base_quantity;
    const baseUom = order.formulas?.base_unit_of_measure ?? "";
    const formulaLines = formulaId ? (linesByFormula[formulaId] ?? []) : [];
    const packagingLines = order.sku_id
      ? (linesBySku[order.sku_id] ?? [])
      : [];

    if ((formulaLines.length === 0 && packagingLines.length === 0) || !baseQty) {
      materialStatus[order.id] = "unknown";
      continue;
    }

    const skuPackaging = Array.isArray(order.skus?.sku_packaging)
      ? order.skus?.sku_packaging[0]
      : order.skus?.sku_packaging;

    const requirements = buildScaledRequirements({
      orderQuantity: Number(order.ordered_quantity),
      orderUnitOfMeasure: order.unit_of_measure,
      baseQuantity: Number(baseQty),
      baseUnitOfMeasure: baseUom,
      cansPerTray: skuPackaging?.cans_per_tray,
      canSizeOz:
        skuPackaging?.can_size_oz != null
          ? Number(skuPackaging.can_size_oz)
          : null,
      densityLbsPerGallon:
        order.formulas?.density_lbs_per_gallon != null
          ? Number(order.formulas.density_lbs_per_gallon)
          : null,
      ingredients: formulaLines.map((line) => ({
        itemId: line.item_id,
        itemName: line.items?.name ?? "",
        quantity: Number(line.quantity),
        unitOfMeasure: line.unit_of_measure,
        quantityBasis: line.quantity_basis,
      })),
      packaging: packagingLines.map((line) => ({
        itemId: line.item_id,
        itemName: line.items?.name ?? "",
        quantity: Number(line.quantity),
        unitOfMeasure: line.unit_of_measure,
        quantityBasis: line.quantity_basis,
      })),
    });

    if (!requirements) {
      materialStatus[order.id] = "unknown";
      continue;
    }

    // No batch lines yet — this order reserves nothing; subtract other open work.
    const hasShortage = requirements.some((req) => {
      if (req.unlimited) return false;
      const freeForOrder = freeQuantityForOrder({
        onHand: availableQuantityForItem(
          onHandInventory,
          req.itemId,
          req.unitOfMeasure,
          req.itemName,
        ),
        reservedOther: reservedQuantityForItem(
          otherReservations,
          req.itemId,
          req.unitOfMeasure,
        ),
      });
      return freeForOrder < req.required;
    });
    materialStatus[order.id] = hasShortage ? "short" : "sufficient";
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Production Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All client orders and their fulfilment status.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total", value: counts.total },
          { label: "Pending", value: counts.pending },
          { label: "Active", value: counts.active },
          { label: "Complete", value: counts.complete },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-3xl font-bold">{value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Orders</CardTitle>
          <Filters
            clients={(clients ?? []) as { id: string; name: string }[]}
            clientId={clientId}
            status={status}
            q={q}
          />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Order #</th>
                  <th className="pb-2 text-left font-medium">Batch #</th>
                  <th className="pb-2 text-left font-medium">Client</th>
                  <th className="pb-2 text-left font-medium">Product</th>
                  <th className="pb-2 text-left font-medium">Formula</th>
                  <th className="pb-2 text-right font-medium">Ordered</th>
                  <th className="pb-2 text-right font-medium">Actual</th>
                  <th className="pb-2 text-left font-medium">Status</th>
                  <th className="pb-2 text-left font-medium">Materials</th>
                  <th className="pb-2 text-right font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="py-2 pr-4 font-mono text-xs font-medium">
                      <Link
                        href={`/dashboard/production/${order.id}`}
                        className="hover:underline"
                      >
                        {order.order_number}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      {(() => {
                        const batch = order.batches?.find(
                          (b) => b.status !== "cancelled"
                        ) ?? order.batches?.[0];
                        return batch?.batch_number ? (
                          <Link
                            href={`/dashboard/production/${order.id}`}
                            className="font-mono text-xs font-medium hover:underline"
                          >
                            {batch.batch_number}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        );
                      })()}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {order.clients?.name ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {order.skus ? (
                        <>
                          <span className="font-medium">{order.skus.name}</span>
                          <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                            {order.skus.code}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {order.formulas ? (
                        <span className="font-mono text-xs">
                          {order.formulas.formula_number ?? order.formulas.name ?? `v${order.formulas.version}`}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {Number(order.ordered_quantity).toLocaleString()}{" "}
                      <span className="text-muted-foreground">{order.unit_of_measure}</span>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                      {order.actual_quantity != null
                        ? `${Number(order.actual_quantity).toLocaleString()} ${order.unit_of_measure}`
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="py-2 pr-4">
                      {order.status === "pending" ? (
                        <MaterialsBadge status={materialStatus[order.id]} orderId={order.id} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap text-muted-foreground">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No production orders found.
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

function Filters({
  clients,
  clientId,
  status,
  q,
}: {
  clients: { id: string; name: string }[];
  clientId: string;
  status: string;
  q: string;
}) {
  return (
    <form method="GET" className="flex flex-wrap gap-2 pt-1">
      <input
        name="q"
        defaultValue={q}
        placeholder="Search orders…"
        className="h-8 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <select
        name="clientId"
        defaultValue={clientId}
        className="h-8 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        name="status"
        defaultValue={status}
        className="h-8 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="scheduled">Scheduled</option>
        <option value="in_progress">In Progress</option>
        <option value="complete">Complete</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <button
        type="submit"
        className="h-8 rounded-md border bg-background px-3 text-sm hover:bg-muted"
      >
        Filter
      </button>
      {(clientId || status || q) && (
        <a
          href="/dashboard/production-orders"
          className="flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          Clear
        </a>
      )}
    </form>
  );
}

function MaterialsBadge({
  status,
  orderId,
}: {
  status: MaterialStatus | undefined;
  orderId: string;
}) {
  if (!status || status === "unknown") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (status === "sufficient") {
    return (
      <Link href={`/dashboard/production/${orderId}#material-readiness`}>
        <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100 cursor-pointer">
          Ready
        </Badge>
      </Link>
    );
  }
  return (
    <Link href={`/dashboard/production/${orderId}#material-readiness`}>
      <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 cursor-pointer">
        Short
      </Badge>
    </Link>
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

function PageFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Production Orders</h1>
        <div className="mt-1 h-4 w-56 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-10 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <div className="h-5 w-20 animate-pulse rounded bg-muted" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-5 w-full animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

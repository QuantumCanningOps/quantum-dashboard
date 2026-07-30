import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { EditableContacts } from "./EditableContacts";

type DetailPageProps = {
  params: Promise<{ id: string }>;
};

type InventoryRow = {
  item_id: string;
  item_name: string;
  item_type: string;
  unit_of_measure: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
};

const LOT_STATUSES = [
  "released",
  "quarantine",
  "on_hold",
  "consumed",
  "destroyed",
] as const;

const RECENT_ORDERS_LIMIT = 20;
const RECENT_LOTS_LIMIT = 25;
const INVENTORY_PREVIEW_LIMIT = 15;

export default function ClientDetailPage({ params }: DetailPageProps) {
  return (
    <Suspense fallback={<ClientDetailFallback />}>
      <ClientDetail params={params} />
    </Suspense>
  );
}

async function ClientDetail({ params }: DetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, code, active")
    .eq("id", id)
    .single();

  if (!client) notFound();

  const lotStatusCountQueries = LOT_STATUSES.map((status) =>
    supabase
      .from("lots")
      .select("*", { count: "exact", head: true })
      .eq("client_id", id)
      .eq("status", status),
  );

  const [
    { data: contacts },
    { data: skus },
    { count: totalLotsCount },
    { count: attentionLotsCount },
    { data: recentLots },
    { data: openOrderRows },
    { count: openOrdersCount },
    { data: recentOrders },
    { count: totalOrdersCount },
    { data: inventory },
    ...lotStatusCountResults
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, name, email, phone, role, primary_contact")
      .eq("party_type", "client")
      .eq("party_id", id)
      .order("primary_contact", { ascending: false })
      .order("name"),
    supabase
      .from("skus")
      .select(
        "id, code, name, shelf_life_days, formula_id, formulas(id, version, status, formula_number, name)",
      )
      .eq("client_id", id)
      .order("code"),
    supabase
      .from("lots")
      .select("*", { count: "exact", head: true })
      .eq("client_id", id),
    supabase
      .from("lots")
      .select("*", { count: "exact", head: true })
      .eq("client_id", id)
      .in("status", ["quarantine", "on_hold"]),
    supabase
      .from("lots")
      .select(
        "id, lot_number, status, received_at, expiration_date, notes, items(name, item_type)",
      )
      .eq("client_id", id)
      .order("received_at", { ascending: false })
      .limit(RECENT_LOTS_LIMIT),
    supabase
      .from("production_orders")
      .select(
        "id, order_number, sku_id, ordered_quantity, unit_of_measure, status",
      )
      .eq("client_id", id)
      .in("status", ["pending", "scheduled", "in_progress"])
      .order("created_at", { ascending: false }),
    supabase
      .from("production_orders")
      .select("*", { count: "exact", head: true })
      .eq("client_id", id)
      .in("status", ["pending", "scheduled", "in_progress"]),
    supabase
      .from("production_orders")
      .select(
        "id, order_number, sku_id, ordered_quantity, actual_quantity, unit_of_measure, status, created_at, skus(code, name)",
      )
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(RECENT_ORDERS_LIMIT),
    supabase
      .from("production_orders")
      .select("*", { count: "exact", head: true })
      .eq("client_id", id),
    supabase
      .from("inventory_item_summary")
      .select(
        "item_id, item_name, item_type, unit_of_measure, quantity_on_hand, quantity_reserved, quantity_available",
      )
      .eq("client_id", id)
      .order("item_name"),
    ...lotStatusCountQueries,
  ]);

  const openOrders = openOrderRows ?? [];
  const orderRows = recentOrders ?? [];
  const openOrderCount = openOrdersCount ?? openOrders.length;
  const totalOrderCount = totalOrdersCount ?? orderRows.length;
  const ordersBySku = openOrders.reduce(
    (acc, o) => {
      if (o.sku_id) (acc[o.sku_id] ??= []).push(o);
      return acc;
    },
    {} as Record<string, typeof openOrders>,
  );

  const totalLots = totalLotsCount ?? 0;
  const attentionCount = attentionLotsCount ?? 0;
  const lotsByStatus = LOT_STATUSES.reduce(
    (acc, status, index) => {
      const count = lotStatusCountResults[index]?.count ?? 0;
      if (count > 0) acc[status] = count;
      return acc;
    },
    {} as Record<string, number>,
  );
  const clientLots = recentLots ?? [];

  const inventoryRows = [...((inventory ?? []) as InventoryRow[])].sort(
    (a, b) => {
      const aOver = Number(a.quantity_available) < 0 ? 0 : 1;
      const bOver = Number(b.quantity_available) < 0 ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      const aReserved = Number(a.quantity_reserved) > 0 ? 0 : 1;
      const bReserved = Number(b.quantity_reserved) > 0 ? 0 : 1;
      if (aReserved !== bReserved) return aReserved - bReserved;
      return a.item_name.localeCompare(b.item_name);
    },
  );
  const overBooked = inventoryRows.filter((r) => r.quantity_available < 0).length;
  const withReservations = inventoryRows.filter(
    (r) => r.quantity_reserved > 0,
  ).length;
  const inventoryPreview = inventoryRows.slice(0, INVENTORY_PREVIEW_LIMIT);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold">{client.name}</h2>
        <Badge className="bg-slate-100 text-slate-600 border-slate-200 font-mono">
          {client.code}
        </Badge>
        {!client.active && (
          <Badge className="bg-red-100 text-red-700 border-red-200">
            Inactive
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="SKUs" value={(skus ?? []).length} />
        <StatCard label="Open Orders" value={openOrderCount} />
        <StatCard label="Total Lots" value={totalLots} />
        <StatCard
          label="Needs Attention"
          value={attentionCount}
          emphasize={attentionCount > 0}
        />
        <StatCard
          label="Over-booked Items"
          value={overBooked}
          emphasize={overBooked > 0}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lot Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(lotsByStatus).map(([status, count]) => (
                <span
                  key={status}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <LotStatusBadge status={status} />
                  <span className="tabular-nums font-medium text-foreground">
                    {count}
                  </span>
                </span>
              ))}
              {totalLots === 0 && (
                <p className="text-sm text-muted-foreground">No lots yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <EditableContacts clientId={id} contacts={contacts ?? []} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">SKUs & Formulas</CardTitle>
          <ButtonLink href="/dashboard/formulas/new">+ New Formula</ButtonLink>
        </CardHeader>
        <CardContent>
          {(skus ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No SKUs</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(skus ?? []).map((sku) => {
                const formula = sku.formulas as unknown as {
                  id: string;
                  version: number;
                  status: string;
                  formula_number: string | null;
                  name: string | null;
                } | null;
                const skuOrders = ordersBySku[sku.id] ?? [];
                return (
                  <li
                    key={sku.id}
                    className="flex flex-col gap-1 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {sku.code}
                      </span>
                      <span className="text-sm font-medium">{sku.name}</span>
                      {sku.shelf_life_days != null && (
                        <span className="text-xs text-muted-foreground">
                          {sku.shelf_life_days}d shelf life
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-3">
                        {formula ? (
                          <>
                            <Link
                              href={`/dashboard/formulas/${sku.formula_id}`}
                              className="text-xs text-muted-foreground hover:underline"
                            >
                              {formula.formula_number ?? "Formula"} v
                              {formula.version}
                              {formula.status === "authorized" && (
                                <span className="ml-1 text-green-600">✓</span>
                              )}
                            </Link>
                            <Link
                              href={`/dashboard/formulas/${sku.formula_id}`}
                              className="text-xs font-medium text-foreground hover:underline"
                            >
                              Edit formula
                            </Link>
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-muted-foreground">
                              No formula
                            </span>
                            <Link
                              href={`/dashboard/formulas/new?clientId=${id}&skuId=${sku.id}`}
                              className="text-xs font-medium text-foreground hover:underline"
                            >
                              Add formula
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                    {skuOrders.length > 0 && (
                      <ul className="ml-4 flex flex-col gap-0.5">
                        {skuOrders.map((order) => (
                          <li
                            key={order.id}
                            className="flex items-center gap-2"
                          >
                            <Link
                              href={`/dashboard/production/${order.id}`}
                              className="font-mono text-xs text-muted-foreground hover:underline"
                            >
                              {order.order_number}
                            </Link>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {Number(order.ordered_quantity).toLocaleString()}{" "}
                              {order.unit_of_measure}
                            </span>
                            <OrderStatusBadge status={order.status} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">
            Production Orders
            {openOrderCount > 0 && (
              <span className="ml-2 font-normal text-muted-foreground">
                ({openOrderCount} open)
              </span>
            )}
          </CardTitle>
          <ButtonLink href={`/dashboard/production-orders?clientId=${id}`}>
            View all →
          </ButtonLink>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Order</th>
                  <th className="pb-2 text-left font-medium">SKU</th>
                  <th className="pb-2 text-left font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Ordered</th>
                  <th className="pb-2 text-right font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {orderRows.map((order) => {
                  const sku = order.skus as unknown as {
                    code: string;
                    name: string;
                  } | null;
                  return (
                    <tr
                      key={order.id}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="py-2 pr-4 font-mono text-xs">
                        <Link
                          href={`/dashboard/production/${order.id}`}
                          className="hover:underline"
                        >
                          {order.order_number}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        {sku ? (
                          <span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {sku.code}
                            </span>{" "}
                            {sku.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {Number(order.ordered_quantity).toLocaleString()}{" "}
                        <span className="text-muted-foreground">
                          {order.unit_of_measure}
                        </span>
                      </td>
                      <td className="py-2 text-right text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
                {orderRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No production orders
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {totalOrderCount > RECENT_ORDERS_LIMIT && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing {RECENT_ORDERS_LIMIT} of {totalOrderCount} orders.{" "}
              <Link
                href={`/dashboard/production-orders?clientId=${id}`}
                className="hover:underline"
              >
                See all
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-base">Recent Lots</CardTitle>
            <ButtonLink href={`/dashboard/lots?clientId=${id}`}>
              View lots →
            </ButtonLink>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Lot #</th>
                    <th className="pb-2 text-left font-medium">Item</th>
                    <th className="pb-2 text-left font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {clientLots.map((lot) => {
                    const item = lot.items as unknown as {
                      name: string;
                      item_type: string;
                    } | null;
                    return (
                      <tr
                        key={lot.id}
                        className="border-b last:border-0 hover:bg-muted/30"
                      >
                        <td className="py-2 pr-4 font-mono text-xs whitespace-nowrap">
                          <Link
                            href={`/dashboard/lots/${lot.id}`}
                            className="hover:underline"
                          >
                            {lot.lot_number}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">
                          {item?.name ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <LotStatusBadge status={lot.status} />
                        </td>
                        <td className="py-2 text-right text-muted-foreground">
                          {lot.received_at
                            ? new Date(lot.received_at).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {clientLots.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        No lots
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalLots > RECENT_LOTS_LIMIT && (
              <p className="mt-3 text-xs text-muted-foreground">
                Showing {RECENT_LOTS_LIMIT} of {totalLots} lots.{" "}
                <Link
                  href={`/dashboard/lots?clientId=${id}`}
                  className="hover:underline"
                >
                  See all
                </Link>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Inventory</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {inventoryRows.length} items · {withReservations} reserved
                {overBooked > 0 && ` · ${overBooked} over-booked`}
              </p>
            </div>
            <ButtonLink href={`/dashboard/inventory/summary?clientId=${id}`}>
              Full summary →
            </ButtonLink>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Item</th>
                    <th className="pb-2 text-left font-medium">Type</th>
                    <th className="pb-2 text-right font-medium">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryPreview.map((row) => (
                    <tr
                      key={row.item_id}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="py-2 pr-4 font-medium">{row.item_name}</td>
                      <td className="py-2 pr-4">
                        <ItemTypeBadge type={row.item_type} />
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium">
                        <AvailableQty row={row} />
                      </td>
                    </tr>
                  ))}
                  {inventoryRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        No inventory on hand
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {inventoryRows.length > INVENTORY_PREVIEW_LIMIT && (
              <p className="mt-3 text-xs text-muted-foreground">
                Showing {INVENTORY_PREVIEW_LIMIT} of {inventoryRows.length}{" "}
                items
                {overBooked > 0 ? " (over-booked first)" : ""}.{" "}
                <Link
                  href={`/dashboard/inventory/summary?clientId=${id}`}
                  className="hover:underline"
                >
                  See all
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span
          className={`text-3xl font-bold ${emphasize ? "text-red-600" : ""}`}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

function ButtonLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="shrink-0 text-xs text-muted-foreground hover:text-foreground hover:underline"
    >
      {children}
    </Link>
  );
}

function AvailableQty({ row }: { row: InventoryRow }) {
  const qty = Number(row.quantity_available);
  const uom = (
    <span className="font-normal text-muted-foreground">
      {row.unit_of_measure}
    </span>
  );
  if (qty < 0) {
    return (
      <span className="text-red-600">
        {qty.toLocaleString()} {uom}
      </span>
    );
  }
  if (row.quantity_reserved > 0) {
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

function ClientDetailFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-8 w-56 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-9 w-12 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    scheduled: "bg-blue-50 text-blue-700 border-blue-200",
    in_progress: "bg-violet-50 text-violet-700 border-violet-200",
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
    <Badge className={`text-[10px] px-1.5 py-0 ${map[status] ?? ""}`}>
      {labels[status] ?? status}
    </Badge>
  );
}

function LotStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    released: "bg-green-100 text-green-800 border-green-200",
    quarantine: "bg-yellow-100 text-yellow-800 border-yellow-200",
    on_hold: "bg-red-100 text-red-800 border-red-200",
    consumed: "bg-gray-100 text-gray-600 border-gray-200",
    destroyed: "bg-gray-100 text-gray-600 border-gray-200",
  };
  const labels: Record<string, string> = {
    released: "Released",
    quarantine: "Quarantine",
    on_hold: "On Hold",
    consumed: "Consumed",
    destroyed: "Destroyed",
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

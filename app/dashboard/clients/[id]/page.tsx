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

const RECENT_ORDERS_LIMIT = 20;
const ACTIVE_LOT_STATUSES = ["quarantine", "released", "on_hold"] as const;

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

  const [
    { data: contacts },
    { data: skus },
    { data: openOrderRows },
    { count: openOrdersCount },
    { data: recentOrders },
    { count: totalOrdersCount },
    { data: inventory },
    { data: activeLots },
    { data: clientFormulas },
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
        "id, code, name, shelf_life_days, formula_id, sku_packaging(cans_per_tray, can_type, lid_color), formulas(id, version, status, formula_number, name)",
      )
      .eq("client_id", id)
      .order("code"),
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
    // Needs Attention — same rules as /dashboard/needs-attention (scoped to client)
    supabase
      .from("lots")
      .select("id, items(requires_coa)")
      .eq("client_id", id)
      .in("status", [...ACTIVE_LOT_STATUSES]),
    supabase
      .from("formulas")
      .select("id")
      .eq("client_id", id)
      .not("status", "eq", "retired"),
  ]);

  const activeLotRows = activeLots ?? [];
  const formulaRows = clientFormulas ?? [];
  const activeLotIds = activeLotRows.map((lot) => lot.id);
  const formulaIds = formulaRows.map((formula) => formula.id);

  const [{ data: coaDocs }, { data: paDocs }, { data: unapprovedArtwork }] =
    await Promise.all([
      activeLotIds.length > 0
        ? supabase
            .from("documents")
            .select("lot_id")
            .eq("document_type", "coa")
            .in("lot_id", activeLotIds)
        : Promise.resolve({ data: [] as { lot_id: string }[] }),
      formulaIds.length > 0
        ? supabase
            .from("documents")
            .select("formula_id")
            .eq("document_type", "pa_letter")
            .in("formula_id", formulaIds)
        : Promise.resolve({ data: [] as { formula_id: string }[] }),
      supabase
        .from("documents")
        .select("id")
        .eq("document_type", "artwork")
        .eq("client_id", id)
        .neq("artwork_status", "approved"),
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

  const lotIdsWithCoa = new Set(
    (coaDocs ?? []).map((d) => d.lot_id as string),
  );
  const formulaIdsWithPa = new Set(
    (paDocs ?? []).map((d) => d.formula_id as string),
  );

  const missingCoaCount = activeLotRows.filter((lot) => {
    const item = lot.items as unknown as { requires_coa: boolean } | null;
    return item?.requires_coa === true && !lotIdsWithCoa.has(lot.id);
  }).length;

  const missingPaCount = formulaRows.filter(
    (f) => !formulaIdsWithPa.has(f.id),
  ).length;

  const unapprovedArtworkCount = (unapprovedArtwork ?? []).length;
  const attentionCount =
    missingCoaCount + missingPaCount + unapprovedArtworkCount;

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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="SKUs" value={(skus ?? []).length} />
        <StatCard label="Open Orders" value={openOrderCount} />
        <StatCard
          label="Needs Attention"
          value={attentionCount}
          emphasize={attentionCount > 0}
        />
      </div>

      <EditableContacts clientId={id} contacts={contacts ?? []} />

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
                const packaging = (
                  Array.isArray(sku.sku_packaging)
                    ? sku.sku_packaging[0]
                    : sku.sku_packaging
                ) as {
                  cans_per_tray: number;
                  can_type: string;
                  lid_color: string;
                } | null;
                const skuOrders = ordersBySku[sku.id] ?? [];
                const rowHref = formula
                  ? `/dashboard/formulas/${sku.formula_id}`
                  : `/dashboard/formulas/new?clientId=${id}&skuId=${sku.id}`;
                return (
                  <li
                    key={sku.id}
                    className="flex flex-col gap-1 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <Link
                      href={rowHref}
                      className="-mx-2 flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
                    >
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {sku.code}
                      </span>
                      <span className="text-sm font-medium">{sku.name}</span>
                      {sku.shelf_life_days != null && (
                        <span className="text-xs text-muted-foreground">
                          {sku.shelf_life_days}d shelf life
                        </span>
                      )}
                      {packaging && (
                        <span className="text-xs text-muted-foreground">
                          {packaging.cans_per_tray}-can trays ·{" "}
                          {packaging.can_type} · {packaging.lid_color} lids
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-3">
                        {formula ? (
                          <>
                            <span className="text-xs text-muted-foreground">
                              {formula.formula_number ?? "Formula"} v
                              {formula.version}
                              {formula.status === "authorized" && (
                                <span className="ml-1 text-green-600">✓</span>
                              )}
                            </span>
                            <span className="text-xs font-medium text-foreground">
                              Edit formula
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-muted-foreground">
                              No formula
                            </span>
                            <span className="text-xs font-medium text-foreground">
                              Add formula
                            </span>
                          </>
                        )}
                      </div>
                    </Link>
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
                {inventoryRows.map((row) => (
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
        </CardContent>
      </Card>
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
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
      <Card>
        <CardHeader>
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
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

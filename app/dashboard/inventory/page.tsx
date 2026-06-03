import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InventoryFilters } from "./InventoryFilters";
import Link from "next/link";
import { Suspense } from "react";

type InventoryPageProps = {
  searchParams?: Promise<{
    clientId?: string;
    itemId?: string;
    supplierId?: string;
    itemType?: string;
    status?: string;
    location?: string;
    q?: string;
  }>;
};

type InventoryRow = {
  lot_id: string;
  lot_number: string;
  client_id: string;
  client_name: string;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_code: string | null;
  item_name: string;
  item_type: string;
  location_label: string | null;
  zone_name: string | null;
  is_offsite: boolean | null;
  unit_of_measure: string;
  expiration_date: string | null;
  lot_status: string;
  quantity_on_hand: number;
};

type FilterOption = {
  id: string;
  name: string;
  code?: string | null;
};

type ItemSummary = {
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  unit_of_measure: string;
};

const itemTypeOptions = [
  "raw_ingredient",
  "packaging",
  "wip",
  "finished_good",
];

const statusOptions = ["released", "quarantine", "on_hold", "consumed"];

export default function InventoryPage({ searchParams }: InventoryPageProps) {
  return (
    <Suspense fallback={<InventoryFallback />}>
      <InventoryTable searchParams={searchParams} />
    </Suspense>
  );
}

async function InventoryTable({ searchParams }: InventoryPageProps) {
  const supabase = await createClient();
  const filters = normalizeFilters((await searchParams) ?? {});

  let inventoryQuery = supabase
    .from("inventory_on_hand")
    .select("*")
    .order("client_name")
    .order("item_name");

  if (filters.clientId) {
    inventoryQuery = inventoryQuery.eq("client_id", filters.clientId);
  }

  if (filters.itemId) {
    inventoryQuery = inventoryQuery.eq("item_id", filters.itemId);
  }

  if (filters.supplierId) {
    inventoryQuery = inventoryQuery.eq("supplier_id", filters.supplierId);
  }

  if (filters.itemType) {
    inventoryQuery = inventoryQuery.eq("item_type", filters.itemType);
  }

  if (filters.status) {
    inventoryQuery = inventoryQuery.eq("lot_status", filters.status);
  }

  if (filters.location === "offsite") {
    inventoryQuery = inventoryQuery.eq("is_offsite", true);
  } else if (filters.location === "onsite") {
    inventoryQuery = inventoryQuery.eq("is_offsite", false);
  }

  const [
    { data: inventory },
    { data: item },
    { data: client },
    { data: clients },
    { data: suppliers },
    { data: summaryRows },
  ] =
    await Promise.all([
      inventoryQuery,
      filters.itemId
        ? supabase
            .from("items")
            .select("name, item_type")
            .eq("id", filters.itemId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      filters.clientId
        ? supabase
            .from("clients")
            .select("name, code")
            .eq("id", filters.clientId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("clients").select("id, name, code").order("name"),
      supabase.from("suppliers").select("id, name, code").order("name"),
      filters.itemId
        ? (() => {
            let q = supabase
              .from("inventory_item_summary")
              .select(
                "quantity_on_hand, quantity_reserved, quantity_available, unit_of_measure",
              )
              .eq("item_id", filters.itemId);
            if (filters.clientId) q = q.eq("client_id", filters.clientId);
            return q;
          })()
        : Promise.resolve({ data: null }),
    ]);

  const itemSummary: ItemSummary | null = summaryRows?.length
    ? {
        quantity_on_hand: summaryRows.reduce(
          (s, r) => s + Number(r.quantity_on_hand),
          0,
        ),
        quantity_reserved: summaryRows.reduce(
          (s, r) => s + Number(r.quantity_reserved),
          0,
        ),
        quantity_available: summaryRows.reduce(
          (s, r) => s + Number(r.quantity_available),
          0,
        ),
        unit_of_measure: summaryRows[0].unit_of_measure,
      }
    : null;

  const inventoryRows = (inventory ?? []) as InventoryRow[];
  const rows = filters.q
    ? inventoryRows.filter((row) => inventoryRowMatchesSearch(row, filters.q))
    : inventoryRows;

  const uniqueLotIds = [...new Set(rows.map((r) => r.lot_id))];
  const { data: coaDocs } =
    uniqueLotIds.length > 0
      ? await supabase
          .from("documents")
          .select("id, lot_id")
          .in("lot_id", uniqueLotIds)
          .eq("document_type", "coa")
      : { data: [] as { id: string; lot_id: string }[] };

  const coaByLotId = new Map((coaDocs ?? []).map((d) => [d.lot_id, d.id]));

  const isFiltered = hasActiveFilters(filters);
  const totalRows = rows.length;
  const quarantineRows = rows.filter((r) => r.lot_status === "quarantine").length;
  const offsiteRows = rows.filter((r) => r.is_offsite).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {isFiltered && (
          <Link
            href="/dashboard/inventory"
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Back to all inventory
          </Link>
        )}
        <div>
          <h1 className="text-2xl font-bold">
            {item?.name ?? "Inventory On-Hand"}
          </h1>
          {isFiltered && (
            <p className="mt-1 text-sm text-muted-foreground">
              {client?.name
                ? `${client.name} inventory`
                : "Filtered inventory"}
              {item?.item_type ? ` · ${formatItemType(item.item_type)}` : ""}
            </p>
          )}
        </div>
      </div>

      {itemSummary && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                On Hand
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-3xl font-bold">
                {Number(itemSummary.quantity_on_hand).toLocaleString()}
              </span>
              <span className="ml-1.5 text-sm text-muted-foreground">
                {itemSummary.unit_of_measure}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Reserved
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span
                className={`text-3xl font-bold ${itemSummary.quantity_reserved > 0 ? "text-amber-700" : ""}`}
              >
                {Number(itemSummary.quantity_reserved).toLocaleString()}
              </span>
              <span className="ml-1.5 text-sm text-muted-foreground">
                {itemSummary.unit_of_measure}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Available
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span
                className={`text-3xl font-bold ${
                  itemSummary.quantity_available < 0
                    ? "text-red-600"
                    : itemSummary.quantity_reserved > 0
                      ? "text-green-700"
                      : ""
                }`}
              >
                {Number(itemSummary.quantity_available).toLocaleString()}
              </span>
              <span className="ml-1.5 text-sm text-muted-foreground">
                {itemSummary.unit_of_measure}
              </span>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Lot Lines
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold">{totalRows}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              In Quarantine
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold">{quarantineRows}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Offsite (3PL)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold">{offsiteRows}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Stock</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <InventoryFilters
            filters={filters}
            clients={(clients ?? []) as FilterOption[]}
            suppliers={(suppliers ?? []) as FilterOption[]}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Item</th>
                  <th className="pb-2 text-left font-medium">Type</th>
                  <th className="pb-2 text-left font-medium">Client</th>
                  <th className="pb-2 text-left font-medium">Supplier</th>
                  <th className="pb-2 text-left font-medium">Lot #</th>
                  <th className="pb-2 text-left font-medium">CoA</th>
                  <th className="pb-2 text-left font-medium">Location</th>
                  <th className="pb-2 text-left font-medium">Zone</th>
                  <th className="pb-2 text-left font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Expires</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.lot_id}-${row.location_label}`}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="py-2 pr-4 font-medium">{row.item_name}</td>
                    <td className="py-2 pr-4">
                      <ItemTypeBadge type={row.item_type} />
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {row.client_name}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {row.supplier_name ? (
                        <span>
                          {row.supplier_name}
                          {row.supplier_code && (
                            <span className="ml-1 font-mono text-xs">
                              {row.supplier_code}
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      <Link
                        href={`/dashboard/lots/${row.lot_id}`}
                        className="hover:underline text-foreground"
                      >
                        {row.lot_number}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      {coaByLotId.has(row.lot_id) ? (
                        <Link
                          href={`/dashboard/documents/${coaByLotId.get(row.lot_id)}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-teal-700 hover:underline font-medium"
                        >
                          View
                        </Link>
                      ) : (
                        <Link
                          href={`/dashboard/lots/${row.lot_id}`}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          No CoA
                        </Link>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {row.location_label ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {row.zone_name ? (
                        <span className="text-xs text-muted-foreground">
                          {row.zone_name}
                          {row.is_offsite && (
                            <Badge className="ml-1.5 text-xs bg-slate-100 text-slate-600 border-slate-200">
                              3PL
                            </Badge>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={row.lot_status} />
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {Number(row.quantity_on_hand).toLocaleString()}{" "}
                      <span className="text-muted-foreground font-normal">
                        {row.unit_of_measure}
                      </span>
                    </td>
                    <td className="py-2 text-right text-muted-foreground whitespace-nowrap">
                      {row.expiration_date
                        ? new Date(row.expiration_date).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={11}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No inventory on hand for this selection.
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

function InventoryFallback() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Inventory On-Hand</h1>

      <div className="grid grid-cols-3 gap-4">
        {["Lot Lines", "In Quarantine", "Offsite (3PL)"].map((label) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-9 w-16 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Stock</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-5 w-full animate-pulse rounded bg-muted"
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function normalizeFilters(
  searchParams: Awaited<NonNullable<InventoryPageProps["searchParams"]>>,
) {
  return {
    clientId: searchParams.clientId ?? "",
    itemId: searchParams.itemId ?? "",
    supplierId: searchParams.supplierId ?? "",
    itemType: itemTypeOptions.includes(searchParams.itemType ?? "")
      ? searchParams.itemType ?? ""
      : "",
    status: statusOptions.includes(searchParams.status ?? "")
      ? searchParams.status ?? ""
      : "",
    location:
      searchParams.location === "onsite" || searchParams.location === "offsite"
        ? searchParams.location
        : "",
    q: searchParams.q?.trim() ?? "",
  };
}

function hasActiveFilters(filters: ReturnType<typeof normalizeFilters>) {
  return Object.values(filters).some(Boolean);
}

function inventoryRowMatchesSearch(row: InventoryRow, query: string) {
  const normalizedQuery = query.toLowerCase();
  return [
    row.item_name,
    row.lot_number,
    row.client_name,
    row.supplier_name,
    row.supplier_code,
    row.location_label,
    row.zone_name,
  ].some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function formatItemType(type: string) {
  const labels: Record<string, string> = {
    raw_ingredient: "Ingredient",
    packaging: "Packaging",
    wip: "WIP",
    finished_good: "Finished",
  };
  return labels[type] ?? type;
}

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    released: "Released",
    quarantine: "Quarantine",
    on_hold: "On Hold",
    consumed: "Consumed",
  };
  return labels[status] ?? status;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    released: "bg-green-100 text-green-800 border-green-200",
    quarantine: "bg-yellow-100 text-yellow-800 border-yellow-200",
    on_hold: "bg-red-100 text-red-800 border-red-200",
    consumed: "bg-gray-100 text-gray-600 border-gray-200",
  };
  const labels: Record<string, string> = {
    released: "Released",
    quarantine: "Quarantine",
    on_hold: "On Hold",
    consumed: "Consumed",
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

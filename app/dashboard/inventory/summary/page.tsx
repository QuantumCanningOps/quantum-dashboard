import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Suspense } from "react";
import { SummaryFilters } from "./SummaryFilters";

type SummaryPageProps = {
  searchParams?: Promise<{
    clientId?: string;
    itemType?: string;
    q?: string;
  }>;
};

type SummaryRow = {
  item_id: string;
  item_name: string;
  item_type: string;
  client_id: string;
  client_name: string;
  unit_of_measure: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
};

type Client = { id: string; name: string };

const itemTypeOptions = [
  "raw_ingredient",
  "packaging",
  "wip",
  "finished_good",
];

export default function InventorySummaryPage({
  searchParams,
}: SummaryPageProps) {
  return (
    <Suspense fallback={<SummaryFallback />}>
      <SummaryTable searchParams={searchParams} />
    </Suspense>
  );
}

async function SummaryTable({ searchParams }: SummaryPageProps) {
  const supabase = await createClient();
  const params = (await searchParams) ?? {};

  const clientId = params.clientId ?? "";
  const itemType = itemTypeOptions.includes(params.itemType ?? "")
    ? (params.itemType ?? "")
    : "";
  const q = params.q?.trim() ?? "";

  let query = supabase
    .from("inventory_item_summary")
    .select("*")
    .order("client_name")
    .order("item_name");

  if (clientId) query = query.eq("client_id", clientId);
  if (itemType) query = query.eq("item_type", itemType);

  const [{ data: rows }, { data: clients }] = await Promise.all([
    query,
    supabase.from("clients").select("id, name").order("name"),
  ]);

  const allRows = (rows ?? []) as SummaryRow[];
  const filteredRows = q
    ? allRows.filter((r) =>
        [r.item_name, r.client_name].some((v) =>
          v?.toLowerCase().includes(q.toLowerCase()),
        ),
      )
    : allRows;

  const withReservations = filteredRows.filter(
    (r) => r.quantity_reserved > 0,
  ).length;
  const overBooked = filteredRows.filter(
    (r) => r.quantity_available < 0,
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Inventory Summary</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Item-level availability with reservation tracking.{" "}
          <Link
            href="/dashboard/inventory"
            className="hover:text-foreground hover:underline"
          >
            View lot detail →
          </Link>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold">{filteredRows.length}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              With Reservations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold">{withReservations}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Over-booked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span
              className={`text-3xl font-bold ${overBooked > 0 ? "text-red-600" : ""}`}
            >
              {overBooked}
            </span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Item Availability</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SummaryFilters
            clientId={clientId}
            itemType={itemType}
            q={q}
            clients={(clients ?? []) as Client[]}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Item</th>
                  <th className="pb-2 text-left font-medium">Type</th>
                  <th className="pb-2 text-left font-medium">Client</th>
                  <th className="pb-2 text-right font-medium">On Hand</th>
                  <th className="pb-2 text-right font-medium">Reserved</th>
                  <th className="pb-2 text-right font-medium">Available</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={`${row.item_id}-${row.client_id}`}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="py-2 pr-4 font-medium">{row.item_name}</td>
                    <td className="py-2 pr-4">
                      <ItemTypeBadge type={row.item_type} />
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {row.client_name}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {Number(row.quantity_on_hand).toLocaleString()}{" "}
                      <span className="text-muted-foreground">
                        {row.unit_of_measure}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.quantity_reserved > 0 ? (
                        <span className="text-amber-700">
                          {Number(row.quantity_reserved).toLocaleString()}{" "}
                          <span className="font-normal text-muted-foreground">
                            {row.unit_of_measure}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums font-medium">
                      <AvailableQty row={row} />
                    </td>
                    <td className="py-2 text-right">
                      <Link
                        href={`/dashboard/inventory?itemId=${row.item_id}`}
                        className="whitespace-nowrap text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        View lots →
                      </Link>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
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

function AvailableQty({ row }: { row: SummaryRow }) {
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

function SummaryFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Inventory Summary</h1>
        <div className="mt-1 h-4 w-48 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {["Items", "With Reservations", "Over-booked"].map((label) => (
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
          <CardTitle className="text-base">Item Availability</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-5 w-full animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    </div>
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

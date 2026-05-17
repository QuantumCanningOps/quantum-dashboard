import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Suspense } from "react";
import { ProductionFilters } from "./ProductionFilters";

type ProductionPageProps = {
  searchParams?: Promise<{
    clientId?: string;
    status?: string;
    q?: string;
  }>;
};

type ProductionOrder = {
  id: string;
  order_number: string;
  client_id: string;
  sku_id: string | null;
  planned_quantity: number;
  actual_quantity: number | null;
  unit_of_measure: string;
  scheduled_date: string | null;
  status: string;
  created_at: string;
  notes: string | null;
  clients: { name: string; code: string } | null;
  skus: { code: string; name: string } | null;
};

type Client = { id: string; name: string };

const statusOptions = [
  "draft",
  "scheduled",
  "in_progress",
  "complete",
  "cancelled",
];

export default function ProductionPage({ searchParams }: ProductionPageProps) {
  return (
    <Suspense fallback={<ProductionFallback />}>
      <ProductionTable searchParams={searchParams} />
    </Suspense>
  );
}

async function ProductionTable({ searchParams }: ProductionPageProps) {
  const supabase = await createClient();
  const params = (await searchParams) ?? {};

  const clientId = params.clientId ?? "";
  const status = statusOptions.includes(params.status ?? "")
    ? (params.status ?? "")
    : "";
  const q = params.q?.trim() ?? "";

  let query = supabase
    .from("production_orders")
    .select("*, clients(name, code), skus(code, name)")
    .order("scheduled_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (clientId) query = query.eq("client_id", clientId);
  if (status) query = query.eq("status", status);

  const [{ data: orders }, { data: clients }] = await Promise.all([
    query,
    supabase.from("clients").select("id, name").order("name"),
  ]);

  const allOrders = (orders ?? []) as ProductionOrder[];
  const filteredOrders = q
    ? allOrders.filter((o) =>
        [o.order_number, o.clients?.name, o.skus?.name].some((v) =>
          v?.toLowerCase().includes(q.toLowerCase()),
        ),
      )
    : allOrders;

  const scheduledCount = filteredOrders.filter(
    (o) => o.status === "scheduled",
  ).length;
  const inProgressCount = filteredOrders.filter(
    (o) => o.status === "in_progress",
  ).length;
  const completeCount = filteredOrders.filter(
    (o) => o.status === "complete",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Production Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Current and historical production schedule.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold">{filteredOrders.length}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Scheduled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold">{scheduledCount}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              In Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold">{inProgressCount}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold">{completeCount}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orders</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ProductionFilters
            clientId={clientId}
            status={status}
            q={q}
            clients={(clients ?? []) as Client[]}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Order #</th>
                  <th className="pb-2 text-left font-medium">Client</th>
                  <th className="pb-2 text-left font-medium">Product</th>
                  <th className="pb-2 text-right font-medium">Planned</th>
                  <th className="pb-2 text-right font-medium">Actual</th>
                  <th className="pb-2 text-left font-medium">Scheduled</th>
                  <th className="pb-2 text-left font-medium">Status</th>
                  <th className="pb-2 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="py-2 pr-4 font-mono text-xs font-medium">
                      {order.order_number}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {order.clients?.name ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {order.skus ? (
                        <span>
                          <span className="font-medium">{order.skus.name}</span>
                          <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                            {order.skus.code}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {Number(order.planned_quantity).toLocaleString()}{" "}
                      <span className="text-muted-foreground">
                        {order.unit_of_measure}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {order.actual_quantity != null ? (
                        <span>
                          {Number(order.actual_quantity).toLocaleString()}{" "}
                          <span className="text-muted-foreground">
                            {order.unit_of_measure}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                      {order.scheduled_date
                        ? new Date(order.scheduled_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="py-2 max-w-xs truncate text-muted-foreground text-xs">
                      {order.notes ?? ""}
                    </td>
                  </tr>
                ))}
                {filteredOrders.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
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

function ProductionFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Production Orders</h1>
        <div className="mt-1 h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {["Total", "Scheduled", "In Progress", "Complete"].map((label) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-9 w-12 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orders</CardTitle>
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
    draft: "bg-gray-100 text-gray-600 border-gray-200",
    scheduled: "bg-blue-50 text-blue-700 border-blue-200",
    in_progress: "bg-amber-50 text-amber-700 border-amber-200",
    complete: "bg-green-100 text-green-800 border-green-200",
    cancelled: "bg-red-50 text-red-600 border-red-200",
  };
  const labels: Record<string, string> = {
    draft: "Draft",
    scheduled: "Scheduled",
    in_progress: "In Progress",
    complete: "Complete",
    cancelled: "Cancelled",
  };
  return (
    <Badge className={map[status] ?? ""}>{labels[status] ?? status}</Badge>
  );
}

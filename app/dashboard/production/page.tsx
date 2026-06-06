import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Suspense } from "react";
import { ProductionView } from "./ProductionView";
import type { BatchScheduleRow } from "./ProductionOrdersTable";

type PendingOrder = {
  id: string;
  order_number: string;
  client_id: string;
  ordered_quantity: number;
  unit_of_measure: string;
  created_at: string;
  clients: { name: string; code: string } | null;
  skus: { code: string; name: string } | null;
};

type ProductionPageProps = {
  searchParams?: Promise<{
    clientId?: string;
    status?: string;
    q?: string;
  }>;
};

type Client = { id: string; name: string };

const batchStatusOptions = [
  "draft",
  "scheduled",
  "in_progress",
  "complete",
  "cancelled",
];

export default function ProductionPage({ searchParams }: ProductionPageProps) {
  return (
    <Suspense fallback={<ProductionFallback />}>
      <BatchSchedule searchParams={searchParams} />
    </Suspense>
  );
}

async function BatchSchedule({ searchParams }: ProductionPageProps) {
  const supabase = await createClient();
  const params = (await searchParams) ?? {};

  const clientId = params.clientId ?? "";
  const status = batchStatusOptions.includes(params.status ?? "")
    ? (params.status ?? "")
    : "";
  const q = params.q?.trim() ?? "";

  let query = supabase
    .from("batches")
    .select(
      "id, batch_number, status, batching_date, canning_date, planned_quantity, actual_quantity, unit_of_measure, tanks(name), production_orders(id, order_number, client_id, clients(name, code), skus(code, name))"
    )
    .order("batching_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const [{ data: batches }, { data: clients }, { data: pendingRows }] = await Promise.all([
    query,
    supabase.from("clients").select("id, name").order("name"),
    supabase
      .from("production_orders")
      .select("id, order_number, client_id, ordered_quantity, unit_of_measure, created_at, clients(name, code), skus(code, name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  let allBatches = (batches ?? []) as unknown as BatchScheduleRow[];
  let pendingOrders = (pendingRows ?? []) as unknown as PendingOrder[];

  // Client filter — applied in JS since batch client_id is on the nested production order
  if (clientId) {
    allBatches = allBatches.filter(
      (b) => b.production_orders?.client_id === clientId
    );
    pendingOrders = pendingOrders.filter((o) => o.client_id === clientId);
  }

  // Text search across batch number, order number, client name, product name
  const filtered = q
    ? allBatches.filter((b) =>
        [
          b.batch_number,
          b.production_orders?.order_number,
          b.production_orders?.clients?.name,
          b.production_orders?.skus?.name,
        ].some((v) => v?.toLowerCase().includes(q.toLowerCase()))
      )
    : allBatches;

  const scheduledCount = filtered.filter((b) => b.status === "scheduled").length;
  const inProgressCount = filtered.filter((b) => b.status === "in_progress").length;
  const completeCount = filtered.filter((b) => b.status === "complete").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Batch Schedule</h1>
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
            <span className="text-3xl font-bold">{filtered.length}</span>
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

      <ProductionView
        batches={filtered}
        clients={(clients ?? []) as Client[]}
        clientId={clientId}
        status={status}
        q={q}
      />

      <PendingOrdersSection orders={pendingOrders} />
    </div>
  );
}

function PendingOrdersSection({ orders }: { orders: PendingOrder[] }) {
  if (orders.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Unscheduled Orders</CardTitle>
          <Badge className="bg-amber-50 text-amber-700 border-amber-200">
            {orders.length}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Production orders waiting to be assigned a batch.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="pb-2 text-left font-medium">Order #</th>
                <th className="pb-2 text-left font-medium">Client</th>
                <th className="pb-2 text-left font-medium">Product</th>
                <th className="pb-2 text-right font-medium">Ordered</th>
                <th className="pb-2 text-right font-medium">Received</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/dashboard/production/${order.id}`}
                      className="font-mono text-xs font-medium hover:underline"
                    >
                      {order.order_number}
                    </Link>
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
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {Number(order.ordered_quantity).toLocaleString()}{" "}
                    <span className="text-muted-foreground">{order.unit_of_measure}</span>
                  </td>
                  <td className="py-2 text-right whitespace-nowrap text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductionFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Batch Schedule</h1>
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
      <div className="h-40 w-full animate-pulse rounded-lg bg-muted" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Batches</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-5 w-full animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Unscheduled Orders</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-5 w-full animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

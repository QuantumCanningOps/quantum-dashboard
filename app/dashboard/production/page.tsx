import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Suspense } from "react";
import { ProductionFilters } from "./ProductionFilters";
import {
  ProductionOrdersTable,
  type ProductionOrderRow,
} from "./ProductionOrdersTable";

type ProductionPageProps = {
  searchParams?: Promise<{
    clientId?: string;
    status?: string;
    q?: string;
  }>;
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

  const allOrders = (orders ?? []) as ProductionOrderRow[];
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
          <ProductionOrdersTable orders={filteredOrders} />
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

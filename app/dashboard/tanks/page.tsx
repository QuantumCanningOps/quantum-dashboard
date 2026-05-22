import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Suspense } from "react";
import { TankCalendar, type CalendarTank } from "./TankCalendar";

type TankOrder = {
  id: string;
  order_number: string;
  status: string;
  batching_date: string | null;
  canning_date: string | null;
  planned_quantity: number;
  unit_of_measure: string;
  clients: { name: string } | null;
  skus: { name: string; code: string } | null;
};

type Tank = {
  id: string;
  name: string;
  capacity_gallons: number | null;
  production_orders: TankOrder[];
};

type EnrichedTank = Tank & {
  inProgress: TankOrder[];
  upcoming: TankOrder[];
  recent: TankOrder[];
};

export default function TanksPage() {
  return (
    <Suspense fallback={<TanksFallback />}>
      <TanksSchedule />
    </Suspense>
  );
}

async function TanksSchedule() {
  const supabase = await createClient();

  const { data: tanks } = await supabase
    .from("tanks")
    .select(
      `id, name, capacity_gallons,
       production_orders(
         id, order_number, status,
         batching_date, canning_date,
         planned_quantity, unit_of_measure,
         clients(name),
         skus(name, code)
       )`,
    )
    .eq("active", true)
    .order("name");

  const todayStr = new Date().toISOString().split("T")[0];

  const enriched: EnrichedTank[] = ((tanks ?? []) as unknown as Tank[]).map(
    (tank) => {
      const orders = tank.production_orders.filter(
        (o) => o.status !== "cancelled" && o.status !== "draft",
      );

      const inProgress = orders.filter((o) => o.status === "in_progress");

      const upcoming = orders
        .filter(
          (o) =>
            o.status === "scheduled" &&
            o.batching_date != null &&
            o.batching_date >= todayStr,
        )
        .sort((a, b) => (a.batching_date ?? "").localeCompare(b.batching_date ?? ""));

      const recent = orders
        .filter((o) => o.status === "complete")
        .sort((a, b) =>
          (b.batching_date ?? "").localeCompare(a.batching_date ?? ""),
        )
        .slice(0, 3);

      return { ...tank, inProgress, upcoming, recent };
    },
  );

  const calendarTanks: CalendarTank[] = (tanks ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    production_orders: (t.production_orders ?? []).map((o: any) => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      batching_date: o.batching_date,
      canning_date: o.canning_date,
      skus: o.skus ?? null,
      clients: o.clients ?? null,
    })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Tank Schedule</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Production schedule by batching tank.
        </p>
      </div>

      <TankCalendar tanks={calendarTanks} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {enriched.map((tank) => (
          <TankCard key={tank.id} tank={tank} />
        ))}
      </div>
    </div>
  );
}

function TankCard({ tank }: { tank: EnrichedTank }) {
  const hasAny =
    tank.inProgress.length + tank.upcoming.length + tank.recent.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div>
          <CardTitle className="text-base">{tank.name}</CardTitle>
          {tank.capacity_gallons && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {Number(tank.capacity_gallons).toLocaleString()} gal capacity
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <p className="text-sm text-muted-foreground">No scheduled orders.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {tank.inProgress.map((order) => (
              <OrderRow key={order.id} order={order} variant="active" />
            ))}
            {tank.upcoming.map((order) => (
              <OrderRow key={order.id} order={order} variant="upcoming" />
            ))}
            {tank.recent.length > 0 && (
              <>
                {(tank.inProgress.length > 0 || tank.upcoming.length > 0) && (
                  <div className="border-t pt-2">
                    <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Recent
                    </p>
                  </div>
                )}
                {tank.recent.map((order) => (
                  <OrderRow key={order.id} order={order} variant="recent" />
                ))}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OrderRow({
  order,
  variant,
}: {
  order: TankOrder;
  variant: "active" | "upcoming" | "recent";
}) {
  const muted = variant === "recent";

  return (
    <Link
      href={`/dashboard/production/${order.id}`}
      className={`flex flex-col gap-0.5 rounded-md border p-2.5 transition-colors hover:bg-muted/50 ${
        variant === "active"
          ? "border-amber-200 bg-amber-50"
          : variant === "upcoming"
            ? "border-blue-100 bg-blue-50/50"
            : "border-transparent"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`font-mono text-xs font-medium ${muted ? "text-muted-foreground" : ""}`}
        >
          {order.order_number}
        </span>
        <StatusBadge status={order.status} />
      </div>
      <span className={`text-sm ${muted ? "text-muted-foreground" : "font-medium"}`}>
        {order.skus?.name ?? "—"}
        {order.clients && (
          <span className="ml-1.5 font-normal text-muted-foreground">
            · {order.clients.name}
          </span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        {formatDateRange(order.batching_date, order.canning_date)}
        <span className="ml-2">
          {Number(order.planned_quantity).toLocaleString()} {order.unit_of_measure}
        </span>
      </span>
    </Link>
  );
}

function formatDateRange(
  batching: string | null,
  canning: string | null,
): string {
  if (!batching) return "—";
  const b = formatDate(batching);
  if (!canning) return `Batch ${b}`;
  const c = formatDate(canning);
  return `${b} → ${c}`;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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

function TanksFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Tank Schedule</h1>
        <div className="mt-1 h-4 w-56 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-40 w-full animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <div className="h-5 w-20 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="h-16 w-full animate-pulse rounded bg-muted" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

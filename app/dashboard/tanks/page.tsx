import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Suspense } from "react";
import { TankCalendar, type CalendarTank } from "./TankCalendar";

type TankBatch = {
  id: string;
  status: string;
  batching_date: string | null;
  canning_date: string | null;
  planned_quantity: number;
  unit_of_measure: string;
  production_orders: {
    id: string;
    order_number: string;
    clients: { name: string } | null;
    skus: { name: string; code: string } | null;
  } | null;
};

type Tank = {
  id: string;
  name: string;
  capacity_gallons: number | null;
  batches: TankBatch[];
};

type EnrichedTank = Tank & {
  inProgress: TankBatch[];
  upcoming: TankBatch[];
  recent: TankBatch[];
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
       batches(
         id, status,
         batching_date, canning_date,
         planned_quantity, unit_of_measure,
         production_orders(id, order_number, clients(name), skus(name, code))
       )`,
    )
    .eq("active", true)
    .order("name");

  const todayStr = new Date().toISOString().split("T")[0];

  const enriched: EnrichedTank[] = ((tanks ?? []) as unknown as Tank[]).map(
    (tank) => {
      const batches = tank.batches.filter(
        (b) => b.status !== "cancelled" && b.status !== "draft",
      );

      const inProgress = batches.filter((b) => b.status === "in_progress");

      const upcoming = batches
        .filter(
          (b) =>
            b.status === "scheduled" &&
            b.batching_date != null &&
            b.batching_date >= todayStr,
        )
        .sort((a, b) => (a.batching_date ?? "").localeCompare(b.batching_date ?? ""));

      const recent = batches
        .filter((b) => b.status === "complete")
        .sort((a, b) =>
          (b.batching_date ?? "").localeCompare(a.batching_date ?? ""),
        )
        .slice(0, 3);

      return { ...tank, inProgress, upcoming, recent };
    },
  );

  const calendarTanks: CalendarTank[] = ((tanks ?? []) as unknown as Tank[]).map((t) => ({
    id: t.id,
    name: t.name,
    batches: t.batches.map((b) => ({
      id: b.id,
      status: b.status,
      batching_date: b.batching_date,
      canning_date: b.canning_date,
      production_orders: b.production_orders ?? null,
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
          <p className="text-sm text-muted-foreground">No scheduled batches.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {tank.inProgress.map((batch) => (
              <BatchRow key={batch.id} batch={batch} variant="active" />
            ))}
            {tank.upcoming.map((batch) => (
              <BatchRow key={batch.id} batch={batch} variant="upcoming" />
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
                {tank.recent.map((batch) => (
                  <BatchRow key={batch.id} batch={batch} variant="recent" />
                ))}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BatchRow({
  batch,
  variant,
}: {
  batch: TankBatch;
  variant: "active" | "upcoming" | "recent";
}) {
  const muted = variant === "recent";
  const po = batch.production_orders;

  return (
    <Link
      href={`/dashboard/production/${po?.id ?? ""}`}
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
          {po?.order_number ?? "—"}
        </span>
        <StatusBadge status={batch.status} />
      </div>
      <span className={`text-sm ${muted ? "text-muted-foreground" : "font-medium"}`}>
        {po?.skus?.name ?? "—"}
        {po?.clients && (
          <span className="ml-1.5 font-normal text-muted-foreground">
            · {po.clients.name}
          </span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        {formatDateRange(batch.batching_date, batch.canning_date)}
        <span className="ml-2">
          {Number(batch.planned_quantity).toLocaleString()} {batch.unit_of_measure}
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

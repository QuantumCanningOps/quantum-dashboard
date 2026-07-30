import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Suspense } from "react";

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardOverview />
    </Suspense>
  );
}

async function DashboardOverview() {
  const supabase = await createClient();

  const [{ data: lots }, { data: clients }, { data: recentTx }] =
    await Promise.all([
      supabase
        .from("lots")
        .select("id, lot_number, status, notes, received_at, items(name), clients(name)"),
      supabase.from("clients").select("id, name, code"),
      supabase
        .from("inventory_transactions")
        .select(
          "id, transaction_type, quantity, unit_of_measure, performed_at, lots(lot_number, items(name))"
        )
        .order("performed_at", { ascending: false })
        .limit(8),
    ]);

  const statusCounts = (lots ?? []).reduce(
    (acc, lot) => {
      acc[lot.status as string] = (acc[lot.status as string] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const attentionLots = (lots ?? []).filter(
    (l) => l.status === "quarantine" || l.status === "on_hold"
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Overview</h1>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(
          [
            { label: "Total Lots", key: null },
            { label: "Released", key: "released" },
            { label: "In Quarantine", key: "quarantine" },
            { label: "On Hold", key: "on_hold" },
          ] as const
        ).map(({ label, key }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-3xl font-bold">
                {key === null
                  ? (lots?.length ?? 0)
                  : (statusCounts[key] ?? 0)}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Needs attention */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Needs Attention</CardTitle>
          </CardHeader>
          <CardContent>
            {attentionLots.length === 0 ? (
              <p className="text-sm text-muted-foreground">All clear</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {attentionLots.map((lot) => (
                  <li key={lot.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={lot.status} />
                      <span className="text-sm font-medium">
                        {lot.lot_number}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {(lot.items as unknown as { name: string } | null)?.name}
                      </span>
                    </div>
                    {lot.notes && (
                      <p className="text-xs text-muted-foreground pl-1">
                        {lot.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Clients */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {(clients ?? []).map((client) => {
                const clientLots = (lots ?? []).filter(
                  (l) =>
                    (l.clients as unknown as { name: string } | null)?.name === client.name
                );
                return (
                  <li
                    key={client.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <Link
                      href={`/dashboard/clients/${client.id}`}
                      className="font-medium hover:underline"
                    >
                      {client.name}
                    </Link>
                    <span className="text-muted-foreground">
                      {clientLots.length} lots
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Recent transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Type</th>
                  <th className="pb-2 text-left font-medium">Lot</th>
                  <th className="pb-2 text-left font-medium">Item</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {(recentTx ?? []).map((tx) => (
                  <tr key={tx.id} className="border-b last:border-0">
                    <td className="py-2">
                      <TxBadge type={tx.transaction_type} />
                    </td>
                    <td className="py-2 font-mono text-xs">
                      {(tx.lots as unknown as { lot_number: string } | null)?.lot_number}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {
                        (
                          tx.lots as unknown as {
                            items: { name: string } | null;
                          } | null
                        )?.items?.name
                      }
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {tx.quantity} {tx.unit_of_measure}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {new Date(tx.performed_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardFallback() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Overview</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {["Total Lots", "Released", "In Quarantine", "On Hold"].map((label) => (
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

      <div className="grid md:grid-cols-2 gap-6">
        {["Needs Attention", "Clients"].map((title) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, index) => (
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    released: { label: "Released", className: "bg-green-100 text-green-800 border-green-200" },
    quarantine: { label: "Quarantine", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    on_hold: { label: "On Hold", className: "bg-red-100 text-red-800 border-red-200" },
    consumed: { label: "Consumed", className: "bg-gray-100 text-gray-600 border-gray-200" },
    destroyed: { label: "Destroyed", className: "bg-gray-100 text-gray-600 border-gray-200" },
  };
  const { label, className } = map[status] ?? { label: status, className: "" };
  return <Badge className={className}>{label}</Badge>;
}

function TxBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    receive: "bg-blue-100 text-blue-800 border-blue-200",
    move: "bg-purple-100 text-purple-800 border-purple-200",
    consume: "bg-orange-100 text-orange-800 border-orange-200",
    ship: "bg-teal-100 text-teal-800 border-teal-200",
    adjust: "bg-gray-100 text-gray-700 border-gray-200",
    destroy: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <Badge className={map[type] ?? ""}>{type}</Badge>
  );
}

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Suspense } from "react";

type CountRow = {
  id: string;
  count_date: string;
  reason: string;
  status: string;
  notes: string | null;
  posted_at: string | null;
  created_at: string;
  clients: { name: string; code: string } | { name: string; code: string }[] | null;
};

function clientOf(row: CountRow): { name: string; code: string } | null {
  const c = row.clients;
  if (!c) return null;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}

const reasonLabel: Record<string, string> = {
  opening_balance: "Opening balance",
  audit: "Audit",
  cycle_count: "Cycle count",
};

const statusVariant: Record<string, "default" | "secondary" | "outline"> = {
  draft: "outline",
  posted: "default",
  voided: "secondary",
};

export default function InventoryCountsPage() {
  return (
    <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-lg bg-muted" />}>
      <CountsList />
    </Suspense>
  );
}

async function CountsList() {
  const supabase = await createClient();
  const { data: counts } = await supabase
    .from("inventory_counts")
    .select(
      `
      id,
      count_date,
      reason,
      status,
      notes,
      posted_at,
      created_at,
      clients ( name, code )
    `,
    )
    .order("created_at", { ascending: false });

  const rows = (counts ?? []) as unknown as CountRow[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory Counts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Opening balances and audit adjustments — posts as lot-level adjust
            transactions without replaying receiving history.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/inventory/counts/import">Import CSV</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/inventory/counts/new">New count</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {rows.length} count{rows.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              No inventory counts yet. Create one for an audit, or import a CSV
              opening balance for a client cutover.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-6 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Client</th>
                    <th className="px-4 py-2 font-medium">Reason</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Notes</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-6 py-3 whitespace-nowrap">{row.count_date}</td>
                      <td className="px-4 py-3">
                        {clientOf(row)?.name ?? "—"}
                        {clientOf(row)?.code ? (
                          <span className="text-muted-foreground ml-1">
                            ({clientOf(row)?.code})
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {reasonLabel[row.reason] ?? row.reason}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant[row.status] ?? "outline"}>
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                        {row.notes ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right space-x-3">
                        {row.status === "draft" ? (
                          <Link
                            href={`/dashboard/inventory/counts/${row.id}/edit`}
                            className="text-sm underline-offset-4 hover:underline"
                          >
                            Edit
                          </Link>
                        ) : null}
                        <Link
                          href={`/dashboard/inventory/counts/${row.id}`}
                          className="text-sm underline-offset-4 hover:underline"
                        >
                          {row.status === "draft" ? "Review" : "View"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

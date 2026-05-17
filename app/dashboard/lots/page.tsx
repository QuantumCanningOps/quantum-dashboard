import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Suspense } from "react";

export default function LotsPage() {
  return (
    <Suspense fallback={<LotsFallback />}>
      <LotsTable />
    </Suspense>
  );
}

async function LotsTable() {
  const supabase = await createClient();

  const { data: lots } = await supabase
    .from("lots")
    .select(
      `id, lot_number, status, received_at, expiration_date, po_number, notes,
       items(name, item_type, unit_of_measure),
       clients(name, code),
       suppliers(name)`
    )
    .order("received_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Lots</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            All Lots ({lots?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Lot #</th>
                  <th className="pb-2 text-left font-medium">Item</th>
                  <th className="pb-2 text-left font-medium">Type</th>
                  <th className="pb-2 text-left font-medium">Client</th>
                  <th className="pb-2 text-left font-medium">Supplier</th>
                  <th className="pb-2 text-left font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Received</th>
                  <th className="pb-2 text-right font-medium">Expires</th>
                </tr>
              </thead>
              <tbody>
                {(lots ?? []).map((lot) => {
                  const item = lot.items as unknown as {
                    name: string;
                    item_type: string;
                    unit_of_measure: string;
                  } | null;
                  const client = lot.clients as unknown as {
                    name: string;
                    code: string;
                  } | null;
                  const supplier = lot.suppliers as unknown as { name: string } | null;

                  return (
                    <tr key={lot.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 pr-4 font-mono text-xs whitespace-nowrap">
                        {lot.lot_number}
                      </td>
                      <td className="py-2 pr-4">
                        <span>{item?.name}</span>
                        {lot.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">
                            {lot.notes}
                          </p>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <ItemTypeBadge type={item?.item_type ?? ""} />
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {client?.code}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {supplier?.name}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={lot.status} />
                      </td>
                      <td className="py-2 text-right text-muted-foreground whitespace-nowrap">
                        {new Date(lot.received_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 text-right text-muted-foreground whitespace-nowrap">
                        {lot.expiration_date
                          ? new Date(lot.expiration_date).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LotsFallback() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Lots</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Lots</CardTitle>
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    released: "bg-green-100 text-green-800 border-green-200",
    quarantine: "bg-yellow-100 text-yellow-800 border-yellow-200",
    on_hold: "bg-red-100 text-red-800 border-red-200",
    consumed: "bg-gray-100 text-gray-600 border-gray-200",
    destroyed: "bg-gray-100 text-gray-600 border-gray-200",
  };
  const labels: Record<string, string> = {
    released: "Released",
    quarantine: "Quarantine",
    on_hold: "On Hold",
    consumed: "Consumed",
    destroyed: "Destroyed",
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

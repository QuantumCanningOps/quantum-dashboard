"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

export type ProductionOrderRow = {
  id: string;
  order_number: string;
  planned_quantity: number;
  actual_quantity: number | null;
  unit_of_measure: string;
  scheduled_date: string | null;
  status: string;
  notes: string | null;
  clients: { name: string; code: string } | null;
  skus: { code: string; name: string } | null;
};

export function ProductionOrdersTable({
  orders,
}: {
  orders: ProductionOrderRow[];
}) {
  const router = useRouter();

  return (
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
          {orders.map((order) => (
            <tr
              key={order.id}
              onClick={() => router.push(`/dashboard/production/${order.id}`)}
              className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
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
          {orders.length === 0 && (
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

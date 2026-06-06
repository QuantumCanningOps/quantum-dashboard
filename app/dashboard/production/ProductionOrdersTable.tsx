"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type BatchScheduleRow = {
  id: string;                   // batch id
  batch_number: string | null;
  status: string;               // batch status
  batching_date: string | null;
  canning_date: string | null;
  planned_quantity: number;
  actual_quantity: number | null;
  unit_of_measure: string;
  tanks: { name: string } | null;
  production_orders: {
    id: string;
    order_number: string;
    client_id: string;
    clients: { name: string; code: string } | null;
    skus: { code: string; name: string } | null;
  } | null;
};

export function ProductionOrdersTable({
  batches,
  hoveredId,
  onHoverChange,
}: {
  batches: BatchScheduleRow[];
  hoveredId?: string | null;
  onHoverChange?: (id: string | null) => void;
}) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto selection:bg-blue-700 selection:text-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="pb-2 text-left font-medium">Batch #</th>
            <th className="pb-2 text-left font-medium">Order #</th>
            <th className="pb-2 text-left font-medium">Client</th>
            <th className="pb-2 text-left font-medium">Product</th>
            <th className="pb-2 text-right font-medium">Planned</th>
            <th className="pb-2 text-left font-medium">Tank</th>
            <th className="pb-2 text-left font-medium">Batching</th>
            <th className="pb-2 text-left font-medium">Canning</th>
            <th className="pb-2 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => {
            const po = batch.production_orders;
            const isHighlighted = hoveredId === batch.id;
            const mutedTextClass = isHighlighted
              ? "text-blue-950"
              : "text-muted-foreground";
            const secondaryTextClass = isHighlighted
              ? "text-blue-900"
              : "text-muted-foreground";
            return (
              <tr
                key={batch.id}
                onClick={() =>
                  po?.id && router.push(`/dashboard/production/${po.id}`)
                }
                onMouseEnter={() => onHoverChange?.(batch.id)}
                onMouseLeave={() => onHoverChange?.(null)}
                className={cn(
                  "cursor-pointer border-b last:border-0",
                  isHighlighted ? "bg-blue-50 text-blue-950" : "hover:bg-muted/30"
                )}
              >
                <td className="py-2 pr-4 font-mono text-xs font-medium">
                  {batch.batch_number ?? "—"}
                </td>
                <td className={cn("py-2 pr-4 font-mono text-xs", mutedTextClass)}>
                  {po?.order_number ?? "—"}
                </td>
                <td className={cn("py-2 pr-4", mutedTextClass)}>
                  {po?.clients?.name ?? "—"}
                </td>
                <td className="py-2 pr-4">
                  {po?.skus ? (
                    <span>
                      <span className="font-medium">{po.skus.name}</span>
                      <span
                        className={cn(
                          "ml-1.5 font-mono text-xs",
                          secondaryTextClass
                        )}
                      >
                        {po.skus.code}
                      </span>
                    </span>
                  ) : (
                    <span className={mutedTextClass}>—</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {Number(batch.planned_quantity).toLocaleString()}{" "}
                  <span className={secondaryTextClass}>
                    {batch.unit_of_measure}
                  </span>
                </td>
                <td className={cn("py-2 pr-4", mutedTextClass)}>
                  {batch.tanks?.name ?? "—"}
                </td>
                <td className={cn("py-2 pr-4 whitespace-nowrap", mutedTextClass)}>
                  {batch.batching_date
                    ? new Date(batch.batching_date).toLocaleDateString()
                    : "—"}
                </td>
                <td className={cn("py-2 pr-4 whitespace-nowrap", mutedTextClass)}>
                  {batch.canning_date
                    ? new Date(batch.canning_date).toLocaleDateString()
                    : "—"}
                </td>
                <td className="py-2 pr-4">
                  <StatusBadge status={batch.status} />
                </td>
              </tr>
            );
          })}
          {batches.length === 0 && (
            <tr>
              <td
                colSpan={9}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                No batches found.
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

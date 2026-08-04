"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  postInventoryCount,
  updateCountLineQuantities,
} from "../actions";

export type CountDetailHeader = {
  id: string;
  count_date: string;
  reason: string;
  status: string;
  notes: string | null;
  posted_at: string | null;
  client_name: string;
  client_code: string;
};

export type CountDetailLine = {
  id: string;
  lot_id: string | null;
  lot_number: string;
  item_name: string;
  location_label: string;
  system_quantity: number;
  counted_quantity: number;
  unit_of_measure: string;
  expiration_date: string | null;
  received_at: string | null;
  coa_file_name: string | null;
  notes: string | null;
};

const reasonLabel: Record<string, string> = {
  opening_balance: "Opening balance",
  audit: "Audit",
  cycle_count: "Cycle count",
};

export function CountDetail({
  count,
  lines: initialLines,
}: {
  count: CountDetailHeader;
  lines: CountDetailLine[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lines, setLines] = useState(initialLines);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const isDraft = count.status === "draft";

  const totals = useMemo(() => {
    let system = 0;
    let counted = 0;
    let varianceLines = 0;
    for (const line of lines) {
      system += line.system_quantity;
      counted += line.counted_quantity;
      if (line.counted_quantity !== line.system_quantity) varianceLines += 1;
    }
    return { system, counted, variance: counted - system, varianceLines };
  }, [lines]);

  function saveQuantities() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateCountLineQuantities(
        count.id,
        lines.map((line) => ({
          lineId: line.id,
          countedQuantity: line.counted_quantity,
        })),
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMessage("Counted quantities saved");
      router.refresh();
    });
  }

  function post() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const save = await updateCountLineQuantities(
        count.id,
        lines.map((line) => ({
          lineId: line.id,
          countedQuantity: line.counted_quantity,
        })),
      );
      if (!save.success) {
        setError(save.error);
        return;
      }
      const result = await postInventoryCount(count.id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMessage("Count posted — inventory on hand updated");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/dashboard/inventory/counts"
              className="text-sm text-muted-foreground hover:underline"
            >
              Inventory counts
            </Link>
            <span className="text-muted-foreground text-sm">/</span>
            <span className="text-sm">{count.count_date}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {count.client_name}{" "}
            <span className="text-muted-foreground font-normal">
              ({count.client_code})
            </span>
          </h1>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="secondary">
              {reasonLabel[count.reason] ?? count.reason}
            </Badge>
            <Badge variant={count.status === "posted" ? "default" : "outline"}>
              {count.status}
            </Badge>
            {count.posted_at ? (
              <span className="text-sm text-muted-foreground">
                Posted {new Date(count.posted_at).toLocaleString()}
              </span>
            ) : null}
          </div>
          {count.notes ? (
            <p className="text-sm text-muted-foreground mt-2">{count.notes}</p>
          ) : null}
        </div>
        {isDraft ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/dashboard/inventory/counts/${count.id}/edit`}>
                Edit draft
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={saveQuantities}
              disabled={pending}
            >
              Save quantities
            </Button>
            <Button type="button" onClick={post} disabled={pending}>
              {pending ? "Posting…" : "Post count"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Lines
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {lines.length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              System qty
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {totals.system}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Counted qty
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {totals.counted}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Net variance ({totals.varianceLines} lines)
            </CardTitle>
          </CardHeader>
          <CardContent
            className={`text-2xl font-semibold tabular-nums ${
              totals.variance === 0
                ? ""
                : totals.variance > 0
                  ? "text-emerald-700"
                  : "text-red-700"
            }`}
          >
            {totals.variance > 0 ? "+" : ""}
            {totals.variance}
          </CardContent>
        </Card>
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-emerald-700" role="status">
          {message}
        </p>
      ) : null}

      {isDraft ? (
        <p className="text-sm text-muted-foreground">
          Dry-run preview: posting will create missing lots and write{" "}
          <code className="text-xs">adjust</code> transactions for non-zero
          variances. System quantities are re-snapshotted at post time.
        </p>
      ) : null}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">Lot #</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium text-right">System</th>
                <th className="px-4 py-2 font-medium text-right">Counted</th>
                <th className="px-4 py-2 font-medium text-right">Variance</th>
                <th className="px-4 py-2 font-medium">UOM</th>
                <th className="px-4 py-2 font-medium">Received</th>
                <th className="px-4 py-2 font-medium">Expires</th>
                <th className="px-4 py-2 font-medium">COA</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const variance = line.counted_quantity - line.system_quantity;
                return (
                  <tr key={line.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{line.item_name}</td>
                    <td className="px-4 py-3">
                      {line.lot_id ? (
                        <Link
                          href={`/dashboard/lots/${line.lot_id}`}
                          className="hover:underline"
                        >
                          {line.lot_number}
                        </Link>
                      ) : (
                        <span>
                          {line.lot_number}{" "}
                          <Badge variant="outline">new</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{line.location_label}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {line.system_quantity}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isDraft ? (
                        <Input
                          className="ml-auto w-28 text-right"
                          value={String(line.counted_quantity)}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            setLines((prev) =>
                              prev.map((l) =>
                                l.id === line.id
                                  ? {
                                      ...l,
                                      counted_quantity: Number.isNaN(value)
                                        ? 0
                                        : value,
                                    }
                                  : l,
                              ),
                            );
                          }}
                        />
                      ) : (
                        <span className="tabular-nums">{line.counted_quantity}</span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${
                        variance === 0
                          ? "text-muted-foreground"
                          : variance > 0
                            ? "text-emerald-700"
                            : "text-red-700"
                      }`}
                    >
                      {variance > 0 ? "+" : ""}
                      {variance}
                    </td>
                    <td className="px-4 py-3">{line.unit_of_measure}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {line.received_at
                        ? new Date(line.received_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {line.expiration_date ?? "—"}
                    </td>
                    <td className="px-4 py-3 max-w-[10rem] truncate">
                      {line.coa_file_name ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

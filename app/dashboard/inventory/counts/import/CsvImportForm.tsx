"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  importCsvAsOpeningBalance,
  previewCsvImport,
  type CsvPreviewRow,
} from "../actions";
import { inventoryCountCsvTemplate } from "../csv-template";

type ClientOption = { id: string; name: string; code: string };

const SEL =
  "flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const OPT = "bg-background text-foreground";

function today() {
  return new Date().toISOString().split("T")[0];
}

export function CsvImportForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [clientId, setClientId] = useState("");
  const [countDate, setCountDate] = useState(today());
  const [notes, setNotes] = useState("Spreadsheet cutover opening balance");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<CsvPreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!rows) return null;
    const valid = rows.filter((r) => !r.error);
    const invalid = rows.filter((r) => r.error);
    const qty = valid.reduce((sum, r) => sum + r.quantity, 0);
    return { valid: valid.length, invalid: invalid.length, qty };
  }, [rows]);

  function downloadTemplate() {
    const blob = new Blob([inventoryCountCsvTemplate()], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory_opening_balance_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFileChange(file: File | null) {
    setError(null);
    setRows(null);
    setFileName(file?.name ?? null);
    if (!file) return;

    const text = await file.text();
    startTransition(async () => {
      const result = await previewCsvImport(text, clientId || null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setRows(result.rows);
      if (result.clientId && !clientId) {
        setClientId(result.clientId);
      }
    });
  }

  function createDraft() {
    if (!rows || !clientId) return;
    setError(null);
    startTransition(async () => {
      const result = await importCsvAsOpeningBalance({
        clientId,
        countDate,
        notes: notes.trim() || null,
        rows,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/dashboard/inventory/counts/${result.countId}`);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link
            href="/dashboard/inventory/counts"
            className="text-sm text-muted-foreground hover:underline"
          >
            Inventory counts
          </Link>
          <span className="text-muted-foreground text-sm">/</span>
          <span className="text-sm">Import CSV</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Import opening balance
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Lot-level CSV → dry-run preview → draft opening-balance count → post
          to create lots and adjust-in transactions.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Upload</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="client">Client filter (optional)</Label>
            <select
              id="client"
              className={SEL}
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setRows(null);
              }}
            >
              <option className={OPT} value="">
                Infer from CSV…
              </option>
              {clients.map((c) => (
                <option key={c.id} className={OPT} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Count date</Label>
            <Input
              id="date"
              type="date"
              value={countDate}
              onChange={(e) => setCountDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="file">CSV file</Label>
            <Input
              id="file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />
            {fileName ? (
              <p className="text-xs text-muted-foreground">{fileName}</p>
            ) : null}
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={downloadTemplate}>
              Download template
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Required columns</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>
            <code>client_code</code>, <code>item_code</code> or{" "}
            <code>item_name</code>, <code>lot_number</code>,{" "}
            <code>quantity</code>, <code>unit_of_measure</code>,{" "}
            <code>location_label</code>
          </p>
          <p>
            Optional: <code>lot_status</code> (default released),{" "}
            <code>supplier_code</code>, <code>manufacture_date</code>,{" "}
            <code>expiration_date</code>, <code>notes</code>
          </p>
        </CardContent>
      </Card>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {rows && stats ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{stats.valid} valid</Badge>
            {stats.invalid > 0 ? (
              <Badge variant="outline">{stats.invalid} with errors</Badge>
            ) : (
              <Badge>Ready to import</Badge>
            )}
            <span className="text-sm text-muted-foreground">
              Total counted qty: {stats.qty}
            </span>
            <Button
              className="ml-auto"
              type="button"
              onClick={createDraft}
              disabled={pending || stats.valid === 0 || !clientId}
            >
              {pending ? "Creating…" : "Create draft count"}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Client</th>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium">Lot #</th>
                    <th className="px-3 py-2 font-medium text-right">Qty</th>
                    <th className="px-3 py-2 font-medium">UOM</th>
                    <th className="px-3 py-2 font-medium">Location</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.rowNumber}-${row.lotNumber}`} className="border-b last:border-0">
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.rowNumber}
                      </td>
                      <td className="px-3 py-2">{row.clientCode}</td>
                      <td className="px-3 py-2">
                        {row.itemName || row.itemCode || "—"}
                      </td>
                      <td className="px-3 py-2">{row.lotNumber || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number.isFinite(row.quantity) ? row.quantity : "—"}
                      </td>
                      <td className="px-3 py-2">{row.unitOfMeasure || "—"}</td>
                      <td className="px-3 py-2">{row.locationLabel || "—"}</td>
                      <td className="px-3 py-2">{row.lotStatus}</td>
                      <td className="px-3 py-2">
                        {row.error ? (
                          <span className="text-red-700">{row.error}</span>
                        ) : (
                          <span className="text-emerald-700">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

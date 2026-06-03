import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReceivingFilters } from "./ReceivingFilters";
import Link from "next/link";
import { Suspense } from "react";

type ReceivingPageProps = {
  searchParams?: Promise<{
    clientId?: string;
    supplierId?: string;
    dateFrom?: string;
    dateTo?: string;
    q?: string;
  }>;
};

type ReceivingRow = {
  id: string;
  lot_number: string;
  received_at: string;
  received_quantity: number;
  unit_of_measure: string;
  expiration_date: string | null;
  po_number: string | null;
  client_name: string;
  item_name: string;
  supplier_name: string | null;
  supplier_code: string | null;
};

type BolDoc = {
  id: string;
  file_name: string;
  carrier_name: string | null;
};

type FilterOption = {
  id: string;
  name: string;
  code?: string | null;
};

export default function ReceivingPage({ searchParams }: ReceivingPageProps) {
  return (
    <Suspense fallback={<ReceivingFallback />}>
      <ReceivingLog searchParams={searchParams} />
    </Suspense>
  );
}

async function ReceivingLog({ searchParams }: ReceivingPageProps) {
  const supabase = await createClient();
  const filters = normalizeFilters((await searchParams) ?? {});

  let lotsQuery = supabase
    .from("lots")
    .select(
      `
      id,
      lot_number,
      received_at,
      received_quantity,
      unit_of_measure,
      expiration_date,
      po_number,
      clients!inner ( name ),
      items!inner ( name, supplier_id, suppliers ( name, code ) ),
      suppliers ( name, code )
    `,
    )
    .order("received_at", { ascending: false });

  if (filters.clientId) {
    lotsQuery = lotsQuery.eq("client_id", filters.clientId);
  }

  if (filters.supplierId) {
    lotsQuery = lotsQuery.or(
      `supplier_id.eq.${filters.supplierId},items.supplier_id.eq.${filters.supplierId}`,
    );
  }

  if (filters.dateFrom) {
    lotsQuery = lotsQuery.gte("received_at", filters.dateFrom);
  }

  if (filters.dateTo) {
    lotsQuery = lotsQuery.lte("received_at", `${filters.dateTo}T23:59:59`);
  }

  const [{ data: lotsRaw }, { data: clients }, { data: suppliers }] =
    await Promise.all([
      lotsQuery,
      supabase.from("clients").select("id, name, code").order("name"),
      supabase.from("suppliers").select("id, name, code").order("name"),
    ]);

  const allRows: ReceivingRow[] = (lotsRaw ?? []).map((lot: Record<string, unknown>) => {
    const clientRel = lot.clients as { name: string } | null;
    const itemRel = lot.items as {
      name: string;
      supplier_id: string | null;
      suppliers: { name: string; code: string } | null;
    } | null;
    const lotSupplier = lot.suppliers as { name: string; code: string } | null;
    const effectiveSupplier = lotSupplier ?? itemRel?.suppliers ?? null;

    return {
      id: lot.id as string,
      lot_number: lot.lot_number as string,
      received_at: lot.received_at as string,
      received_quantity: lot.received_quantity as number,
      unit_of_measure: lot.unit_of_measure as string,
      expiration_date: lot.expiration_date as string | null,
      po_number: lot.po_number as string | null,
      client_name: clientRel?.name ?? "—",
      item_name: itemRel?.name ?? "—",
      supplier_name: effectiveSupplier?.name ?? null,
      supplier_code: effectiveSupplier?.code ?? null,
    };
  });

  const rows = filters.q
    ? allRows.filter((row) => rowMatchesSearch(row, filters.q))
    : allRows;

  // Fetch BOL documents for every displayed lot via the document_lots join table
  const lotIds = rows.map((r) => r.id);
  const { data: bolLinks } = lotIds.length > 0
    ? await supabase
        .from("document_lots")
        .select("lot_id, documents(id, file_name, carrier_name, document_type)")
        .in("lot_id", lotIds)
    : { data: [] as { lot_id: string; documents: { id: string; file_name: string; carrier_name: string | null; document_type: string } | null }[] };

  const bolByLotId = new Map<string, BolDoc>();
  for (const link of bolLinks ?? []) {
    const doc = link.documents as { id: string; file_name: string; carrier_name: string | null; document_type: string } | null;
    if (doc?.document_type === "bol") {
      bolByLotId.set(link.lot_id, { id: doc.id, file_name: doc.file_name, carrier_name: doc.carrier_name });
    }
  }

  const totalQty = rows.reduce((sum, r) => sum + Number(r.received_quantity), 0);
  const uniqueItems = new Set(rows.map((r) => r.item_name)).size;
  const uniqueClients = new Set(rows.map((r) => r.client_name)).size;
  const bolCoveredCount = rows.filter((r) => bolByLotId.has(r.id)).length;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Receiving Log</h1>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Receipts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold">{rows.length}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unique Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold">{uniqueItems}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold">{uniqueClients}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              BOL on File
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className={`text-3xl font-bold ${bolCoveredCount < rows.length ? "text-amber-600" : ""}`}>
              {bolCoveredCount}
            </span>
            <span className="ml-1.5 text-sm text-muted-foreground">/ {rows.length}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Received Lots</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ReceivingFilters
            filters={filters}
            clients={(clients ?? []) as FilterOption[]}
            suppliers={(suppliers ?? []) as FilterOption[]}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Date</th>
                  <th className="pb-2 text-left font-medium">Client</th>
                  <th className="pb-2 text-left font-medium">Item</th>
                  <th className="pb-2 text-left font-medium">Lot #</th>
                  <th className="pb-2 text-left font-medium">Supplier</th>
                  <th className="pb-2 text-left font-medium">Carrier / BOL</th>
                  <th className="pb-2 text-left font-medium">BBD</th>
                  <th className="pb-2 text-right font-medium">Qty Received</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const bol = bolByLotId.get(row.id);
                  return (
                    <tr
                      key={row.id}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                        {new Date(row.received_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4">{row.client_name}</td>
                      <td className="py-2 pr-4 font-medium">{row.item_name}</td>
                      <td className="py-2 pr-4">
                        <Link
                          href={`/dashboard/lots/${row.id}`}
                          className="font-mono text-xs hover:underline text-foreground"
                        >
                          {row.lot_number}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {row.supplier_name ? (
                          <span>
                            {row.supplier_name}
                            {row.supplier_code && (
                              <span className="ml-1 font-mono text-xs">
                                {row.supplier_code}
                              </span>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {bol ? (
                          <div className="flex flex-col gap-0.5">
                            {bol.carrier_name && (
                              <span className="text-xs font-medium">{bol.carrier_name}</span>
                            )}
                            <Link
                              href={`/dashboard/documents/${bol.id}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-teal-700 hover:underline font-medium"
                            >
                              View BOL
                            </Link>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-600">No BOL</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                        {row.expiration_date
                          ? new Date(row.expiration_date).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium whitespace-nowrap">
                        {Number(row.received_quantity).toLocaleString()}{" "}
                        <span className="text-muted-foreground font-normal">
                          {row.unit_of_measure}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No receiving records found for this selection.
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t font-medium">
                    <td colSpan={7} className="pt-3 text-muted-foreground text-sm">
                      {rows.length} receipt{rows.length !== 1 ? "s" : ""}
                    </td>
                    <td className="pt-3 text-right tabular-nums">
                      {totalQty.toLocaleString()}
                      <span className="ml-1 text-muted-foreground font-normal text-sm">
                        total
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReceivingFallback() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Receiving Log</h1>

      <div className="grid grid-cols-4 gap-4">
        {["Receipts", "Unique Items", "Clients", "BOL on File"].map((label) => (
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Received Lots</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-5 w-full animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function normalizeFilters(
  searchParams: Awaited<NonNullable<ReceivingPageProps["searchParams"]>>,
) {
  return {
    clientId: searchParams.clientId ?? "",
    supplierId: searchParams.supplierId ?? "",
    dateFrom: searchParams.dateFrom ?? "",
    dateTo: searchParams.dateTo ?? "",
    q: searchParams.q?.trim() ?? "",
  };
}

function rowMatchesSearch(row: ReceivingRow, query: string) {
  const q = query.toLowerCase();
  return [
    row.item_name,
    row.lot_number,
    row.client_name,
    row.supplier_name,
    row.supplier_code,
    row.po_number,
  ].some((v) => v?.toLowerCase().includes(q));
}

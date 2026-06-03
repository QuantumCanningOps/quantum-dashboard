import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CertUpload } from "./CertUpload";

export default function LotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<LotDetailFallback />}>
      <LotDetailContent params={params} />
    </Suspense>
  );
}

async function LotDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: userRecord } = await supabase
    .from("users")
    .select("contact_id")
    .eq("id", user?.id ?? "")
    .single();

  const isInternal = !userRecord?.contact_id;

  const [{ data: lot }, { data: history }] = await Promise.all([
    supabase
      .from("lots")
      .select(
        `id, lot_number, status, received_at, expiration_date, manufacture_date,
         po_number, production_order_id, notes,
         items(name, item_type, unit_of_measure),
         clients(id, name, code),
         suppliers(name, code),
         production_orders(id, order_number),
         documents!lot_id(id, document_type, file_name, uploaded_at)`
      )
      .eq("id", id)
      .single(),
    supabase
      .from("lot_status_history")
      .select("to_status, changed_at, reason")
      .eq("lot_id", id)
      .order("changed_at", { ascending: false })
      .limit(10),
  ]);

  if (!lot) notFound();

  const item = lot.items as unknown as {
    name: string;
    item_type: string;
    unit_of_measure: string;
  } | null;
  const client = lot.clients as unknown as {
    id: string;
    name: string;
    code: string;
  } | null;
  const supplier = lot.suppliers as unknown as {
    name: string;
    code: string;
  } | null;
  const productionOrder = lot.production_orders as unknown as {
    id: string;
    order_number: string;
  } | null;
  const docs = (lot.documents as unknown as {
    id: string;
    document_type: string;
    file_name: string;
    uploaded_at: string;
  }[]) ?? [];
  const coa = docs.find((d) => d.document_type === "coa");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard/lots"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← All Lots
        </Link>
        <h1 className="text-2xl font-bold font-mono">{lot.lot_number}</h1>
        <p className="text-muted-foreground">
          {item?.name ?? "Unknown item"}{" "}
          {client && <span>· {client.name}</span>}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lot Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge status={lot.status} />
              </dd>

              <dt className="text-muted-foreground">Item</dt>
              <dd>{item?.name ?? "—"}</dd>

              <dt className="text-muted-foreground">Type</dt>
              <dd>
                {item?.item_type ? (
                  <ItemTypeBadge type={item.item_type} />
                ) : (
                  "—"
                )}
              </dd>

              <dt className="text-muted-foreground">Client</dt>
              <dd>{client ? `${client.code} — ${client.name}` : "—"}</dd>

              <dt className="text-muted-foreground">Supplier</dt>
              <dd>
                {supplier
                  ? `${supplier.code ? supplier.code + " — " : ""}${supplier.name}`
                  : "—"}
              </dd>

              <dt className="text-muted-foreground">Unit</dt>
              <dd>{item?.unit_of_measure ?? "—"}</dd>

              <dt className="text-muted-foreground">PO Number</dt>
              <dd className="font-mono text-xs">{lot.po_number ?? "—"}</dd>

              {productionOrder && (
                <>
                  <dt className="text-muted-foreground">Production Order</dt>
                  <dd>
                    <Link
                      href={`/dashboard/production/${productionOrder.id}`}
                      className="font-mono text-xs hover:underline"
                    >
                      {productionOrder.order_number}
                    </Link>
                  </dd>
                </>
              )}

              <dt className="text-muted-foreground">Received</dt>
              <dd>
                {lot.received_at
                  ? new Date(lot.received_at).toLocaleDateString()
                  : "—"}
              </dd>

              <dt className="text-muted-foreground">Manufactured</dt>
              <dd>
                {lot.manufacture_date
                  ? new Date(lot.manufacture_date).toLocaleDateString()
                  : "—"}
              </dd>

              <dt className="text-muted-foreground">Expires</dt>
              <dd>
                {lot.expiration_date
                  ? new Date(lot.expiration_date).toLocaleDateString()
                  : "—"}
              </dd>

              {lot.notes && (
                <>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd className="text-xs">{lot.notes}</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className={coa ? "" : "border-amber-200 bg-amber-50"}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Certificate of Analysis
                {coa ? (
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    On File
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                    Missing
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {coa ? (
                <div className="flex flex-col gap-3">
                  <div className="text-sm">
                    <p className="font-medium">{coa.file_name}</p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Uploaded {new Date(coa.uploaded_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/dashboard/documents/${coa.id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View CoA
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/documents/${coa.id}/download`}>
                        Download
                      </Link>
                    </Button>
                  </div>
                  {isInternal && (
                    <details className="text-sm">
                      <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                        Replace CoA
                      </summary>
                      <div className="mt-3">
                        <CertUpload lotId={id} clientId={client?.id ?? ""} />
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-amber-800">
                    No Certificate of Analysis is on file for this lot.
                  </p>
                  {isInternal ? (
                    <CertUpload lotId={id} clientId={client?.id ?? ""} />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Contact your account manager to request the CoA for this
                      lot.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {(history?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Status History</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="flex flex-col gap-2">
                  {(history ?? []).map((entry, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 text-sm"
                    >
                      <span className="text-muted-foreground whitespace-nowrap text-xs pt-0.5">
                        {new Date(entry.changed_at).toLocaleDateString()}
                      </span>
                      <div>
                        <StatusBadge status={entry.to_status} />
                        {entry.reason && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {entry.reason}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function LotDetailFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lot Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-5 w-full animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Certificate of Analysis</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-5 w-full animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      </div>
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
    wip: "bg-orange-50 text-orange-700 border-teal-200",
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

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Suspense } from "react";
import { UploadMissingDocButton } from "./upload-missing-doc-button";

export default function NeedsAttentionPage() {
  return (
    <Suspense fallback={<NeedsAttentionFallback />}>
      <NeedsAttentionContent />
    </Suspense>
  );
}

type LotRow = {
  id: string;
  lot_number: string;
  received_at: string;
  expiration_date: string | null;
  status: string;
  notes: string | null;
  items: { name: string; requires_coa: boolean } | null;
  clients: { id: string; name: string; code: string } | null;
};

type FormulaRow = {
  id: string;
  version: string;
  formula_number: string | null;
  name: string | null;
  status: string;
  clients: { id: string; name: string; code: string } | null;
  skus: { code: string; name: string } | null;
};

type ArtworkRow = {
  id: string;
  file_name: string;
  uploaded_at: string;
  artwork_status: string | null;
  clients: { name: string; code: string } | null;
  formulas: { version: string; skus: { code: string; name: string } | null } | null;
};

type DraftOrderRow = {
  id: string;
  order_number: string;
  ordered_quantity: number | null;
  created_at: string;
  clients: { name: string; code: string } | null;
  skus: { code: string; name: string } | null;
};

async function NeedsAttentionContent() {
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const [
    { data: rawActiveLots },
    { data: coaDocs },
    { data: bolDocs },
    { data: paDocs },
    { data: rawUnapprovedArtwork },
    { data: rawDraftOrders },
    { data: rawFormulas },
  ] = await Promise.all([
    supabase
      .from("lots")
      .select(
        "id, lot_number, received_at, expiration_date, status, notes, items(name, requires_coa), clients(id, name, code)"
      )
      .in("status", ["quarantine", "released", "on_hold"])
      .order("received_at", { ascending: false }),

    supabase
      .from("documents")
      .select("lot_id")
      .eq("document_type", "coa")
      .not("lot_id", "is", null),

    supabase
      .from("documents")
      .select("id, document_lots(lot_id)")
      .eq("document_type", "bol"),

    supabase
      .from("documents")
      .select("formula_id")
      .eq("document_type", "pa_letter")
      .not("formula_id", "is", null),

    supabase
      .from("documents")
      .select(
        "id, file_name, uploaded_at, artwork_status, clients(name, code), formulas!formula_id(version, skus(code, name))"
      )
      .eq("document_type", "artwork")
      .neq("artwork_status", "approved")
      .order("uploaded_at", { ascending: false }),

    supabase
      .from("production_orders")
      .select(
        "id, order_number, ordered_quantity, created_at, clients(name, code), skus(code, name)"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false }),

    supabase
      .from("formulas")
      .select(
        "id, version, formula_number, name, status, clients(id, name, code), skus(code, name)"
      )
      .not("status", "eq", "retired")
      .order("version"),
  ]);

  const activeLots = (rawActiveLots ?? []) as unknown as LotRow[];
  const unapprovedArtwork = (rawUnapprovedArtwork ?? []) as unknown as ArtworkRow[];
  const pendingOrders = (rawDraftOrders ?? []) as unknown as DraftOrderRow[];
  const allFormulas = (rawFormulas ?? []) as unknown as FormulaRow[];

  const lotIdsWithCoa = new Set(
    (coaDocs ?? []).map((d) => d.lot_id as string)
  );

  const lotIdsWithBol = new Set(
    (bolDocs ?? []).flatMap((d) =>
      ((d.document_lots as unknown as { lot_id: string }[]) ?? []).map(
        (dl) => dl.lot_id
      )
    )
  );

  const formulaIdsWithPa = new Set(
    (paDocs ?? []).map((d) => d.formula_id as string)
  );

  const quarantineOnHoldLots = activeLots.filter(
    (l) => l.status === "quarantine" || l.status === "on_hold"
  );

  const missingBolLots = activeLots.filter((l) => !lotIdsWithBol.has(l.id));

  const missingCoaLots = activeLots.filter(
    (l) => l.items?.requires_coa && !lotIdsWithCoa.has(l.id)
  );

  const missingPaFormulas = allFormulas.filter(
    (f) => !formulaIdsWithPa.has(f.id)
  );

  const expiredLots = activeLots
    .filter((l) => l.expiration_date && l.expiration_date < today)
    .sort((a, b) => (a.expiration_date ?? "").localeCompare(b.expiration_date ?? ""));

  const expiringSoonLots = activeLots
    .filter(
      (l) =>
        l.expiration_date &&
        l.expiration_date >= today &&
        l.expiration_date <= thirtyDaysOut
    )
    .sort((a, b) => (a.expiration_date ?? "").localeCompare(b.expiration_date ?? ""));

  const totalIssues =
    quarantineOnHoldLots.length +
    missingBolLots.length +
    missingCoaLots.length +
    missingPaFormulas.length +
    unapprovedArtwork.length +
    pendingOrders.length +
    expiredLots.length +
    expiringSoonLots.length;

  const docIssues =
    missingBolLots.length +
    missingCoaLots.length +
    missingPaFormulas.length +
    unapprovedArtwork.length;

  const expiryIssues = expiredLots.length + expiringSoonLots.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Needs Attention</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {totalIssues === 0
            ? "Everything looks good — no issues found."
            : `${totalIssues} item${totalIssues === 1 ? "" : "s"} requiring attention.`}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total Issues" count={totalIssues} />
        <StatCard
          label="Quarantine / On Hold"
          count={quarantineOnHoldLots.length}
          urgent={quarantineOnHoldLots.length > 0}
        />
        <StatCard
          label="Missing Documents"
          count={docIssues}
          urgent={docIssues > 0}
        />
        <StatCard
          label="Draft Orders"
          count={pendingOrders.length}
          urgent={pendingOrders.length > 0}
        />
        <StatCard
          label="Expiry Issues"
          count={expiryIssues}
          urgent={expiredLots.length > 0}
        />
      </div>

      <Section
        title="Quarantine & On Hold"
        count={quarantineOnHoldLots.length}
        emptyText="No lots in quarantine or on hold."
      >
        <LotTable lots={quarantineOnHoldLots} showStatus />
      </Section>

      <Section
        title="Missing Bill of Lading"
        count={missingBolLots.length}
        emptyText="All active lots have a BoL on file."
      >
        <LotTable lots={missingBolLots} uploadDocType="bol" />
      </Section>

      <Section
        title="Missing Certificate of Analysis"
        count={missingCoaLots.length}
        emptyText="All lots requiring a CoA have one on file."
      >
        <LotTable lots={missingCoaLots} uploadDocType="coa" />
      </Section>

      <Section
        title="Missing PA Letter"
        count={missingPaFormulas.length}
        emptyText="All active formulas have a PA letter on file."
      >
        <FormulaTable formulas={missingPaFormulas} />
      </Section>

      <Section
        title="Unapproved Artwork"
        count={unapprovedArtwork.length}
        emptyText="No artwork pending review."
      >
        <ArtworkTable artworks={unapprovedArtwork} />
      </Section>

      <Section
        title="Unscheduled Production Orders"
        count={pendingOrders.length}
        emptyText="No pending production orders."
      >
        <DraftOrderTable orders={pendingOrders} />
      </Section>

      <Section
        title="Expired Lots"
        count={expiredLots.length}
        emptyText="No expired lots."
      >
        <LotTable lots={expiredLots} showExpiry showStatus />
      </Section>

      <Section
        title="Expiring Within 30 Days"
        count={expiringSoonLots.length}
        emptyText="No lots expiring within 30 days."
      >
        <LotTable lots={expiringSoonLots} showExpiry showStatus />
      </Section>
    </div>
  );
}

function StatCard({
  label,
  count,
  urgent,
}: {
  label: string;
  count: number;
  urgent?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span
          className={`text-3xl font-bold ${urgent ? "text-red-600" : ""}`}
        >
          {count}
        </span>
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  count,
  emptyText,
  children,
}: {
  title: string;
  count: number;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {title}
          {count > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              ({count})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function LotTable({
  lots,
  showStatus,
  showExpiry,
  uploadDocType,
}: {
  lots: LotRow[];
  showStatus?: boolean;
  showExpiry?: boolean;
  uploadDocType?: "coa" | "bol";
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="pb-2 text-left font-medium">Lot #</th>
            <th className="pb-2 text-left font-medium">Item</th>
            <th className="pb-2 text-left font-medium">Client</th>
            {showStatus && (
              <th className="pb-2 text-left font-medium">Status</th>
            )}
            {showExpiry && (
              <th className="pb-2 text-left font-medium">Expiry</th>
            )}
            <th className="pb-2 text-right font-medium">Received</th>
            {uploadDocType && <th className="pb-2" />}
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => (
            <tr
              key={lot.id}
              className="border-b last:border-0 hover:bg-muted/30"
            >
              <td className="py-2 pr-4 font-mono text-xs">
                <Link
                  href={`/dashboard/lots/${lot.id}`}
                  className="hover:underline"
                >
                  {lot.lot_number}
                </Link>
              </td>
              <td className="py-2 pr-4 text-muted-foreground">
                {lot.items?.name ?? "—"}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">
                {lot.clients?.code ?? "—"}
              </td>
              {showStatus && (
                <td className="py-2 pr-4">
                  <LotStatusBadge status={lot.status} />
                </td>
              )}
              {showExpiry && (
                <td className="py-2 pr-4">
                  <ExpiryBadge date={lot.expiration_date} />
                </td>
              )}
              <td className="py-2 text-right text-muted-foreground whitespace-nowrap">
                {new Date(lot.received_at).toLocaleDateString()}
              </td>
              {uploadDocType && (
                <td className="py-2 pl-4 text-right">
                  {lot.clients?.id ? (
                    <UploadMissingDocButton
                      docType={uploadDocType}
                      clientId={lot.clients.id}
                      lotId={lot.id}
                      lotNumber={lot.lot_number}
                    />
                  ) : null}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormulaTable({ formulas }: { formulas: FormulaRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="pb-2 text-left font-medium">Formula #</th>
            <th className="pb-2 text-left font-medium">Name</th>
            <th className="pb-2 text-left font-medium">SKU</th>
            <th className="pb-2 text-left font-medium">Client</th>
            <th className="pb-2 text-left font-medium">Status</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {formulas.map((f) => (
            <tr
              key={f.id}
              className="border-b last:border-0 hover:bg-muted/30"
            >
              <td className="py-2 pr-4 font-mono text-xs">
                {f.formula_number ?? `v${f.version}`}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">
                {f.name ?? f.skus?.name ?? "—"}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">
                {f.skus?.code ?? "—"}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">
                {f.clients?.code ?? "—"}
              </td>
              <td className="py-2 pr-4">
                <Badge className="bg-gray-100 text-gray-700 border-gray-200">
                  {f.status}
                </Badge>
              </td>
              <td className="py-2 pl-4 text-right">
                {f.clients?.id ? (
                  <UploadMissingDocButton
                    docType="pa_letter"
                    clientId={f.clients.id}
                    formulaId={f.id}
                    formulaLabel={
                      f.formula_number
                        ? `${f.formula_number} — ${f.name ?? f.skus?.name ?? ""}`
                        : `${f.skus?.code ?? "Formula"} v${f.version}`
                    }
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArtworkTable({ artworks }: { artworks: ArtworkRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="pb-2 text-left font-medium">File</th>
            <th className="pb-2 text-left font-medium">Client</th>
            <th className="pb-2 text-left font-medium">Formula / SKU</th>
            <th className="pb-2 text-left font-medium">Status</th>
            <th className="pb-2 text-right font-medium">Uploaded</th>
            <th className="pb-2 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {artworks.map((art) => (
            <tr
              key={art.id}
              className="border-b last:border-0 hover:bg-muted/30"
            >
              <td className="py-2 pr-4 font-mono text-xs max-w-[200px] truncate">
                {art.file_name}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">
                {art.clients?.code ?? "—"}
              </td>
              <td className="py-2 pr-4 text-muted-foreground text-xs">
                {art.formulas
                  ? `${art.formulas.skus?.code ?? "Formula"} v${art.formulas.version}`
                  : "—"}
              </td>
              <td className="py-2 pr-4">
                <ArtworkStatusBadge status={art.artwork_status} />
              </td>
              <td className="py-2 pr-4 text-right text-muted-foreground whitespace-nowrap">
                {new Date(art.uploaded_at).toLocaleDateString()}
              </td>
              <td className="py-2 text-right">
                <Link
                  href={`/dashboard/documents/${art.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DraftOrderTable({ orders }: { orders: DraftOrderRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="pb-2 text-left font-medium">Order #</th>
            <th className="pb-2 text-left font-medium">SKU</th>
            <th className="pb-2 text-left font-medium">Client</th>
            <th className="pb-2 text-left font-medium">Ordered Qty</th>
            <th className="pb-2 text-right font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr
              key={o.id}
              className="border-b last:border-0 hover:bg-muted/30"
            >
              <td className="py-2 pr-4 font-mono text-xs">
                <Link
                  href={`/dashboard/production/${o.id}`}
                  className="hover:underline"
                >
                  {o.order_number}
                </Link>
              </td>
              <td className="py-2 pr-4 text-muted-foreground">
                {o.skus?.name ?? o.skus?.code ?? "—"}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">
                {o.clients?.code ?? "—"}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">
                {o.ordered_quantity != null
                  ? o.ordered_quantity.toLocaleString()
                  : "—"}
              </td>
              <td className="py-2 text-right text-muted-foreground whitespace-nowrap">
                {new Date(o.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LotStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    quarantine: "bg-yellow-100 text-yellow-800 border-yellow-200",
    on_hold: "bg-red-100 text-red-800 border-red-200",
    released: "bg-green-100 text-green-800 border-green-200",
  };
  const labels: Record<string, string> = {
    quarantine: "Quarantine",
    on_hold: "On Hold",
    released: "Released",
  };
  return (
    <Badge className={map[status] ?? "bg-gray-100 text-gray-600 border-gray-200"}>
      {labels[status] ?? status}
    </Badge>
  );
}

function ArtworkStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <Badge className="bg-gray-100 text-gray-600 border-gray-200">
        No Status
      </Badge>
    );
  }
  const map: Record<string, string> = {
    pending_review: "bg-yellow-100 text-yellow-800 border-yellow-200",
    rejected: "bg-red-100 text-red-800 border-red-200",
    approved: "bg-green-100 text-green-800 border-green-200",
  };
  const labels: Record<string, string> = {
    pending_review: "Pending Review",
    rejected: "Rejected",
    approved: "Approved",
  };
  return (
    <Badge className={map[status] ?? "bg-gray-100 text-gray-600 border-gray-200"}>
      {labels[status] ?? status}
    </Badge>
  );
}

function ExpiryBadge({ date }: { date: string | null }) {
  if (!date) return <span className="text-muted-foreground text-xs">—</span>;
  const today = new Date().toISOString().split("T")[0];
  const isExpired = date < today;
  return (
    <span
      className={`text-xs font-medium ${isExpired ? "text-red-600" : "text-amber-600"}`}
    >
      {new Date(date + "T00:00:00").toLocaleDateString()}
      {isExpired && " (expired)"}
    </span>
  );
}

function NeedsAttentionFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Needs Attention</h1>
        <div className="mt-1 h-4 w-56 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-9 w-12 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="h-5 w-full animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

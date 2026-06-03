import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import Link from "next/link";
import { UploadDialog, type Lot, type Formula } from "./upload-dialog";

const DOC_TYPE_LABELS: Record<string, string> = {
  coa: "CoA",
  spec_sheet: "Spec Sheet",
  po: "PO",
  bol: "BoL",
  pa_letter: "PA Letter",
  artwork: "Artwork",
  lab_report: "Lab Report",
  other: "Other",
};

const DOC_TYPE_COLORS: Record<string, string> = {
  coa: "bg-green-50 text-green-700 border-green-200",
  spec_sheet: "bg-blue-50 text-blue-700 border-blue-200",
  po: "bg-violet-50 text-violet-700 border-violet-200",
  bol: "bg-orange-50 text-orange-700 border-orange-200",
  pa_letter: "bg-teal-50 text-teal-700 border-teal-200",
  artwork: "bg-pink-50 text-pink-700 border-pink-200",
  lab_report: "bg-yellow-50 text-yellow-700 border-yellow-200",
  other: "bg-gray-50 text-gray-600 border-gray-200",
};

export default function DocumentsPage() {
  return (
    <Suspense fallback={<DocumentsFallback />}>
      <DocumentsContent />
    </Suspense>
  );
}

async function DocumentsContent() {
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

  const [{ data: docs }, { data: clients }, { data: lots }, { data: formulas }, { data: thirdPartyLogistics }] =
    await Promise.all([
      supabase
        .from("documents")
        .select(
          `id, document_type, file_name, uploaded_at, carrier_name,
           clients(name, code),
           lots!lot_id(lot_number, items(name)),
           formulas!formula_id(version, skus(code, name)),
           third_party_logistics!third_party_logistics_id(name, code),
           document_lots(lots(lot_number, items(name)))`
        )
        .order("uploaded_at", { ascending: false }),
      isInternal
        ? supabase.from("clients").select("id, name, code").eq("active", true)
        : Promise.resolve({ data: [] as { id: string; name: string; code: string }[] }),
      isInternal
        ? supabase.from("lots").select("id, lot_number, items(name)").order("lot_number")
        : Promise.resolve({ data: [] as { id: string; lot_number: string; items: { name: string } | null }[] }),
      isInternal
        ? supabase.from("formulas").select("id, version, skus(code, name)").order("version")
        : Promise.resolve({ data: [] as { id: string; version: string; skus: { code: string; name: string } | null }[] }),
      isInternal
        ? supabase.from("third_party_logistics").select("id, name, code").eq("active", true)
        : Promise.resolve({ data: [] as { id: string; name: string; code: string }[] }),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Documents</h1>
        {isInternal && (
          <UploadDialog
            clients={clients ?? []}
            lots={(lots ?? []) as unknown as Lot[]}
            formulas={(formulas ?? []) as unknown as Formula[]}
            thirdPartyLogistics={thirdPartyLogistics ?? []}
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            All Documents ({docs?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {docs?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-left font-medium">File</th>
                    <th className="pb-2 text-left font-medium">Type</th>
                    <th className="pb-2 text-left font-medium">Client</th>
                    <th className="pb-2 text-left font-medium">Related</th>
                    <th className="pb-2 text-right font-medium">Uploaded</th>
                    <th className="pb-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {(docs ?? []).map((doc) => {
                    const client = doc.clients as unknown as { name: string; code: string } | null;
                    const lot = doc.lots as unknown as { lot_number: string; items: { name: string } | null } | null;
                    const formula = doc.formulas as unknown as { version: string; skus: { code: string; name: string } | null } | null;
                    const tpl = doc.third_party_logistics as unknown as { name: string; code: string } | null;
                    const bolLots = (doc.document_lots as unknown as { lots: { lot_number: string; items: { name: string } | null } }[]) ?? [];

                    const related = buildRelatedLabel(doc.document_type, lot, formula, tpl, bolLots, (doc as unknown as { carrier_name: string | null }).carrier_name);

                    return (
                      <tr
                        key={doc.id}
                        className="border-b last:border-0 hover:bg-muted/30"
                      >
                        <td className="py-2 pr-4 max-w-xs truncate font-mono text-xs">
                          {doc.file_name}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge
                            className={
                              DOC_TYPE_COLORS[doc.document_type] ??
                              "bg-gray-50 text-gray-600 border-gray-200"
                            }
                          >
                            {DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {client?.code ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground text-xs max-w-[180px]">
                          {related ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-right text-muted-foreground whitespace-nowrap">
                          {new Date(doc.uploaded_at).toLocaleDateString()}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button asChild variant="outline" size="sm">
                              <Link
                                href={`/dashboard/documents/${doc.id}/view`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                View
                              </Link>
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/dashboard/documents/${doc.id}/download`}>
                                Download
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function buildRelatedLabel(
  docType: string,
  lot: { lot_number: string; items: { name: string } | null } | null,
  formula: { version: string; skus: { code: string; name: string } | null } | null,
  tpl: { name: string; code: string } | null,
  bolLots: { lots: { lot_number: string; items: { name: string } | null } }[],
  carrierName?: string | null,
): string | null {
  if (docType === "coa" && lot) {
    return `Lot ${lot.lot_number}${lot.items ? ` · ${lot.items.name}` : ""}`;
  }
  if (docType === "pa_letter" && formula) {
    return `${formula.skus?.code ?? "Formula"} v${formula.version}`;
  }
  if (docType === "bol") {
    const parts: string[] = [];
    if (carrierName) parts.push(carrierName);
    if (tpl) parts.push(tpl.code);
    if (bolLots.length > 0) {
      parts.push(bolLots.map((bl) => bl.lots.lot_number).join(", "));
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  return null;
}

function DocumentsFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Documents</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Documents</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-5 w-full animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

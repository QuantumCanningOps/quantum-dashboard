import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import Link from "next/link";
import { UploadDialog } from "./upload-dialog";

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

  const [{ data: docs }, { data: clients }, { data: skus }] =
    await Promise.all([
      supabase
        .from("documents")
        .select(
          "id, document_type, file_name, uploaded_at, clients(name, code), skus(code, name)"
        )
        .order("uploaded_at", { ascending: false }),
      isInternal
        ? supabase.from("clients").select("id, name, code").eq("active", true)
        : Promise.resolve({ data: [] as { id: string; name: string; code: string }[] }),
      isInternal
        ? supabase.from("skus").select("id, code, name, client_id").eq("active", true)
        : Promise.resolve({ data: [] as { id: string; code: string; name: string; client_id: string }[] }),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Documents</h1>
        {isInternal && (
          <UploadDialog clients={clients ?? []} skus={skus ?? []} />
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
                    <th className="pb-2 text-left font-medium">SKU</th>
                    <th className="pb-2 text-right font-medium">Uploaded</th>
                    <th className="pb-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {(docs ?? []).map((doc) => {
                    const client = doc.clients as unknown as {
                      name: string;
                      code: string;
                    } | null;
                    const sku = doc.skus as unknown as {
                      code: string;
                      name: string;
                    } | null;

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
                            {DOC_TYPE_LABELS[doc.document_type] ??
                              doc.document_type}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {client?.code ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {sku?.code ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-right text-muted-foreground whitespace-nowrap">
                          {new Date(doc.uploaded_at).toLocaleDateString()}
                        </td>
                        <td className="py-2 text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link
                              href={`/dashboard/documents/${doc.id}/download`}
                            >
                              Download
                            </Link>
                          </Button>
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

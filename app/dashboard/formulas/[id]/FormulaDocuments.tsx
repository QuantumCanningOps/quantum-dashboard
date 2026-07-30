"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDocumentRecord } from "@/app/dashboard/documents/actions";
import { randomId } from "@/lib/utils";

export type FormulaDocument = {
  id: string;
  document_type: "pa_letter" | "artwork";
  file_name: string;
  uploaded_at: string;
  artwork_status: string | null;
};

function ArtworkStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const styles: Record<string, string> = {
    pending_review: "bg-yellow-100 text-yellow-800 border-yellow-200",
    approved: "bg-green-100 text-green-800 border-green-200",
    rejected: "bg-red-100 text-red-800 border-red-200",
  };
  const labels: Record<string, string> = {
    pending_review: "Pending Review",
    approved: "Approved",
    rejected: "Rejected",
  };
  return (
    <Badge className={styles[status] ?? "bg-gray-100 text-gray-700 border-gray-200"}>
      {labels[status] ?? status}
    </Badge>
  );
}

function DocumentRow({ doc }: { doc: FormulaDocument }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium font-mono">{doc.file_name}</p>
          {doc.document_type === "artwork" && (
            <ArtworkStatusBadge status={doc.artwork_status} />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
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
          <Link href={`/dashboard/documents/${doc.id}/download`}>Download</Link>
        </Button>
      </div>
    </div>
  );
}

function FormulaDocUpload({
  clientId,
  formulaId,
  documentType,
  label,
}: {
  clientId: string;
  formulaId: string;
  documentType: "pa_letter" | "artwork";
  label: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const supabase = createClient();
      const uuid = randomId();
      const path = `${clientId}/${documentType}/${uuid}/${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, file);

      if (uploadError) throw new Error(uploadError.message);

      await createDocumentRecord({
        clientId,
        documentType,
        fileName: file.name,
        storagePath: path,
        formulaId,
      });

      setFile(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${documentType}-file`} className="text-xs">
        {label}
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          id={`${documentType}-file`}
          type="file"
          accept=".pdf,image/png,image/jpeg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => {
            void handleUpload();
          }}
          disabled={!file || uploading}
          className="shrink-0"
        >
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function FormulaDocuments({
  formulaId,
  clientId,
  documents,
}: {
  formulaId: string;
  clientId: string;
  documents: FormulaDocument[];
}) {
  const paLetters = documents.filter((d) => d.document_type === "pa_letter");
  const artwork = documents.filter((d) => d.document_type === "artwork");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Documents</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">PA Letter</h3>
            {paLetters.length > 0 ? (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                On File
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                Missing
              </Badge>
            )}
          </div>
          {paLetters.length > 0 ? (
            <div className="flex flex-col gap-2">
              {paLetters.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No PA letter is on file for this formula.
            </p>
          )}
          <FormulaDocUpload
            clientId={clientId}
            formulaId={formulaId}
            documentType="pa_letter"
            label={paLetters.length > 0 ? "Upload another PA letter" : "Upload PA letter (PDF or PNG)"}
          />
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Can Artwork</h3>
            {artwork.length > 0 ? (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                {artwork.length} file{artwork.length !== 1 ? "s" : ""}
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                Missing
              </Badge>
            )}
          </div>
          {artwork.length > 0 ? (
            <div className="flex flex-col gap-2">
              {artwork.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No can artwork is on file for this formula.
            </p>
          )}
          <FormulaDocUpload
            clientId={clientId}
            formulaId={formulaId}
            documentType="artwork"
            label={artwork.length > 0 ? "Add artwork file" : "Upload artwork (PDF or PNG)"}
          />
        </section>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createDocumentRecord,
  replaceDocumentRecord,
} from "@/app/dashboard/documents/actions";
import { GoogleDrivePickerButton } from "@/components/GoogleDrivePickerButton";
import { randomId } from "@/lib/utils";

export type FormulaDocument = {
  id: string;
  document_type: "pa_letter" | "artwork";
  file_name: string;
  uploaded_at: string;
  artwork_status: string | null;
};

function formatUploadedDate(iso: string) {
  // Stable across SSR/CSR: avoid toLocaleDateString() timezone/locale mismatches.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { timeZone: "UTC" });
}

function documentViewUrl(doc: Pick<FormulaDocument, "id" | "uploaded_at">) {
  // Include uploaded_at so replace uploads bust the browser cache.
  return `/dashboard/documents/${doc.id}/view?v=${encodeURIComponent(doc.uploaded_at)}`;
}

function isImageFile(fileName: string) {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(fileName);
}

function isPdfFile(fileName: string) {
  return /\.pdf$/i.test(fileName);
}

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

function DocumentActions({ doc }: { doc: FormulaDocument }) {
  return (
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
          Uploaded {formatUploadedDate(doc.uploaded_at)}
        </p>
      </div>
      <DocumentActions doc={doc} />
    </div>
  );
}

function ArtworkPreviewCard({ doc }: { doc: FormulaDocument }) {
  const previewUrl = documentViewUrl(doc);
  const showImage = isImageFile(doc.file_name);
  const showPdf = isPdfFile(doc.file_name);

  return (
    <div className="overflow-hidden rounded-md border bg-muted/30">
      {showImage && (
        <Link
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-white"
        >
          <img
            src={previewUrl}
            alt={`Can artwork: ${doc.file_name}`}
            className="mx-auto max-h-96 w-full object-contain"
          />
        </Link>
      )}
      {showPdf && (
        <iframe
          src={previewUrl}
          title={`Can artwork: ${doc.file_name}`}
          className="h-96 w-full bg-white"
        />
      )}
      <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium font-mono">{doc.file_name}</p>
            <ArtworkStatusBadge status={doc.artwork_status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Uploaded {formatUploadedDate(doc.uploaded_at)}
          </p>
        </div>
        <DocumentActions doc={doc} />
      </div>
    </div>
  );
}

function FormulaDocUpload({
  clientId,
  formulaId,
  documentType,
  label,
  replaceDocumentId,
}: {
  clientId: string;
  formulaId: string;
  documentType: "pa_letter" | "artwork";
  label: string;
  replaceDocumentId?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isReplace = Boolean(replaceDocumentId);
  const inputId = isReplace
    ? `${documentType}-replace-file`
    : `${documentType}-file`;

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

      if (replaceDocumentId) {
        await replaceDocumentRecord({
          documentId: replaceDocumentId,
          fileName: file.name,
          storagePath: path,
        });
      } else {
        await createDocumentRecord({
          clientId,
          documentType,
          fileName: file.name,
          storagePath: path,
          formulaId,
        });
      }

      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId} className="text-xs">
        {label}
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          id={inputId}
          type="file"
          accept=".pdf,image/png,image/jpeg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <GoogleDrivePickerButton
          disabled={uploading}
          onFile={(selected) => {
            setFile(selected);
            setError(null);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant={isReplace ? "outline" : "default"}
          onClick={() => {
            void handleUpload();
          }}
          disabled={!file || uploading}
          className="shrink-0"
        >
          {uploading
            ? isReplace
              ? "Replacing…"
              : "Uploading…"
            : isReplace
              ? "Replace"
              : "Upload"}
        </Button>
      </div>
      {file && (
        <p className="text-xs text-muted-foreground font-mono truncate">
          Selected: {file.name}
        </p>
      )}
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
  // One PA letter and one artwork per formula (newest if legacy multiples exist).
  const paLetter =
    documents.find((d) => d.document_type === "pa_letter") ?? null;
  const artwork =
    documents.find((d) => d.document_type === "artwork") ?? null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Documents</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">PA Letter</h3>
            {paLetter ? (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                On File
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                Missing
              </Badge>
            )}
          </div>
          {paLetter ? (
            <>
              <DocumentRow doc={paLetter} />
              <FormulaDocUpload
                clientId={clientId}
                formulaId={formulaId}
                documentType="pa_letter"
                label="Replace PA letter (PDF or PNG)"
                replaceDocumentId={paLetter.id}
              />
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                No PA letter is on file for this formula.
              </p>
              <FormulaDocUpload
                clientId={clientId}
                formulaId={formulaId}
                documentType="pa_letter"
                label="Upload PA letter (PDF or PNG)"
              />
            </>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Can Artwork</h3>
            {artwork ? (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                On File
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                Missing
              </Badge>
            )}
          </div>
          {artwork ? (
            <>
              <ArtworkPreviewCard doc={artwork} />
              <FormulaDocUpload
                clientId={clientId}
                formulaId={formulaId}
                documentType="artwork"
                label="Replace artwork (PDF or PNG)"
                replaceDocumentId={artwork.id}
              />
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                No can artwork is on file for this formula.
              </p>
              <FormulaDocUpload
                clientId={clientId}
                formulaId={formulaId}
                documentType="artwork"
                label="Upload artwork (PDF or PNG)"
              />
            </>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

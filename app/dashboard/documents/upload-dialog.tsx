"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDocumentRecord } from "./actions";

const DOCUMENT_TYPES = [
  { value: "coa", label: "Certificate of Analysis" },
  { value: "spec_sheet", label: "Spec Sheet" },
  { value: "po", label: "Purchase Order" },
  { value: "bol", label: "Bill of Lading" },
  { value: "pa_letter", label: "PA Letter" },
  { value: "artwork", label: "Artwork" },
  { value: "lab_report", label: "Lab Report" },
  { value: "other", label: "Other" },
];

interface Client {
  id: string;
  name: string;
  code: string;
}

interface Sku {
  id: string;
  code: string;
  name: string;
  client_id: string;
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function UploadDialog({
  clients,
  skus,
}: {
  clients: Client[];
  skus: Sku[];
}) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [skuId, setSkuId] = useState("");
  const [docType, setDocType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredSkus = skus.filter((s) => s.client_id === clientId);

  function reset() {
    setClientId("");
    setSkuId("");
    setDocType("");
    setFile(null);
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleUpload() {
    if (!file || !clientId || !docType) return;
    setUploading(true);
    setError(null);

    try {
      const supabase = createClient();
      const uuid = crypto.randomUUID();
      const path = `${clientId}/${docType}/${uuid}/${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, file);

      if (uploadError) throw new Error(uploadError.message);

      await createDocumentRecord({
        clientId,
        skuId: skuId || undefined,
        documentType: docType,
        fileName: file.name,
        storagePath: path,
      });

      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Upload Document</Button>;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg p-6 w-full max-w-md shadow-lg flex flex-col gap-5">
        <h2 className="text-lg font-semibold">Upload Document</h2>

        <div className="flex flex-col gap-2">
          <Label htmlFor="doc-client">Client *</Label>
          <select
            id="doc-client"
            className={selectClass}
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setSkuId("");
            }}
          >
            <option value="">Select client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="doc-type">Document Type *</Label>
          <select
            id="doc-type"
            className={selectClass}
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
          >
            <option value="">Select type…</option>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {filteredSkus.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="doc-sku">SKU (optional)</Label>
            <select
              id="doc-sku"
              className={selectClass}
              value={skuId}
              onChange={(e) => setSkuId(e.target.value)}
            >
              <option value="">None</option>
              {filteredSkus.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="doc-file">File *</Label>
          <Input
            id="doc-file"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={close} disabled={uploading}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={uploading || !file || !clientId || !docType}
          >
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>
    </div>
  );
}

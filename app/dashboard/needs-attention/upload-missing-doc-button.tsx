"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDocumentRecord } from "@/app/dashboard/documents/actions";

type Props =
  | { docType: "coa"; clientId: string; lotId: string; lotNumber: string }
  | { docType: "pa_letter"; clientId: string; formulaId: string; formulaLabel: string }
  | { docType: "bol"; clientId: string; lotId: string; lotNumber: string };

const DOC_TYPE_LABELS: Record<string, string> = {
  coa: "Certificate of Analysis",
  pa_letter: "PA Letter",
  bol: "Bill of Lading",
};

export function UploadMissingDocButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [carrierName, setCarrierName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const entityLabel =
    props.docType === "pa_letter" ? props.formulaLabel : props.lotNumber;

  const isValid =
    !!file && (props.docType !== "bol" || !!carrierName.trim());

  function handleClose() {
    setOpen(false);
    setFile(null);
    setCarrierName("");
    setError(null);
  }

  async function handleUpload() {
    if (!isValid || !file) return;
    setUploading(true);
    setError(null);

    try {
      const supabase = createClient();
      const uuid = crypto.randomUUID();
      const path = `${props.clientId}/${props.docType}/${uuid}/${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, file);

      if (uploadError) throw new Error(uploadError.message);

      await createDocumentRecord({
        clientId: props.clientId,
        documentType: props.docType,
        fileName: file.name,
        storagePath: path,
        lotId: props.docType === "coa" ? props.lotId : undefined,
        formulaId: props.docType === "pa_letter" ? props.formulaId : undefined,
        lotIds: props.docType === "bol" ? [props.lotId] : undefined,
        carrierName: props.docType === "bol" ? carrierName.trim() : undefined,
      });

      handleClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setUploading(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Upload
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 w-full max-w-sm shadow-lg flex flex-col gap-5">
            <h2 className="text-base font-semibold">
              Upload {DOC_TYPE_LABELS[props.docType]}
            </h2>

            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">For </span>
              <span className="font-mono font-medium">{entityLabel}</span>
            </div>

            {props.docType === "bol" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="na-carrier">Carrier *</Label>
                <Input
                  id="na-carrier"
                  placeholder="e.g. FedEx Freight, XPO Logistics"
                  value={carrierName}
                  onChange={(e) => setCarrierName(e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="na-file">File *</Label>
              <Input
                id="na-file"
                type="file"
                accept=".pdf,image/png"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!isValid || uploading}
              >
                {uploading ? "Uploading…" : "Upload"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

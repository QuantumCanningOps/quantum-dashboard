"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDocumentRecord } from "../../documents/actions";
import { randomId } from "@/lib/utils";

export function CertUpload({
  lotId,
  clientId,
}: {
  lotId: string;
  clientId: string;
}) {
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
      const path = `${clientId}/coa/${uuid}/${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, file);

      if (uploadError) throw new Error(uploadError.message);

      await createDocumentRecord({
        clientId,
        documentType: "coa",
        fileName: file.name,
        storagePath: path,
        lotId,
      });

      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="coa-file">CoA File (PDF or PNG)</Label>
        <Input
          id="coa-file"
          type="file"
          accept=".pdf,image/png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="self-start"
      >
        {uploading ? "Uploading…" : "Upload CoA"}
      </Button>
    </div>
  );
}

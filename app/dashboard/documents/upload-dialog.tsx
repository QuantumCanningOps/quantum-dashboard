"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDocumentRecord } from "./actions";
import { randomId } from "@/lib/utils";

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

export interface Client {
  id: string;
  name: string;
  code: string;
}

export interface Lot {
  id: string;
  lot_number: string;
  items: { name: string } | { name: string }[] | null;
}

export interface Formula {
  id: string;
  version: string;
  skus: { code: string; name: string } | { code: string; name: string }[] | null;
}

export interface ThirdPartyLogistics {
  id: string;
  name: string;
  code: string;
}

function lotItemName(items: Lot["items"]): string | null {
  if (!items) return null;
  if (Array.isArray(items)) return items[0]?.name ?? null;
  return items.name;
}

function formulaSkuProp(
  skus: Formula["skus"],
  key: "code" | "name"
): string | null {
  if (!skus) return null;
  if (Array.isArray(skus)) return skus[0]?.[key] ?? null;
  return skus[key];
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function UploadDialog({
  clients,
  lots,
  formulas,
  thirdPartyLogistics,
}: {
  clients: Client[];
  lots: Lot[];
  formulas: Formula[];
  thirdPartyLogistics: ThirdPartyLogistics[];
}) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [docType, setDocType] = useState("");
  const [lotId, setLotId] = useState("");
  const [formulaId, setFormulaId] = useState("");
  const [tplId, setTplId] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [selectedLotIds, setSelectedLotIds] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setClientId("");
    setDocType("");
    setLotId("");
    setFormulaId("");
    setTplId("");
    setCarrierName("");
    setSelectedLotIds(new Set());
    setFile(null);
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function toggleLot(id: string) {
    setSelectedLotIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const isValid =
    !!file &&
    !!clientId &&
    !!docType &&
    (docType !== "coa" || !!lotId) &&
    (docType !== "pa_letter" || !!formulaId) &&
    (docType !== "bol" || (!!carrierName.trim() && selectedLotIds.size > 0));

  async function handleUpload() {
    if (!isValid || !file) return;
    setUploading(true);
    setError(null);

    try {
      const supabase = createClient();
      const uuid = randomId();
      const path = `${clientId}/${docType}/${uuid}/${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, file);

      if (uploadError) throw new Error(uploadError.message);

      await createDocumentRecord({
        clientId,
        documentType: docType,
        fileName: file.name,
        storagePath: path,
        lotId: docType === "coa" ? lotId : undefined,
        formulaId: docType === "pa_letter" ? formulaId : undefined,
        thirdPartyLogisticsId: docType === "bol" && tplId ? tplId : undefined,
        carrierName: docType === "bol" && carrierName.trim() ? carrierName.trim() : undefined,
        lotIds: docType === "bol" ? Array.from(selectedLotIds) : undefined,
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
      <div className="bg-background rounded-lg p-6 w-full max-w-md shadow-lg flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold">Upload Document</h2>

        <div className="flex flex-col gap-2">
          <Label htmlFor="doc-client">Client *</Label>
          <select
            id="doc-client"
            className={selectClass}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
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
            onChange={(e) => {
              setDocType(e.target.value);
              setLotId("");
              setFormulaId("");
              setTplId("");
              setCarrierName("");
              setSelectedLotIds(new Set());
            }}
          >
            <option value="">Select type…</option>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {docType === "coa" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="doc-lot">Lot *</Label>
            <select
              id="doc-lot"
              className={selectClass}
              value={lotId}
              onChange={(e) => setLotId(e.target.value)}
            >
              <option value="">Select lot…</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lot_number}{lotItemName(l.items) ? ` — ${lotItemName(l.items)}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {docType === "pa_letter" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="doc-formula">Formula *</Label>
            <select
              id="doc-formula"
              className={selectClass}
              value={formulaId}
              onChange={(e) => setFormulaId(e.target.value)}
            >
              <option value="">Select formula…</option>
              {formulas.map((f) => {
                const skuCode = formulaSkuProp(f.skus, "code");
                const skuName = formulaSkuProp(f.skus, "name");
                return (
                  <option key={f.id} value={f.id}>
                    {skuCode ?? "—"} v{f.version}
                    {skuName ? ` — ${skuName}` : ""}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {docType === "bol" && (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="doc-carrier">Carrier *</Label>
              <Input
                id="doc-carrier"
                placeholder="e.g. FedEx Freight, UPS, XPO Logistics"
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="doc-tpl">
                3PL{" "}
                <span className="text-muted-foreground font-normal">
                  (if delivered to offsite warehouse)
                </span>
              </Label>
              <select
                id="doc-tpl"
                className={selectClass}
                value={tplId}
                onChange={(e) => setTplId(e.target.value)}
              >
                <option value="">None</option>
                {thirdPartyLogistics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Lots * <span className="text-muted-foreground font-normal">(select all that apply)</span></Label>
              <div className="border rounded-md p-3 flex flex-col gap-2 max-h-40 overflow-y-auto">
                {lots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No lots available.</p>
                ) : (
                  lots.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLotIds.has(l.id)}
                        onChange={() => toggleLot(l.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span>{l.lot_number}{lotItemName(l.items) ? ` — ${lotItemName(l.items)}` : ""}</span>
                    </label>
                  ))
                )}
              </div>
              {selectedLotIds.size > 0 && (
                <p className="text-xs text-muted-foreground">{selectedLotIds.size} lot{selectedLotIds.size !== 1 ? "s" : ""} selected</p>
              )}
            </div>
          </>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="doc-file">File *</Label>
          <Input
            id="doc-file"
            type="file"
            accept=".pdf,image/png"
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
          <Button onClick={handleUpload} disabled={uploading || !isValid}>
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>
    </div>
  );
}

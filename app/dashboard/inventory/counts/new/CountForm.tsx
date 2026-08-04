"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GoogleDrivePickerButton } from "@/components/GoogleDrivePickerButton";
import { randomId } from "@/lib/utils";
import {
  createInventoryCount,
  createLocation,
  createSupplier,
  deleteInventoryCountLine,
  saveInventoryCountLine,
  updateInventoryCountHeader,
  type CountLineInput,
  type CountReason,
} from "../actions";

type ClientOption = { id: string; name: string; code: string };
type ItemOption = {
  id: string;
  name: string;
  item_code: string | null;
  unit_of_measure: string;
  client_id: string | null;
  supplier_id: string | null;
  requires_coa: boolean;
};
type LocationOption = { id: string; label: string; zone_name: string | null };
type SupplierOption = { id: string; name: string; code: string };
type ZoneOption = { id: string; name: string; zone_type: string };
type OnHandRow = {
  lot_id: string;
  lot_number: string;
  item_id: string;
  item_name: string;
  location_id: string;
  location_label: string | null;
  unit_of_measure: string;
  quantity_on_hand: number;
  supplier_id: string | null;
  client_id: string;
  expiration_date: string | null;
};

type LineDraft = {
  key: string;
  dbId: string | null;
  itemId: string;
  lotId: string | null;
  lotNumber: string;
  locationId: string;
  systemQuantity: number;
  countedQuantity: string;
  unitOfMeasure: string;
  supplierId: string;
  manufactureDate: string;
  expirationDate: string;
  receivedAt: string;
  notes: string;
  coaFile: File | null;
  existingCoaFileName: string | null;
  existingCoaStoragePath: string | null;
  fromOnHand: boolean;
  showNewSupplier: boolean;
  showNewLocation: boolean;
};

export type DraftCountInitial = {
  id: string;
  clientId: string;
  countDate: string;
  reason: CountReason;
  notes: string | null;
  lines: Array<{
    id: string;
    itemId: string;
    lotId: string | null;
    lotNumber: string;
    locationId: string;
    systemQuantity: number;
    countedQuantity: number;
    unitOfMeasure: string;
    supplierId: string | null;
    manufactureDate: string | null;
    expirationDate: string | null;
    receivedAt: string | null;
    notes: string | null;
    coaFileName: string | null;
    coaStoragePath: string | null;
  }>;
};

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

const SEL =
  "flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const OPT = "bg-background text-foreground";

const REASONS: Array<{ value: CountReason; label: string }> = [
  { value: "opening_balance", label: "Opening balance" },
  { value: "audit", label: "Audit" },
  { value: "cycle_count", label: "Cycle count" },
];

const LOCATION_TYPES = [
  { value: "rack", label: "Rack" },
  { value: "floor", label: "Floor" },
  { value: "staging", label: "Staging" },
  { value: "dock", label: "Dock" },
] as const;

function today() {
  return new Date().toISOString().split("T")[0];
}

function newEmptyLine(): LineDraft {
  return {
    key: randomId(),
    dbId: null,
    itemId: "",
    lotId: null,
    lotNumber: "",
    locationId: "",
    systemQuantity: 0,
    countedQuantity: "",
    unitOfMeasure: "",
    supplierId: "",
    manufactureDate: "",
    expirationDate: "",
    receivedAt: today(),
    notes: "",
    coaFile: null,
    existingCoaFileName: null,
    existingCoaStoragePath: null,
    fromOnHand: false,
    showNewSupplier: false,
    showNewLocation: false,
  };
}

function cloneLine(line: LineDraft): LineDraft {
  return { ...line, coaFile: line.coaFile };
}

function linesFromDraft(draft: DraftCountInitial): LineDraft[] {
  return draft.lines.map((line) => ({
    key: line.id,
    dbId: line.id,
    itemId: line.itemId,
    lotId: line.lotId,
    lotNumber: line.lotNumber,
    locationId: line.locationId,
    systemQuantity: line.systemQuantity,
    countedQuantity: String(line.countedQuantity),
    unitOfMeasure: line.unitOfMeasure,
    supplierId: line.supplierId ?? "",
    manufactureDate: toDateInput(line.manufactureDate),
    expirationDate: toDateInput(line.expirationDate),
    receivedAt: toDateInput(line.receivedAt),
    notes: line.notes ?? "",
    coaFile: null,
    existingCoaFileName: line.coaFileName,
    existingCoaStoragePath: line.coaStoragePath,
    fromOnHand: Boolean(line.lotId),
    showNewSupplier: false,
    showNewLocation: false,
  }));
}

export function CountForm({
  clients,
  items: initialItems,
  locations: initialLocations,
  suppliers: initialSuppliers,
  zones,
  onHand,
  draft = null,
}: {
  clients: ClientOption[];
  items: ItemOption[];
  locations: LocationOption[];
  suppliers: SupplierOption[];
  zones: ZoneOption[];
  onHand: OnHandRow[];
  draft?: DraftCountInitial | null;
}) {
  const router = useRouter();
  const editing = Boolean(draft);
  const [pending, startTransition] = useTransition();
  const [clientId, setClientId] = useState(draft?.clientId ?? "");
  const [countDate, setCountDate] = useState(draft?.countDate ?? today());
  const [reason, setReason] = useState<CountReason>(
    draft?.reason ?? "opening_balance",
  );
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(
    draft ? linesFromDraft(draft) : [],
  );
  const [items] = useState(initialItems);
  const [locations, setLocations] = useState(initialLocations);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(Boolean(draft));

  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierCode, setNewSupplierCode] = useState("");
  const [newLocationLabel, setNewLocationLabel] = useState("");
  const [newLocationZoneId, setNewLocationZoneId] = useState("");
  const [newLocationType, setNewLocationType] =
    useState<(typeof LOCATION_TYPES)[number]["value"]>("rack");
  const [creatingForLine, setCreatingForLine] = useState<string | null>(null);
  const [inlineCreateError, setInlineCreateError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [lineBaseline, setLineBaseline] = useState<LineDraft | null>(null);
  const [lineMessage, setLineMessage] = useState<string | null>(null);

  const clientItems = useMemo(
    () => items.filter((i) => !clientId || i.client_id === clientId),
    [items, clientId],
  );

  const clientOnHand = useMemo(
    () => onHand.filter((r) => r.client_id === clientId),
    [onHand, clientId],
  );

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function prefillFromOnHand() {
    if (!clientId) {
      setError("Select a client before prefilling");
      return;
    }
    setError(null);
    setLines(
      clientOnHand.map((row) => ({
        key: randomId(),
        dbId: null,
        itemId: row.item_id,
        lotId: row.lot_id,
        lotNumber: row.lot_number,
        locationId: row.location_id,
        systemQuantity: Number(row.quantity_on_hand),
        countedQuantity: String(row.quantity_on_hand),
        unitOfMeasure: row.unit_of_measure,
        supplierId: row.supplier_id ?? "",
        manufactureDate: "",
        expirationDate: row.expiration_date ?? "",
        receivedAt: "",
        notes: "",
        coaFile: null,
        existingCoaFileName: null,
        existingCoaStoragePath: null,
        fromOnHand: true,
        showNewSupplier: false,
        showNewLocation: false,
      })),
    );
    setPrefilled(true);
    setExpandedKey(null);
    setLineBaseline(null);
  }

  async function buildLinePayload(line: LineDraft): Promise<CountLineInput | { error: string }> {
    let coaFileName: string | null = null;
    let coaStoragePath: string | null = null;

    if (line.coaFile) {
      if (!clientId) return { error: "Client is required before uploading COAs" };
      const supabase = createClient();
      const coaId = randomId();
      const path = `${clientId}/coa/${coaId}/${line.coaFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, line.coaFile);
      if (uploadError) {
        return {
          error: `COA upload failed for ${line.lotNumber || "line"}: ${uploadError.message}`,
        };
      }
      coaFileName = line.coaFile.name;
      coaStoragePath = path;
    } else {
      coaFileName = line.existingCoaFileName;
      coaStoragePath = line.existingCoaStoragePath;
    }

    return {
      itemId: line.itemId,
      lotId: line.lotId,
      lotNumber: line.lotNumber.trim(),
      locationId: line.locationId,
      systemQuantity: line.systemQuantity,
      countedQuantity: Number(line.countedQuantity),
      unitOfMeasure: line.unitOfMeasure.trim(),
      lotStatus: "released",
      supplierId: line.supplierId || null,
      manufactureDate: line.manufactureDate || null,
      expirationDate: line.expirationDate || null,
      receivedAt: line.receivedAt || null,
      coaFileName,
      coaStoragePath,
      notes: line.notes || null,
    };
  }

  function revertExpandedIn(prev: LineDraft[]): LineDraft[] {
    if (!expandedKey) return prev;
    if (lineBaseline && lineBaseline.key === expandedKey) {
      return prev.map((l) =>
        l.key === expandedKey ? cloneLine(lineBaseline) : l,
      );
    }
    return prev.filter((l) => l.key !== expandedKey);
  }

  function startEditLine(line: LineDraft) {
    setError(null);
    setLineMessage(null);
    setInlineCreateError(null);
    setLines((prev) => revertExpandedIn(prev));
    setLineBaseline(cloneLine(line));
    setExpandedKey(line.key);
  }

  function cancelEditLine() {
    if (!expandedKey) return;
    setError(null);
    setInlineCreateError(null);
    setLines((prev) => revertExpandedIn(prev));
    setExpandedKey(null);
    setLineBaseline(null);
  }

  function saveExpandedLine() {
    if (!draft || !expandedKey) return;
    const line = lines.find((l) => l.key === expandedKey);
    if (!line) return;

    setError(null);
    setLineMessage(null);
    startTransition(async () => {
      const payload = await buildLinePayload(line);
      if ("error" in payload) {
        setError(payload.error);
        return;
      }
      const result = await saveInventoryCountLine({
        countId: draft.id,
        lineId: line.dbId,
        line: payload,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setLines((prev) =>
        prev.map((l) =>
          l.key === expandedKey
            ? {
                ...l,
                dbId: result.lineId,
                coaFile: null,
                existingCoaFileName: payload.coaFileName,
                existingCoaStoragePath: payload.coaStoragePath,
                showNewSupplier: false,
                showNewLocation: false,
              }
            : l,
        ),
      );
      setExpandedKey(null);
      setLineBaseline(null);
      setLineMessage("Line saved");
    });
  }

  function removeLine(line: LineDraft) {
    setError(null);
    setLineMessage(null);
    if (!editing || !draft || !line.dbId) {
      setLines((prev) => prev.filter((l) => l.key !== line.key));
      if (expandedKey === line.key) {
        setExpandedKey(null);
        setLineBaseline(null);
      }
      return;
    }
    startTransition(async () => {
      const result = await deleteInventoryCountLine({
        countId: draft.id,
        lineId: line.dbId!,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setLines((prev) => prev.filter((l) => l.key !== line.key));
      if (expandedKey === line.key) {
        setExpandedKey(null);
        setLineBaseline(null);
      }
      setLineMessage("Line removed");
    });
  }

  function saveHeader() {
    if (!draft) return;
    setError(null);
    setLineMessage(null);
    startTransition(async () => {
      const result = await updateInventoryCountHeader({
        countId: draft.id,
        countDate,
        reason,
        notes: notes.trim() || null,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setLineMessage("Header saved");
    });
  }

  function addLotLine() {
    const line = newEmptyLine();
    setLines((prev) => [...revertExpandedIn(prev), line]);
    if (editing) {
      setLineBaseline(null);
      setExpandedKey(line.key);
      setLineMessage(null);
      setError(null);
      setInlineCreateError(null);
    }
  }

  function onItemChange(key: string, itemId: string) {
    const item = clientItems.find((i) => i.id === itemId);
    updateLine(key, {
      itemId,
      unitOfMeasure: item?.unit_of_measure ?? "",
      supplierId: item?.supplier_id ?? "",
    });
  }

  async function handleCreateSupplier(lineKey: string) {
    setError(null);
    setInlineCreateError(null);
    if (!newSupplierName.trim()) {
      setInlineCreateError("Supplier name is required");
      return;
    }
    setCreatingForLine(lineKey);
    try {
      const result = await createSupplier({
        name: newSupplierName,
        code: newSupplierCode || null,
      });
      if ("error" in result) {
        setInlineCreateError(result.error);
        return;
      }
      setSuppliers((prev) =>
        [...prev, result].sort((a, b) => a.name.localeCompare(b.name)),
      );
      updateLine(lineKey, {
        supplierId: result.id,
        showNewSupplier: false,
      });
      setNewSupplierName("");
      setNewSupplierCode("");
    } catch (e) {
      setInlineCreateError(e instanceof Error ? e.message : "Failed to create supplier");
    } finally {
      setCreatingForLine(null);
    }
  }

  async function handleCreateLocation(lineKey: string) {
    setError(null);
    setInlineCreateError(null);
    if (!newLocationLabel.trim()) {
      setInlineCreateError("Location label is required");
      return;
    }
    if (!newLocationZoneId) {
      setInlineCreateError("Zone is required");
      return;
    }
    setCreatingForLine(lineKey);
    try {
      const result = await createLocation({
        label: newLocationLabel,
        zoneId: newLocationZoneId,
        locationType: newLocationType,
      });
      if ("error" in result) {
        setInlineCreateError(result.error);
        return;
      }
      setLocations((prev) =>
        [...prev, result].sort((a, b) => a.label.localeCompare(b.label)),
      );
      updateLine(lineKey, {
        locationId: result.id,
        showNewLocation: false,
      });
      setNewLocationLabel("");
      setNewLocationZoneId("");
      setNewLocationType("rack");
    } catch (e) {
      setInlineCreateError(e instanceof Error ? e.message : "Failed to create location");
    } finally {
      setCreatingForLine(null);
    }
  }

  const varianceTotal = lines.reduce((sum, line) => {
    const counted = Number(line.countedQuantity);
    if (Number.isNaN(counted)) return sum;
    return sum + (counted - line.systemQuantity);
  }, 0);

  function goToReview() {
    if (!draft) return;
    if (expandedKey) {
      setError("Save or cancel the open line before reviewing");
      return;
    }
    const unsaved = lines.some((l) => !l.dbId);
    if (unsaved) {
      setError("Save or remove unsaved lines before reviewing");
      return;
    }
    router.push(`/dashboard/inventory/counts/${draft.id}`);
  }

  function submit() {
    if (editing) {
      goToReview();
      return;
    }
    setError(null);
    startTransition(async () => {
      const payloadLines: CountLineInput[] = [];

      for (const line of lines) {
        const payload = await buildLinePayload(line);
        if ("error" in payload) {
          setError(payload.error);
          return;
        }
        payloadLines.push(payload);
      }

      const result = await createInventoryCount({
        clientId,
        countDate,
        reason,
        notes: notes.trim() || null,
        lines: payloadLines,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/dashboard/inventory/counts/${result.countId}`);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {editing ? "Edit inventory count" : "New inventory count"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {editing
            ? "Edit one line at a time. Collapsed lines match the review preview. Save each line, then review & post."
            : "Enter current lot-level inventory, or prefill from on-hand for an audit. Save as a draft, review variances, then post."}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Count header</CardTitle>
          {editing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={saveHeader}
              disabled={pending}
            >
              Save header
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="client">Client</Label>
            <select
              id="client"
              className={SEL}
              value={clientId}
              disabled={editing}
              onChange={(e) => {
                setClientId(e.target.value);
                setLines([]);
                setPrefilled(false);
              }}
            >
              <option className={OPT} value="">
                Select client…
              </option>
              {clients.map((c) => (
                <option key={c.id} className={OPT} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Count date</Label>
            <Input
              id="date"
              type="date"
              value={countDate}
              onChange={(e) => setCountDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <select
              id="reason"
              className={SEL}
              value={reason}
              onChange={(e) => setReason(e.target.value as CountReason)}
            >
              {REASONS.map((r) => (
                <option key={r.value} className={OPT} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {!editing ? (
          <Button
            type="button"
            variant="outline"
            onClick={prefillFromOnHand}
            disabled={!clientId}
          >
            Prefill from on-hand ({clientOnHand.length})
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={addLotLine}
          disabled={!clientId}
        >
          Add lot line
        </Button>
        {prefilled ? (
          <Badge variant="secondary">{lines.length} lines loaded</Badge>
        ) : null}
        <span className="text-sm text-muted-foreground ml-auto">
          Net variance:{" "}
          <span
            className={
              varianceTotal === 0
                ? ""
                : varianceTotal > 0
                  ? "text-emerald-700"
                  : "text-red-700"
            }
          >
            {varianceTotal > 0 ? "+" : ""}
            {varianceTotal}
          </span>
        </span>
      </div>

      {lines.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Select a client and add lot lines, or prefill from on-hand for an audit.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {editing ? (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Item</th>
                      <th className="px-4 py-2 font-medium">Lot #</th>
                      <th className="px-4 py-2 font-medium">Location</th>
                      <th className="px-4 py-2 font-medium text-right">System</th>
                      <th className="px-4 py-2 font-medium text-right">Counted</th>
                      <th className="px-4 py-2 font-medium text-right">Variance</th>
                      <th className="px-4 py-2 font-medium">UOM</th>
                      <th className="px-4 py-2 font-medium">Received</th>
                      <th className="px-4 py-2 font-medium">Expires</th>
                      <th className="px-4 py-2 font-medium">COA</th>
                      <th className="px-4 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines
                      .filter((line) => line.key !== expandedKey)
                      .map((line) => {
                        const counted = Number(line.countedQuantity);
                        const variance = Number.isNaN(counted)
                          ? 0
                          : counted - line.systemQuantity;
                        const item = clientItems.find((i) => i.id === line.itemId);
                        const locationLabel =
                          locations.find((l) => l.id === line.locationId)?.label ??
                          "—";
                        return (
                          <tr key={line.key} className="border-b last:border-0">
                            <td className="px-4 py-3">
                              {item?.name ?? "—"}
                              {!line.dbId ? (
                                <Badge variant="outline" className="ml-2">
                                  Unsaved
                                </Badge>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">
                              {line.lotNumber || "—"}
                              {!line.lotId ? (
                                <Badge variant="outline" className="ml-2">
                                  new
                                </Badge>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">{locationLabel}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                              {line.systemQuantity}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {Number.isNaN(counted) ? "—" : counted}
                            </td>
                            <td
                              className={`px-4 py-3 text-right tabular-nums ${
                                variance === 0
                                  ? "text-muted-foreground"
                                  : variance > 0
                                    ? "text-emerald-700"
                                    : "text-red-700"
                              }`}
                            >
                              {variance > 0 ? "+" : ""}
                              {Number.isNaN(counted) ? "—" : variance}
                            </td>
                            <td className="px-4 py-3">{line.unitOfMeasure || "—"}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {line.receivedAt
                                ? new Date(line.receivedAt).toLocaleDateString()
                                : "—"}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {line.expirationDate || "—"}
                            </td>
                            <td className="px-4 py-3 max-w-[10rem] truncate">
                              {line.coaFile?.name ??
                                line.existingCoaFileName ??
                                "—"}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={pending}
                                onClick={() => startEditLine(line)}
                              >
                                Edit
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                {lines.filter((line) => line.key !== expandedKey).length === 0 &&
                expandedKey ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    Editing the only open line below.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {(editing
            ? lines.filter((line) => line.key === expandedKey)
            : lines
          ).map((line, index) => {
            const counted = Number(line.countedQuantity);
            const variance = Number.isNaN(counted)
              ? 0
              : counted - line.systemQuantity;
            const item = clientItems.find((i) => i.id === line.itemId);
            const requiresCoa = item?.requires_coa ?? false;
            const lineIndex = lines.findIndex((l) => l.key === line.key);

            return (
              <Card key={line.key}>
                <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">
                    Line {lineIndex >= 0 ? lineIndex + 1 : index + 1}
                    {line.fromOnHand ? (
                      <Badge variant="secondary" className="ml-2">
                        Existing lot
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="ml-2">
                        New lot
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="flex gap-2">
                    {editing ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={saveExpandedLine}
                          disabled={pending}
                        >
                          {pending ? "Saving…" : "Save line"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={cancelEditLine}
                          disabled={pending}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeLine(line)}
                      disabled={pending}
                    >
                      Remove
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Item</Label>
                      {line.fromOnHand ? (
                        <p className="text-sm h-9 flex items-center">
                          {item?.name ?? "Item"}
                        </p>
                      ) : (
                        <select
                          className={SEL}
                          value={line.itemId}
                          onChange={(e) => onItemChange(line.key, e.target.value)}
                        >
                          <option className={OPT} value="">
                            Select item…
                          </option>
                          {clientItems.map((opt) => (
                            <option key={opt.id} className={OPT} value={opt.id}>
                              {opt.name}
                              {opt.item_code ? ` (${opt.item_code})` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Lot #</Label>
                      {line.fromOnHand ? (
                        <p className="text-sm h-9 flex items-center font-mono">
                          {line.lotNumber}
                        </p>
                      ) : (
                        <Input
                          value={line.lotNumber}
                          onChange={(e) =>
                            updateLine(line.key, { lotNumber: e.target.value })
                          }
                        />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>UOM</Label>
                      {line.fromOnHand ? (
                        <p className="text-sm h-9 flex items-center">
                          {line.unitOfMeasure}
                        </p>
                      ) : (
                        <Input
                          value={line.unitOfMeasure}
                          onChange={(e) =>
                            updateLine(line.key, {
                              unitOfMeasure: e.target.value,
                            })
                          }
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label>System qty</Label>
                      <p className="text-sm h-9 flex items-center tabular-nums text-muted-foreground">
                        {line.systemQuantity}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Counted qty</Label>
                      <Input
                        className="text-right"
                        value={line.countedQuantity}
                        onChange={(e) =>
                          updateLine(line.key, {
                            countedQuantity: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Variance</Label>
                      <p
                        className={`text-sm h-9 flex items-center tabular-nums ${
                          variance === 0
                            ? "text-muted-foreground"
                            : variance > 0
                              ? "text-emerald-700"
                              : "text-red-700"
                        }`}
                      >
                        {variance > 0 ? "+" : ""}
                        {Number.isNaN(counted) ? "—" : variance}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Date received</Label>
                      {line.fromOnHand ? (
                        <p className="text-sm h-9 flex items-center text-muted-foreground">
                          —
                        </p>
                      ) : (
                        <Input
                          type="date"
                          value={line.receivedAt}
                          onChange={(e) =>
                            updateLine(line.key, { receivedAt: e.target.value })
                          }
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label>Expiration date</Label>
                      <Input
                        type="date"
                        value={line.expirationDate}
                        onChange={(e) =>
                          updateLine(line.key, {
                            expirationDate: e.target.value,
                          })
                        }
                        disabled={line.fromOnHand}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Manufacture date</Label>
                      <Input
                        type="date"
                        value={line.manufactureDate}
                        onChange={(e) =>
                          updateLine(line.key, {
                            manufactureDate: e.target.value,
                          })
                        }
                        disabled={line.fromOnHand}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Notes</Label>
                      <Input
                        value={line.notes}
                        onChange={(e) =>
                          updateLine(line.key, { notes: e.target.value })
                        }
                        placeholder="Optional"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label>Location</Label>
                        {!line.fromOnHand ? (
                          <button
                            type="button"
                            className="text-xs text-blue-600 underline underline-offset-2"
                            onClick={() =>
                              updateLine(line.key, {
                                showNewLocation: !line.showNewLocation,
                                showNewSupplier: false,
                              })
                            }
                          >
                            {line.showNewLocation ? "Cancel" : "Add location"}
                          </button>
                        ) : null}
                      </div>
                      {line.fromOnHand ? (
                        <p className="text-sm h-9 flex items-center">
                          {locations.find((l) => l.id === line.locationId)?.label ??
                            "—"}
                        </p>
                      ) : (
                        <select
                          className={SEL}
                          value={line.locationId}
                          onChange={(e) =>
                            updateLine(line.key, {
                              locationId: e.target.value,
                              showNewLocation: false,
                            })
                          }
                        >
                          <option className={OPT} value="">
                            Select location…
                          </option>
                          {locations.map((loc) => (
                            <option key={loc.id} className={OPT} value={loc.id}>
                              {loc.label}
                              {loc.zone_name ? ` · ${loc.zone_name}` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                      {line.showNewLocation ? (
                        <div className="mt-2 rounded-md border p-3 space-y-2 bg-muted/30">
                          <div className="grid gap-2 sm:grid-cols-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Label</Label>
                              <Input
                                value={newLocationLabel}
                                onChange={(e) =>
                                  setNewLocationLabel(e.target.value)
                                }
                                placeholder="A-03-1"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Zone</Label>
                              <select
                                className={SEL}
                                value={newLocationZoneId}
                                onChange={(e) =>
                                  setNewLocationZoneId(e.target.value)
                                }
                              >
                                <option className={OPT} value="">
                                  Zone…
                                </option>
                                {zones.map((z) => (
                                  <option key={z.id} className={OPT} value={z.id}>
                                    {z.name} ({z.zone_type})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Type</Label>
                              <select
                                className={SEL}
                                value={newLocationType}
                                onChange={(e) =>
                                  setNewLocationType(
                                    e.target.value as (typeof LOCATION_TYPES)[number]["value"],
                                  )
                                }
                              >
                                {LOCATION_TYPES.map((t) => (
                                  <option key={t.value} className={OPT} value={t.value}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          {inlineCreateError && line.showNewLocation ? (
                            <p className="text-xs text-red-700" role="alert">
                              {inlineCreateError}
                            </p>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            disabled={creatingForLine === line.key}
                            onClick={() => handleCreateLocation(line.key)}
                          >
                            {creatingForLine === line.key
                              ? "Creating…"
                              : "Create location"}
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label>Supplier</Label>
                        {!line.fromOnHand ? (
                          <button
                            type="button"
                            className="text-xs text-blue-600 underline underline-offset-2"
                            onClick={() =>
                              updateLine(line.key, {
                                showNewSupplier: !line.showNewSupplier,
                                showNewLocation: false,
                              })
                            }
                          >
                            {line.showNewSupplier ? "Cancel" : "Add supplier"}
                          </button>
                        ) : null}
                      </div>
                      {line.fromOnHand ? (
                        <p className="text-sm h-9 flex items-center">
                          {suppliers.find((s) => s.id === line.supplierId)?.name ??
                            "—"}
                        </p>
                      ) : (
                        <select
                          className={SEL}
                          value={line.supplierId}
                          onChange={(e) =>
                            updateLine(line.key, {
                              supplierId: e.target.value,
                              showNewSupplier: false,
                            })
                          }
                        >
                          <option className={OPT} value="">
                            Optional…
                          </option>
                          {suppliers.map((s) => (
                            <option key={s.id} className={OPT} value={s.id}>
                              {s.name} ({s.code})
                            </option>
                          ))}
                        </select>
                      )}
                      {line.showNewSupplier ? (
                        <div className="mt-2 rounded-md border p-3 space-y-2 bg-muted/30">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Name</Label>
                              <Input
                                value={newSupplierName}
                                onChange={(e) =>
                                  setNewSupplierName(e.target.value)
                                }
                                placeholder="Supplier name"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Code (optional)</Label>
                              <Input
                                value={newSupplierCode}
                                onChange={(e) =>
                                  setNewSupplierCode(e.target.value)
                                }
                                placeholder="Auto from name"
                              />
                            </div>
                          </div>
                          {inlineCreateError && line.showNewSupplier ? (
                            <p className="text-xs text-red-700" role="alert">
                              {inlineCreateError}
                            </p>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            disabled={creatingForLine === line.key}
                            onClick={() => handleCreateSupplier(line.key)}
                          >
                            {creatingForLine === line.key
                              ? "Creating…"
                              : "Create supplier"}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {!line.fromOnHand ? (
                    <div
                      className={`rounded-md border border-dashed p-3 space-y-2 ${
                        requiresCoa
                          ? "border-amber-300 bg-amber-50"
                          : "border-input"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {requiresCoa ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                            COA recommended
                          </Badge>
                        ) : (
                          <Label className="text-xs">COA (optional)</Label>
                        )}
                      </div>
                      {line.coaFile || line.existingCoaFileName ? (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono truncate max-w-xs">
                            {line.coaFile?.name ?? line.existingCoaFileName}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateLine(line.key, {
                                coaFile: null,
                                existingCoaFileName: null,
                                existingCoaStoragePath: null,
                              })
                            }
                            className="text-muted-foreground hover:text-destructive"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3">
                          <Label className="cursor-pointer">
                            <span className="text-xs text-blue-600 underline underline-offset-2">
                              Upload COA (PDF or image)
                            </span>
                            <input
                              type="file"
                              className="sr-only"
                              accept=".pdf,image/png,image/jpeg,image/webp"
                              onChange={(e) =>
                                updateLine(line.key, {
                                  coaFile: e.target.files?.[0] ?? null,
                                })
                              }
                            />
                          </Label>
                          <GoogleDrivePickerButton
                            label="Google Drive"
                            size="sm"
                            variant="outline"
                            mimeTypes={[
                              "application/pdf",
                              "image/png",
                              "image/jpeg",
                              "image/webp",
                              "application/vnd.google-apps.document",
                            ].join(",")}
                            onFile={(file) =>
                              updateLine(line.key, { coaFile: file })
                            }
                          />
                        </div>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {lineMessage ? (
        <p className="text-sm text-emerald-700" role="status">
          {lineMessage}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" onClick={submit} disabled={pending || !clientId}>
          {pending
            ? "Saving…"
            : editing
              ? "Done — review & post"
              : "Save draft"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            router.push(
              draft
                ? `/dashboard/inventory/counts/${draft.id}`
                : "/dashboard/inventory/counts",
            )
          }
        >
          {editing ? "Back to review" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type CountReason = "opening_balance" | "audit" | "cycle_count";
export type LotStatus = "quarantine" | "released" | "on_hold" | "consumed" | "destroyed";

export type CountLineInput = {
  itemId: string;
  lotId: string | null;
  lotNumber: string;
  locationId: string;
  systemQuantity: number;
  countedQuantity: number;
  unitOfMeasure: string;
  lotStatus?: LotStatus;
  supplierId: string | null;
  manufactureDate: string | null;
  expirationDate: string | null;
  receivedAt: string | null;
  coaFileName: string | null;
  coaStoragePath: string | null;
  notes: string | null;
};

export type SupplierResult = { id: string; name: string; code: string };
export type LocationResult = {
  id: string;
  label: string;
  zone_name: string | null;
};

export type CsvPreviewRow = {
  rowNumber: number;
  clientCode: string;
  itemCode: string;
  itemName: string;
  lotNumber: string;
  quantity: number;
  unitOfMeasure: string;
  locationLabel: string;
  lotStatus: LotStatus;
  supplierCode: string | null;
  manufactureDate: string | null;
  expirationDate: string | null;
  notes: string | null;
  itemId?: string;
  locationId?: string;
  supplierId?: string | null;
  clientId?: string;
  error?: string;
};

export type ActionResult =
  | { success: true; countId: string }
  | { success: false; error: string };

const LOT_STATUSES: LotStatus[] = [
  "quarantine",
  "released",
  "on_hold",
  "consumed",
  "destroyed",
];

function revalidateCountPaths(clientId?: string) {
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/summary");
  revalidatePath("/dashboard/inventory/counts");
  revalidatePath("/dashboard/lots");
  revalidatePath("/dashboard/needs-attention");
  if (clientId) {
    revalidatePath(`/dashboard/clients/${clientId}`);
  }
}

export async function createInventoryCount(data: {
  clientId: string;
  countDate: string;
  reason: CountReason;
  notes: string | null;
  lines: CountLineInput[];
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  if (!data.clientId) return { success: false, error: "Client is required" };
  if (!data.lines.length) {
    return { success: false, error: "Add at least one count line" };
  }

  for (const line of data.lines) {
    if (!line.itemId || !line.lotNumber.trim() || !line.locationId) {
      return {
        success: false,
        error: "Each line needs an item, lot number, and location",
      };
    }
    if (line.countedQuantity < 0 || Number.isNaN(line.countedQuantity)) {
      return { success: false, error: `Invalid counted quantity for ${line.lotNumber}` };
    }
    if (!line.lotId && line.countedQuantity <= 0) {
      return {
        success: false,
        error: `New lot ${line.lotNumber} must have counted quantity > 0`,
      };
    }
  }

  const { data: count, error: countError } = await supabase
    .from("inventory_counts")
    .insert({
      client_id: data.clientId,
      count_date: data.countDate,
      reason: data.reason,
      status: "draft",
      notes: data.notes,
      performed_by: user.id,
    })
    .select("id")
    .single();

  if (countError || !count) {
    return { success: false, error: countError?.message ?? "Failed to create count" };
  }

  const { error: linesError } = await supabase.from("inventory_count_lines").insert(
    data.lines.map((line) => ({
      inventory_count_id: count.id,
      item_id: line.itemId,
      lot_id: line.lotId,
      lot_number: line.lotNumber.trim(),
      location_id: line.locationId,
      system_quantity: line.systemQuantity,
      counted_quantity: line.countedQuantity,
      unit_of_measure: line.unitOfMeasure.trim(),
      lot_status: line.lotStatus ?? "released",
      supplier_id: line.supplierId,
      manufacture_date: line.manufactureDate,
      expiration_date: line.expirationDate,
      received_at: line.receivedAt
        ? new Date(line.receivedAt).toISOString()
        : null,
      coa_file_name: line.coaFileName,
      coa_storage_path: line.coaStoragePath,
      notes: line.notes,
    })),
  );

  if (linesError) {
    await supabase.from("inventory_counts").delete().eq("id", count.id);
    return { success: false, error: linesError.message };
  }

  revalidatePath("/dashboard/inventory/counts");
  return { success: true, countId: count.id };
}

export async function updateInventoryCount(data: {
  countId: string;
  countDate: string;
  reason: CountReason;
  notes: string | null;
  lines: CountLineInput[];
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: count } = await supabase
    .from("inventory_counts")
    .select("id, status, client_id")
    .eq("id", data.countId)
    .single();

  if (!count) return { success: false, error: "Count not found" };
  if (count.status !== "draft") {
    return { success: false, error: "Only draft counts can be edited" };
  }
  if (!data.lines.length) {
    return { success: false, error: "Add at least one count line" };
  }

  for (const line of data.lines) {
    if (!line.itemId || !line.lotNumber.trim() || !line.locationId) {
      return {
        success: false,
        error: "Each line needs an item, lot number, and location",
      };
    }
    if (line.countedQuantity < 0 || Number.isNaN(line.countedQuantity)) {
      return { success: false, error: `Invalid counted quantity for ${line.lotNumber}` };
    }
    if (!line.lotId && line.countedQuantity <= 0) {
      return {
        success: false,
        error: `New lot ${line.lotNumber} must have counted quantity > 0`,
      };
    }
  }

  const { error: headerError } = await supabase
    .from("inventory_counts")
    .update({
      count_date: data.countDate,
      reason: data.reason,
      notes: data.notes,
      performed_by: user.id,
    })
    .eq("id", data.countId)
    .eq("status", "draft");

  if (headerError) return { success: false, error: headerError.message };

  const { error: deleteError } = await supabase
    .from("inventory_count_lines")
    .delete()
    .eq("inventory_count_id", data.countId);

  if (deleteError) return { success: false, error: deleteError.message };

  const { error: linesError } = await supabase.from("inventory_count_lines").insert(
    data.lines.map((line) => ({
      inventory_count_id: data.countId,
      item_id: line.itemId,
      lot_id: line.lotId,
      lot_number: line.lotNumber.trim(),
      location_id: line.locationId,
      system_quantity: line.systemQuantity,
      counted_quantity: line.countedQuantity,
      unit_of_measure: line.unitOfMeasure.trim(),
      lot_status: line.lotStatus ?? "released",
      supplier_id: line.supplierId,
      manufacture_date: line.manufactureDate,
      expiration_date: line.expirationDate,
      received_at: line.receivedAt
        ? new Date(line.receivedAt).toISOString()
        : null,
      coa_file_name: line.coaFileName,
      coa_storage_path: line.coaStoragePath,
      notes: line.notes,
    })),
  );

  if (linesError) return { success: false, error: linesError.message };

  revalidatePath("/dashboard/inventory/counts");
  revalidatePath(`/dashboard/inventory/counts/${data.countId}`);
  revalidatePath(`/dashboard/inventory/counts/${data.countId}/edit`);
  return { success: true, countId: data.countId };
}

export async function updateInventoryCountHeader(data: {
  countId: string;
  countDate: string;
  reason: CountReason;
  notes: string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: count } = await supabase
    .from("inventory_counts")
    .select("id, status")
    .eq("id", data.countId)
    .single();

  if (!count) return { success: false, error: "Count not found" };
  if (count.status !== "draft") {
    return { success: false, error: "Only draft counts can be edited" };
  }

  const { error } = await supabase
    .from("inventory_counts")
    .update({
      count_date: data.countDate,
      reason: data.reason,
      notes: data.notes,
      performed_by: user.id,
    })
    .eq("id", data.countId)
    .eq("status", "draft");

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/inventory/counts");
  revalidatePath(`/dashboard/inventory/counts/${data.countId}`);
  revalidatePath(`/dashboard/inventory/counts/${data.countId}/edit`);
  return { success: true };
}

export async function saveInventoryCountLine(data: {
  countId: string;
  lineId: string | null;
  line: CountLineInput;
}): Promise<
  | { success: true; lineId: string }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: count } = await supabase
    .from("inventory_counts")
    .select("id, status")
    .eq("id", data.countId)
    .single();

  if (!count) return { success: false, error: "Count not found" };
  if (count.status !== "draft") {
    return { success: false, error: "Only draft counts can be edited" };
  }

  const line = data.line;
  if (!line.itemId || !line.lotNumber.trim() || !line.locationId) {
    return {
      success: false,
      error: "Each line needs an item, lot number, and location",
    };
  }
  if (line.countedQuantity < 0 || Number.isNaN(line.countedQuantity)) {
    return { success: false, error: `Invalid counted quantity for ${line.lotNumber}` };
  }
  if (!line.lotId && line.countedQuantity <= 0) {
    return {
      success: false,
      error: `New lot ${line.lotNumber} must have counted quantity > 0`,
    };
  }

  const row = {
    inventory_count_id: data.countId,
    item_id: line.itemId,
    lot_id: line.lotId,
    lot_number: line.lotNumber.trim(),
    location_id: line.locationId,
    system_quantity: line.systemQuantity,
    counted_quantity: line.countedQuantity,
    unit_of_measure: line.unitOfMeasure.trim(),
    lot_status: line.lotStatus ?? "released",
    supplier_id: line.supplierId,
    manufacture_date: line.manufactureDate,
    expiration_date: line.expirationDate,
    received_at: line.receivedAt
      ? new Date(line.receivedAt).toISOString()
      : null,
    coa_file_name: line.coaFileName,
    coa_storage_path: line.coaStoragePath,
    notes: line.notes,
  };

  if (data.lineId) {
    const { error } = await supabase
      .from("inventory_count_lines")
      .update(row)
      .eq("id", data.lineId)
      .eq("inventory_count_id", data.countId);
    if (error) return { success: false, error: error.message };

    revalidatePath(`/dashboard/inventory/counts/${data.countId}`);
    revalidatePath(`/dashboard/inventory/counts/${data.countId}/edit`);
    return { success: true, lineId: data.lineId };
  }

  const { data: inserted, error } = await supabase
    .from("inventory_count_lines")
    .insert(row)
    .select("id")
    .single();

  if (error || !inserted) {
    return { success: false, error: error?.message ?? "Failed to save line" };
  }

  revalidatePath(`/dashboard/inventory/counts/${data.countId}`);
  revalidatePath(`/dashboard/inventory/counts/${data.countId}/edit`);
  return { success: true, lineId: inserted.id };
}

export async function deleteInventoryCountLine(data: {
  countId: string;
  lineId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: count } = await supabase
    .from("inventory_counts")
    .select("id, status")
    .eq("id", data.countId)
    .single();

  if (!count) return { success: false, error: "Count not found" };
  if (count.status !== "draft") {
    return { success: false, error: "Only draft counts can be edited" };
  }

  const { error } = await supabase
    .from("inventory_count_lines")
    .delete()
    .eq("id", data.lineId)
    .eq("inventory_count_id", data.countId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/dashboard/inventory/counts/${data.countId}`);
  revalidatePath(`/dashboard/inventory/counts/${data.countId}/edit`);
  return { success: true };
}

export async function updateCountLineQuantities(
  countId: string,
  updates: Array<{ lineId: string; countedQuantity: number }>,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: count } = await supabase
    .from("inventory_counts")
    .select("id, status")
    .eq("id", countId)
    .single();

  if (!count) return { success: false, error: "Count not found" };
  if (count.status !== "draft") {
    return { success: false, error: "Only draft counts can be edited" };
  }

  for (const update of updates) {
    if (update.countedQuantity < 0 || Number.isNaN(update.countedQuantity)) {
      return { success: false, error: "Counted quantity must be >= 0" };
    }
    const { error } = await supabase
      .from("inventory_count_lines")
      .update({ counted_quantity: update.countedQuantity })
      .eq("id", update.lineId)
      .eq("inventory_count_id", countId);
    if (error) return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/inventory/counts/${countId}`);
  return { success: true };
}

export async function postInventoryCount(
  countId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: count } = await supabase
    .from("inventory_counts")
    .select("id, client_id, status")
    .eq("id", countId)
    .single();

  if (!count) return { success: false, error: "Count not found" };
  if (count.status !== "draft") {
    return { success: false, error: `Count is ${count.status}, expected draft` };
  }

  const { error } = await supabase.rpc("post_inventory_count", {
    p_count_id: countId,
  });

  if (error) return { success: false, error: error.message };

  revalidateCountPaths(count.client_id);
  revalidatePath(`/dashboard/inventory/counts/${countId}`);
  return { success: true };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      current.push(field.trim());
      field = "";
    } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
      current.push(field.trim());
      field = "";
      if (current.some((c) => c.length > 0)) rows.push(current);
      current = [];
      if (ch === "\r") i++;
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  current.push(field.trim());
  if (current.some((c) => c.length > 0)) rows.push(current);
  return rows;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseLotStatus(value: string | undefined): LotStatus {
  const v = (value ?? "released").trim().toLowerCase() as LotStatus;
  return LOT_STATUSES.includes(v) ? v : "released";
}

export async function previewCsvImport(
  csvText: string,
  clientIdFilter?: string | null,
): Promise<
  | { success: true; rows: CsvPreviewRow[]; clientId: string | null }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const table = parseCsv(csvText.replace(/^\uFEFF/, ""));
  if (table.length < 2) {
    return { success: false, error: "CSV must include a header row and at least one data row" };
  }

  const headers = table[0].map(normalizeHeader);
  const required = [
    "client_code",
    "lot_number",
    "quantity",
    "unit_of_measure",
    "location_label",
  ];
  for (const col of required) {
    if (!headers.includes(col)) {
      return { success: false, error: `Missing required column: ${col}` };
    }
  }
  if (!headers.includes("item_code") && !headers.includes("item_name")) {
    return { success: false, error: "CSV needs item_code or item_name" };
  }

  const idx = (name: string) => headers.indexOf(name);
  const get = (row: string[], name: string) => {
    const i = idx(name);
    return i >= 0 ? (row[i] ?? "").trim() : "";
  };

  const [{ data: clients }, { data: items }, { data: locations }, { data: suppliers }] =
    await Promise.all([
      supabase.from("clients").select("id, code, name").eq("active", true),
      supabase
        .from("items")
        .select("id, client_id, item_code, name, unit_of_measure"),
      supabase.from("locations").select("id, label").eq("active", true),
      supabase.from("suppliers").select("id, code").eq("active", true),
    ]);

  const clientByCode = new Map(
    (clients ?? []).map((c) => [c.code.toLowerCase(), c]),
  );
  const locationByLabel = new Map(
    (locations ?? []).map((l) => [l.label.toLowerCase(), l]),
  );
  const supplierByCode = new Map(
    (suppliers ?? []).map((s) => [s.code.toLowerCase(), s]),
  );

  const preview: CsvPreviewRow[] = [];
  let resolvedClientId: string | null = clientIdFilter ?? null;

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const clientCode = get(row, "client_code");
    const itemCode = get(row, "item_code");
    const itemName = get(row, "item_name");
    const lotNumber = get(row, "lot_number");
    const quantityRaw = get(row, "quantity");
    const unitOfMeasure = get(row, "unit_of_measure");
    const locationLabel = get(row, "location_label");
    const lotStatus = parseLotStatus(get(row, "lot_status"));
    const supplierCode = get(row, "supplier_code") || null;
    const manufactureDate = get(row, "manufacture_date") || null;
    const expirationDate = get(row, "expiration_date") || null;
    const notes = get(row, "notes") || null;

    const previewRow: CsvPreviewRow = {
      rowNumber: r + 1,
      clientCode,
      itemCode,
      itemName,
      lotNumber,
      quantity: Number(quantityRaw),
      unitOfMeasure,
      locationLabel,
      lotStatus,
      supplierCode,
      manufactureDate,
      expirationDate,
      notes,
    };

    const client = clientByCode.get(clientCode.toLowerCase());
    if (!client) {
      previewRow.error = `Unknown client_code "${clientCode}"`;
      preview.push(previewRow);
      continue;
    }

    if (clientIdFilter && client.id !== clientIdFilter) {
      continue;
    }

    if (resolvedClientId && resolvedClientId !== client.id) {
      previewRow.error = "CSV contains more than one client; import one client at a time";
      preview.push(previewRow);
      continue;
    }
    resolvedClientId = client.id;
    previewRow.clientId = client.id;

    if (!lotNumber) {
      previewRow.error = "lot_number is required";
      preview.push(previewRow);
      continue;
    }

    const quantity = Number(quantityRaw);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      previewRow.error = "quantity must be a number > 0";
      preview.push(previewRow);
      continue;
    }
    previewRow.quantity = quantity;

    if (!unitOfMeasure) {
      previewRow.error = "unit_of_measure is required";
      preview.push(previewRow);
      continue;
    }

    const location = locationByLabel.get(locationLabel.toLowerCase());
    if (!location) {
      previewRow.error = `Unknown location_label "${locationLabel}"`;
      preview.push(previewRow);
      continue;
    }
    previewRow.locationId = location.id;

    const clientItems = (items ?? []).filter((i) => i.client_id === client.id);
    let item =
      itemCode.length > 0
        ? clientItems.find(
            (i) => (i.item_code ?? "").toLowerCase() === itemCode.toLowerCase(),
          )
        : undefined;
    if (!item && itemName) {
      item = clientItems.find(
        (i) => i.name.toLowerCase() === itemName.toLowerCase(),
      );
    }
    if (!item) {
      previewRow.error = itemCode
        ? `Unknown item_code "${itemCode}" for client`
        : `Unknown item_name "${itemName}" for client`;
      preview.push(previewRow);
      continue;
    }
    previewRow.itemId = item.id;
    if (!previewRow.itemName) previewRow.itemName = item.name;
    if (!previewRow.itemCode) previewRow.itemCode = item.item_code ?? "";

    if (supplierCode) {
      const supplier = supplierByCode.get(supplierCode.toLowerCase());
      if (!supplier) {
        previewRow.error = `Unknown supplier_code "${supplierCode}"`;
        preview.push(previewRow);
        continue;
      }
      previewRow.supplierId = supplier.id;
    } else {
      previewRow.supplierId = null;
    }

    preview.push(previewRow);
  }

  if (!preview.length) {
    return {
      success: false,
      error: clientIdFilter
        ? "No CSV rows matched the selected client"
        : "No data rows found in CSV",
    };
  }

  const lotKeys = new Set<string>();
  for (const row of preview) {
    if (row.error) continue;
    const key = `${row.lotNumber.toLowerCase()}::${row.locationLabel.toLowerCase()}`;
    if (lotKeys.has(key)) {
      row.error = `Duplicate lot_number + location_label in CSV (${row.lotNumber} @ ${row.locationLabel})`;
    } else {
      lotKeys.add(key);
    }
  }

  const lotNumbers = preview
    .filter((r) => !r.error)
    .map((r) => r.lotNumber);
  if (lotNumbers.length) {
    const { data: existingLots } = await supabase
      .from("lots")
      .select("lot_number")
      .in("lot_number", lotNumbers);
    const existing = new Set((existingLots ?? []).map((l) => l.lot_number));
    for (const row of preview) {
      if (!row.error && existing.has(row.lotNumber)) {
        row.error = `Lot number "${row.lotNumber}" already exists in the database`;
      }
    }
  }

  return { success: true, rows: preview, clientId: resolvedClientId };
}

export async function importCsvAsOpeningBalance(data: {
  clientId: string;
  countDate: string;
  notes: string | null;
  rows: CsvPreviewRow[];
}): Promise<ActionResult> {
  const valid = data.rows.filter((r) => !r.error);
  if (!valid.length) {
    return { success: false, error: "No valid rows to import" };
  }
  if (valid.some((r) => !r.itemId || !r.locationId || r.clientId !== data.clientId)) {
    return {
      success: false,
      error: "Preview is stale or incomplete — re-run CSV preview",
    };
  }

  return createInventoryCount({
    clientId: data.clientId,
    countDate: data.countDate,
    reason: "opening_balance",
    notes: data.notes,
    lines: valid.map((row) => ({
      itemId: row.itemId!,
      lotId: null,
      lotNumber: row.lotNumber,
      locationId: row.locationId!,
      systemQuantity: 0,
      countedQuantity: row.quantity,
      unitOfMeasure: row.unitOfMeasure,
      lotStatus: row.lotStatus,
      supplierId: row.supplierId ?? null,
      manufactureDate: row.manufactureDate,
      expirationDate: row.expirationDate,
      receivedAt: null,
      coaFileName: null,
      coaStoragePath: null,
      notes: row.notes,
    })),
  });
}

function supplierCodeFromName(name: string): string {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return base || `SUP-${Date.now().toString(36).toUpperCase()}`;
}

export async function createSupplier(data: {
  name: string;
  code?: string | null;
}): Promise<SupplierResult | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const name = data.name.trim();
  if (!name) return { error: "Supplier name is required" };

  let code = (data.code ?? "").trim().toUpperCase() || supplierCodeFromName(name);

  for (let attempt = 0; attempt < 5; attempt++) {
    const tryCode = attempt === 0 ? code : `${code.slice(0, 20)}-${attempt + 1}`;
    const { data: supplier, error } = await supabase
      .from("suppliers")
      .insert({ name, code: tryCode, active: true })
      .select("id, name, code")
      .single();

    if (!error && supplier) {
      revalidatePath("/dashboard/inventory/counts/new");
      revalidatePath("/dashboard/receiving/new");
      return supplier as SupplierResult;
    }
    if (error?.code !== "23505") {
      return { error: error?.message ?? "Failed to create supplier" };
    }
  }

  return { error: "Supplier code already exists — try a different code" };
}

export async function createLocation(data: {
  label: string;
  zoneId: string;
  locationType: "rack" | "floor" | "staging" | "dock";
}): Promise<LocationResult | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const label = data.label.trim();
  if (!label) return { error: "Location label is required" };
  if (!data.zoneId) return { error: "Zone is required" };

  const { data: location, error } = await supabase
    .from("locations")
    .insert({
      label,
      zone_id: data.zoneId,
      location_type: data.locationType,
      active: true,
    })
    .select("id, label, warehouse_zones ( name )")
    .single();

  if (error || !location) {
    return { error: error?.message ?? "Failed to create location" };
  }

  const zone = location.warehouse_zones as
    | { name: string }
    | { name: string }[]
    | null;
  const zoneName = Array.isArray(zone) ? zone[0]?.name : zone?.name;

  revalidatePath("/dashboard/inventory/counts/new");
  return {
    id: location.id as string,
    label: location.label as string,
    zone_name: zoneName ?? null,
  };
}

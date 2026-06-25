"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// BOL extraction
// ---------------------------------------------------------------------------

export type ExtractedBolData = {
  carrierName?: string;
  supplierName?: string;
  lots?: Array<{
    itemDescription?: string;
    lotNumber?: string;
    quantity?: number;
    unitOfMeasure?: string;
    manufactureDate?: string;
    expirationDate?: string;
  }>;
};

export type BolExtractionResult =
  | { ok: true; data: ExtractedBolData }
  | { ok: false; reason: "no_api_key" | "api_error" | "no_data"; message: string };

export async function extractFromBol(
  formData: FormData
): Promise<BolExtractionResult> {
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, reason: "no_data", message: "No file provided." };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: "no_api_key",
      message: "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.",
    };
  }

  try {
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const client = new Anthropic({ apiKey });

    const prompt = `Extract shipping information from this Bill of Lading. Return only a JSON object — no explanation, no markdown:
{
  "carrierName": "freight carrier company name",
  "supplierName": "shipper/consignor company name",
  "lots": [
    {
      "itemDescription": "product/commodity description",
      "lotNumber": "lot or batch number if present",
      "quantity": 100,
      "unitOfMeasure": "lbs/kg/each/cases/etc",
      "manufactureDate": "YYYY-MM-DD or omit",
      "expirationDate": "YYYY-MM-DD or omit"
    }
  ]
}
Omit any field you cannot clearly identify.`;

    const isPdf = file.type === "application/pdf";

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: isPdf
            ? [
                {
                  type: "document" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "application/pdf" as const,
                    data: base64,
                  },
                },
                { type: "text" as const, text: prompt },
              ]
            : [
                {
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: file.type as
                      | "image/png"
                      | "image/jpeg"
                      | "image/gif"
                      | "image/webp",
                    data: base64,
                  },
                },
                { type: "text" as const, text: prompt },
              ],
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return {
        ok: false,
        reason: "no_data",
        message: "BOL was read but no structured data could be extracted — fill in the fields manually.",
      };
    }

    return { ok: true, data: JSON.parse(match[0]) as ExtractedBolData };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[extractFromBol]", msg);
    return { ok: false, reason: "api_error", message: `API error: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Receipt submission
// ---------------------------------------------------------------------------

export type ReceivingLotInput = {
  itemId: string;
  lotNumber: string;
  quantity: number;
  unitOfMeasure: string;
  manufactureDate: string | null;
  expirationDate: string | null;
  poNumber: string | null;
  notes: string | null;
  coaFileName: string | null;
  coaStoragePath: string | null;
};

export async function submitReceiving(data: {
  clientId: string;
  supplierId: string | null;
  receivedAt: string;
  carrierName: string | null;
  tplId: string | null;
  bolFileName: string | null;
  bolStoragePath: string | null;
  lots: ReceivingLotInput[];
}): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  try {
    // Find a quarantine location — required by the DB check constraint on receive transactions
    const { data: quarantineZone } = await supabase
      .from("warehouse_zones")
      .select("id")
      .eq("zone_type", "quarantine")
      .limit(1)
      .single();

    if (!quarantineZone) {
      return {
        success: false,
        error: "No quarantine zone found. Set one up before receiving goods.",
      };
    }

    const { data: quarantineLocation } = await supabase
      .from("locations")
      .select("id")
      .eq("zone_id", quarantineZone.id)
      .limit(1)
      .single();

    if (!quarantineLocation) {
      return {
        success: false,
        error:
          "No locations found in the quarantine zone. Add at least one first.",
      };
    }

    const receivedAtTs = new Date(data.receivedAt).toISOString();

    // Create BOL document
    let bolDocId: string | null = null;
    if (data.bolStoragePath && data.bolFileName) {
      const { data: bolDoc, error: bolError } = await supabase
        .from("documents")
        .insert({
          client_id: data.clientId,
          document_type: "bol",
          file_name: data.bolFileName,
          storage_path: data.bolStoragePath,
          uploaded_by: user.id,
          third_party_logistics_id: data.tplId ?? null,
          carrier_name: data.carrierName ?? null,
        })
        .select("id")
        .single();

      if (bolError) throw new Error(bolError.message);
      bolDocId = bolDoc.id;
    }

    const lotIds: string[] = [];

    for (const lot of data.lots) {
      const { data: createdLot, error: lotError } = await supabase
        .from("lots")
        .insert({
          item_id: lot.itemId,
          client_id: data.clientId,
          supplier_id: data.supplierId ?? null,
          lot_number: lot.lotNumber,
          received_quantity: lot.quantity,
          unit_of_measure: lot.unitOfMeasure,
          manufacture_date: lot.manufactureDate ?? null,
          expiration_date: lot.expirationDate ?? null,
          received_at: receivedAtTs,
          received_by: user.id,
          po_number: lot.poNumber ?? null,
          status: "quarantine",
          notes: lot.notes ?? null,
        })
        .select("id")
        .single();

      if (lotError) throw new Error(lotError.message);
      lotIds.push(createdLot.id);

      await supabase.from("lot_status_history").insert({
        lot_id: createdLot.id,
        from_status: null,
        to_status: "quarantine",
        changed_by: user.id,
        reason: "Received",
        changed_at: receivedAtTs,
      });

      await supabase.from("inventory_transactions").insert({
        transaction_type: "receive",
        lot_id: createdLot.id,
        from_location_id: null,
        to_location_id: quarantineLocation.id,
        quantity: lot.quantity,
        unit_of_measure: lot.unitOfMeasure,
        performed_by: user.id,
        performed_at: receivedAtTs,
        notes: "Received",
      });

      if (lot.coaStoragePath && lot.coaFileName) {
        const { error: coaError } = await supabase.from("documents").insert({
          client_id: data.clientId,
          document_type: "coa",
          file_name: lot.coaFileName,
          storage_path: lot.coaStoragePath,
          uploaded_by: user.id,
          lot_id: createdLot.id,
        });
        if (coaError) throw new Error(coaError.message);
      }
    }

    if (bolDocId && lotIds.length > 0) {
      const { error: linkError } = await supabase.from("document_lots").insert(
        lotIds.map((lotId) => ({ document_id: bolDocId!, lot_id: lotId }))
      );
      if (linkError) throw new Error(linkError.message);
    }

    revalidatePath("/dashboard/receiving");
    revalidatePath("/dashboard/lots");
    revalidatePath("/dashboard/needs-attention");
    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/summary");

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

// ---------------------------------------------------------------------------
// Inline item creation
// ---------------------------------------------------------------------------

export type NewItemResult = {
  id: string;
  name: string;
  item_type: string;
  unit_of_measure: string;
  requires_coa: boolean;
  shelf_life_days: number | null;
  client_id: string | null;
  supplier_id: string | null;
};

export async function createItem(data: {
  clientId: string;
  supplierId: string | null;
  name: string;
  itemType: "raw_ingredient" | "packaging" | "wip" | "finished_good";
  unitOfMeasure: string;
  requiresCoa: boolean;
  shelfLifeDays: number | null;
}): Promise<NewItemResult | { error: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: item, error } = await supabase
    .from("items")
    .insert({
      client_id: data.clientId || null,
      supplier_id: data.supplierId || null,
      name: data.name.trim(),
      item_type: data.itemType,
      unit_of_measure: data.unitOfMeasure.trim(),
      requires_coa: data.requiresCoa,
      shelf_life_days: data.shelfLifeDays,
    })
    .select("id, name, item_type, unit_of_measure, requires_coa, shelf_life_days, client_id, supplier_id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/dashboard/receiving/new");
  return item as NewItemResult;
}

"use server";

import Anthropic from "@anthropic-ai/sdk";
import { normalizeSheetUnit } from "@/lib/formula-batching";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Formula sheet PDF extraction
// ---------------------------------------------------------------------------

export type ExtractedFormulaLine = {
  itemDescription?: string;
  lineType?: "ingredient" | "packaging";
  quantity?: number;
  unitOfMeasure?: string;
  quantityBasis?: "per_batch" | "per_can" | "percentage";
  /** Target Weight/Volume numeric value from the sheet when present. */
  targetWeight?: number;
  /** Unit for targetWeight from the sheet Units column (lbs, g, kg, …). */
  targetUnit?: string;
  /** @deprecated Prefer targetWeight + targetUnit. Kept for older model output. */
  targetWeightLbs?: number;
};

export type ExtractedFormulaSpec = {
  name?: string;
  targetValue?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  unit?: string | null;
  notes?: string | null;
};

export type ExtractedFormulaData = {
  formulaNumber?: string;
  name?: string;
  baseQuantity?: number;
  baseUnitOfMeasure?: string;
  batchingInstructions?: string;
  /** Product density from the sheet (Target Weight uses this, typically 8.4). */
  densityLbsPerGallon?: number;
  /** Water density reference from the sheet (volume conversion; typically 8.345). */
  waterLbsPerGallon?: number;
  lines?: ExtractedFormulaLine[];
  specs?: ExtractedFormulaSpec[];
};

const DEFAULT_SHEET_DENSITY_LBS_PER_GALLON = 8.4;

/**
 * Sheets print rounded % (87.88%) but Target Weight/Volume is authoritative
 * (11073.65 lbs or 3175.2 g). When target weights exist, store them as
 * per_batch in the sheet's Units column so Required Qty can scale exactly.
 *
 * Fallback: if only % is present, keep percentage basis (density converts later).
 */
function refineExtractedLines(data: ExtractedFormulaData): ExtractedFormulaData {
  const density =
    data.densityLbsPerGallon != null && data.densityLbsPerGallon > 0
      ? data.densityLbsPerGallon
      : DEFAULT_SHEET_DENSITY_LBS_PER_GALLON;

  if (!data.lines?.length) {
    return { ...data, densityLbsPerGallon: data.densityLbsPerGallon ?? density };
  }

  const lines = data.lines.map((line) => {
    const targetRaw = line.targetWeight ?? line.targetWeightLbs;
    if (targetRaw == null || !Number.isFinite(targetRaw) || targetRaw <= 0) {
      return {
        ...line,
        unitOfMeasure:
          normalizeSheetUnit(line.unitOfMeasure) ?? line.unitOfMeasure,
      };
    }

    const unit =
      normalizeSheetUnit(line.targetUnit) ??
      normalizeSheetUnit(line.unitOfMeasure) ??
      "lbs";
    // Target Weight/Volume is never a percent — ignore % as the weight unit.
    const targetUnit = unit === "%" ? "lbs" : unit;

    return {
      ...line,
      quantity: targetRaw,
      unitOfMeasure: targetUnit,
      targetUnit,
      targetWeight: targetRaw,
      quantityBasis: "per_batch" as const,
    };
  });

  return {
    ...data,
    densityLbsPerGallon: density,
    lines,
  };
}

export type FormulaExtractionResult =
  | { ok: true; data: ExtractedFormulaData }
  | { ok: false; reason: "no_api_key" | "api_error" | "no_data"; message: string };

export async function extractFromFormulaPdf(
  formData: FormData
): Promise<FormulaExtractionResult> {
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, reason: "no_data", message: "No file provided." };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: "no_api_key",
      message:
        "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.",
    };
  }

  try {
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const client = new Anthropic({ apiKey });

    const prompt = `Extract formula / batching information from this Quantum Canning batching data sheet (or similar formula document). Return only a JSON object — no explanation, no markdown:
{
  "formulaNumber": "product code like Q0XXX if present",
  "name": "product / formula name",
  "baseQuantity": 1500,
  "baseUnitOfMeasure": "gallons",
  "densityLbsPerGallon": 8.4,
  "waterLbsPerGallon": 8.345,
  "batchingInstructions": "full batching instructions text if present",
  "lines": [
    {
      "itemDescription": "Filtered Water",
      "lineType": "ingredient",
      "quantity": 91.46,
      "unitOfMeasure": "%",
      "quantityBasis": "percentage",
      "targetWeight": 4579.57741,
      "targetUnit": "lbs"
    },
    {
      "itemDescription": "Gentian",
      "lineType": "ingredient",
      "quantity": 0.1398,
      "unitOfMeasure": "%",
      "quantityBasis": "percentage",
      "targetWeight": 3175.201908,
      "targetUnit": "g"
    }
  ],
  "specs": [
    {
      "name": "pH",
      "targetValue": null,
      "minValue": 2.5,
      "maxValue": 2.6,
      "unit": null,
      "notes": null
    }
  ]
}

Rules:
- Prefer percentage rows when the sheet lists ingredient %; set quantityBasis to "percentage", unitOfMeasure to "%", and quantity to the numeric percent in 0–100 form (91.46 not 0.9146). If the sheet cell is already a percent fraction under 1 for a major ingredient like water (~0.87–0.95), multiply by 100.
- Also extract the Target Weight/Volume column into targetWeight when present (even if a % is shown). Keep full precision from that column (e.g. 11073.65, 3175.201908).
- CRITICAL: Extract the Units column for each line into targetUnit. Sheets mix units — commonly "lbs" for water/sugar/acid and "g" for flavors/actives. Do NOT convert grams to pounds. Do NOT default every line to lbs.
- Extract density (lbs/gal) into densityLbsPerGallon and Water (lbs/gal) into waterLbsPerGallon when shown. Density is often 8.4 but may be 8.345 (same as water) on some sheets.
- If only weight/volume per batch is available (no %), use quantityBasis "per_batch" with that quantity and its unit from the Units column (lbs or g).
- Skip total/100% summary rows and blank rows.
- lineType is usually "ingredient"; use "packaging" only for packaging materials (cans, lids/ends, trays). Packaging lines are saved to the SKU packaging BOM, not formula lines.
- Parse specs like "2.50-2.60" into minValue/maxValue, and "11.8+/-0.2" into targetValue 11.8 with min/max 11.6/12.0.
- Normalize units to lowercase common forms (gallons, lbs, g, kg, oz, %).
- Omit any field you cannot clearly identify.`;

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
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
                    media_type: (file.type || "image/png") as
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
        message:
          "Document was read but no structured data could be extracted — fill in the fields manually.",
      };
    }

    try {
      const parsed = JSON.parse(match[0]) as ExtractedFormulaData;
      return { ok: true, data: refineExtractedLines(parsed) };
    } catch {
      return {
        ok: false,
        reason: "no_data",
        message:
          "Document was read but the extracted response was not valid JSON — fill in the fields manually.",
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[extractFromFormulaPdf]", msg);
    return { ok: false, reason: "api_error", message: `API error: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Inline client creation
// ---------------------------------------------------------------------------

export type NewClientResult = { id: string; name: string; code: string };

export async function createClientRecord(data: {
  name: string;
  code: string;
}): Promise<NewClientResult | { error: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: client, error } = await supabase
    .from("clients")
    .insert({ name: data.name.trim(), code: data.code.trim() })
    .select("id, name, code")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/dashboard/formulas/new");
  revalidatePath("/dashboard/clients");
  return client as NewClientResult;
}

// ---------------------------------------------------------------------------
// Inline SKU creation
// ---------------------------------------------------------------------------

export type NewSkuResult = {
  id: string;
  client_id: string;
  code: string;
  name: string;
  shelf_life_days: number | null;
};

export async function createSkuRecord(data: {
  clientId: string;
  code: string;
  name: string;
  shelfLifeDays: number | null;
}): Promise<NewSkuResult | { error: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // sku_packaging row is created by DB trigger skus_ensure_packaging
  const { data: sku, error } = await supabase
    .from("skus")
    .insert({
      client_id: data.clientId,
      code: data.code.trim(),
      name: data.name.trim(),
      shelf_life_days: data.shelfLifeDays,
    })
    .select("id, client_id, code, name, shelf_life_days")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/dashboard/formulas/new");
  revalidatePath("/dashboard/clients");
  return sku as NewSkuResult;
}

// ---------------------------------------------------------------------------
// Formula creation
// ---------------------------------------------------------------------------

export type FormulaLineInput = {
  itemId: string;
  lineType: "ingredient" | "packaging";
  quantity: number;
  unitOfMeasure: string;
  quantityBasis: "per_batch" | "per_can" | "percentage";
};

export type FormulaDocumentInput = {
  fileName: string;
  storagePath: string;
};

export async function createFormula(data: {
  clientId: string;
  skuId: string | null;
  formulaNumber: string | null;
  name: string | null;
  baseQuantity: number;
  baseUnitOfMeasure: string;
  batchingInstructions: string | null;
  status: "draft" | "pending_authorization";
  lines: FormulaLineInput[];
  paLetter: FormulaDocumentInput | null;
  artworkFiles: FormulaDocumentInput[];
  densityLbsPerGallon?: number;
}): Promise<
  { success: true; id: string } | { success: false; error: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  try {
    const { data: formulaId, error } = await supabase.rpc(
      "create_formula_with_details",
      {
        p_client_id: data.clientId,
        p_sku_id: data.skuId,
        p_formula_number: data.formulaNumber,
        p_name: data.name,
        p_base_quantity: data.baseQuantity,
        p_base_unit_of_measure: data.baseUnitOfMeasure,
        p_batching_instructions: data.batchingInstructions,
        p_status: data.status,
        p_lines: data.lines,
        p_pa_letter: data.paLetter,
        p_artwork_files: data.artworkFiles,
        p_created_by: user.id,
      }
    );

    if (error) throw new Error(error.message);
    if (!formulaId) throw new Error("Formula creation did not return an id");

    const density =
      data.densityLbsPerGallon != null && data.densityLbsPerGallon > 0
        ? data.densityLbsPerGallon
        : null;
    if (density != null) {
      const { error: densityError } = await supabase
        .from("formulas")
        .update({ density_lbs_per_gallon: density })
        .eq("id", formulaId);
      if (densityError) throw new Error(densityError.message);
    }

    revalidatePath("/dashboard/documents");
    revalidatePath("/dashboard/clients");
    revalidatePath("/dashboard/needs-attention");
    revalidatePath(`/dashboard/formulas/${formulaId}`);

    return { success: true, id: formulaId };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

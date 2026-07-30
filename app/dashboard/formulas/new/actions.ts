"use server";

import Anthropic from "@anthropic-ai/sdk";
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
  lines?: ExtractedFormulaLine[];
  specs?: ExtractedFormulaSpec[];
};

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
  "batchingInstructions": "full batching instructions text if present",
  "lines": [
    {
      "itemDescription": "ingredient or packaging name",
      "lineType": "ingredient",
      "quantity": 87.88,
      "unitOfMeasure": "%",
      "quantityBasis": "percentage"
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
- Prefer percentage rows when the sheet lists ingredient %; set quantityBasis to "percentage", unitOfMeasure to "%", and quantity to the numeric percent (e.g. 87.88 from 87.88%).
- If only weight/volume per batch is available, use quantityBasis "per_batch" with that quantity and its unit (e.g. lbs).
- Skip total/100% summary rows and blank rows.
- lineType is usually "ingredient"; use "packaging" only for packaging materials.
- Parse specs like "2.50-2.60" into minValue/maxValue, and "11.8+/-0.2" into targetValue 11.8 with min/max 11.6/12.0.
- Normalize units to lowercase common forms (gallons, lbs, oz, %).
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
      return { ok: true, data: JSON.parse(match[0]) as ExtractedFormulaData };
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

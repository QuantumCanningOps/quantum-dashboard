"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createDocumentRecord } from "../../documents/actions";

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
    const { data: formula, error: formulaError } = await supabase
      .from("formulas")
      .insert({
        client_id: data.clientId,
        version: 1,
        formula_number: data.formulaNumber,
        name: data.name,
        base_quantity: data.baseQuantity,
        base_unit_of_measure: data.baseUnitOfMeasure,
        batching_instructions: data.batchingInstructions,
        status: data.status,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (formulaError) throw new Error(formulaError.message);

    const { error: linesError } = await supabase.from("formula_lines").insert(
      data.lines.map((line) => ({
        formula_id: formula.id,
        item_id: line.itemId,
        line_type: line.lineType,
        quantity: line.quantity,
        unit_of_measure: line.unitOfMeasure,
        quantity_basis: line.quantityBasis,
      }))
    );
    if (linesError) throw new Error(linesError.message);

    if (data.skuId) {
      const { error: skuError } = await supabase
        .from("skus")
        .update({ formula_id: formula.id })
        .eq("id", data.skuId);
      if (skuError) throw new Error(skuError.message);
    }

    if (data.paLetter) {
      await createDocumentRecord({
        clientId: data.clientId,
        documentType: "pa_letter",
        fileName: data.paLetter.fileName,
        storagePath: data.paLetter.storagePath,
        formulaId: formula.id,
      });
    }

    for (const artwork of data.artworkFiles) {
      await createDocumentRecord({
        clientId: data.clientId,
        documentType: "artwork",
        fileName: artwork.fileName,
        storagePath: artwork.storagePath,
        formulaId: formula.id,
      });
    }

    revalidatePath("/dashboard/clients");
    revalidatePath("/dashboard/needs-attention");
    revalidatePath(`/dashboard/formulas/${formula.id}`);

    return { success: true, id: formula.id };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

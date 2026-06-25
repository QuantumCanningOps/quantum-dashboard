"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

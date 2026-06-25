"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { FormulaLineInput } from "../new/actions";

type ActionResult = { success: true } | { success: false; error: string };

async function requireInternalUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// ---------------------------------------------------------------------------
// Batching instructions
// ---------------------------------------------------------------------------

export async function updateBatchingInstructions(
  formulaId: string,
  batchingInstructions: string | null
): Promise<ActionResult> {
  const { supabase, user } = await requireInternalUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("formulas")
    .update({ batching_instructions: batchingInstructions })
    .eq("id", formulaId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/dashboard/formulas/${formulaId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// SKU link
// ---------------------------------------------------------------------------

export async function updateFormulaSku(data: {
  formulaId: string;
  newSkuId: string | null;
  previousSkuIds: string[];
}): Promise<ActionResult> {
  const { supabase, user } = await requireInternalUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const toUnlink = data.previousSkuIds.filter((id) => id !== data.newSkuId);
  if (toUnlink.length > 0) {
    const { error } = await supabase
      .from("skus")
      .update({ formula_id: null })
      .in("id", toUnlink);
    if (error) return { success: false, error: error.message };
  }

  if (data.newSkuId) {
    const { error } = await supabase
      .from("skus")
      .update({ formula_id: data.formulaId })
      .eq("id", data.newSkuId);
    if (error) return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/formulas/${data.formulaId}`);
  revalidatePath("/dashboard/clients");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Formula lines — replace-all
// ---------------------------------------------------------------------------

export async function updateFormulaLines(
  formulaId: string,
  lines: FormulaLineInput[]
): Promise<ActionResult> {
  const { supabase, user } = await requireInternalUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { error: deleteError } = await supabase
    .from("formula_lines")
    .delete()
    .eq("formula_id", formulaId);
  if (deleteError) return { success: false, error: deleteError.message };

  if (lines.length > 0) {
    const { error: insertError } = await supabase.from("formula_lines").insert(
      lines.map((line) => ({
        formula_id: formulaId,
        item_id: line.itemId,
        line_type: line.lineType,
        quantity: line.quantity,
        unit_of_measure: line.unitOfMeasure,
        quantity_basis: line.quantityBasis,
      }))
    );
    if (insertError) return { success: false, error: insertError.message };
  }

  revalidatePath(`/dashboard/formulas/${formulaId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Formula specs — replace-all
// ---------------------------------------------------------------------------

export type FormulaSpecInput = {
  name: string;
  targetValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  unit: string | null;
  notes: string | null;
};

export async function updateFormulaSpecs(
  formulaId: string,
  specs: FormulaSpecInput[]
): Promise<ActionResult> {
  const { supabase, user } = await requireInternalUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { error: deleteError } = await supabase
    .from("formula_specs")
    .delete()
    .eq("formula_id", formulaId);
  if (deleteError) return { success: false, error: deleteError.message };

  if (specs.length > 0) {
    const { error: insertError } = await supabase.from("formula_specs").insert(
      specs.map((spec) => ({
        formula_id: formulaId,
        name: spec.name,
        target_value: spec.targetValue,
        min_value: spec.minValue,
        max_value: spec.maxValue,
        unit: spec.unit,
        notes: spec.notes,
      }))
    );
    if (insertError) return { success: false, error: insertError.message };
  }

  revalidatePath(`/dashboard/formulas/${formulaId}`);
  return { success: true };
}

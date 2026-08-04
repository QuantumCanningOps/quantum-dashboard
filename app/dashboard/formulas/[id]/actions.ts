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

export async function updateFormulaDensity(
  formulaId: string,
  densityLbsPerGallon: number
): Promise<ActionResult> {
  const { supabase, user } = await requireInternalUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!(densityLbsPerGallon > 0)) {
    return { success: false, error: "Density must be greater than zero" };
  }

  const { error } = await supabase
    .from("formulas")
    .update({ density_lbs_per_gallon: densityLbsPerGallon })
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

  const { data: formulaRow, error: formulaError } = await supabase
    .from("formulas")
    .select("client_id")
    .eq("id", data.formulaId)
    .single();
  if (formulaError) return { success: false, error: formulaError.message };

  const toUnlink = data.previousSkuIds.filter((id) => id !== data.newSkuId);
  if (toUnlink.length > 0) {
    const { error } = await supabase
      .from("skus")
      .update({ formula_id: null })
      .in("id", toUnlink)
      .eq("client_id", formulaRow.client_id);
    if (error) return { success: false, error: error.message };
  }

  if (data.newSkuId) {
    const { data: updatedRows, error } = await supabase
      .from("skus")
      .update({ formula_id: data.formulaId })
      .eq("id", data.newSkuId)
      .eq("client_id", formulaRow.client_id)
      .select("id");
    if (error) return { success: false, error: error.message };
    if (!updatedRows || updatedRows.length === 0) {
      return { success: false, error: "SKU does not belong to this client" };
    }
  }

  revalidatePath(`/dashboard/formulas/${data.formulaId}`);
  revalidatePath("/dashboard/clients");
  return { success: true };
}

// ---------------------------------------------------------------------------
// SKU packaging — replace header + lines
// ---------------------------------------------------------------------------

export type SkuPackagingHeaderInput = {
  cansPerTray: number;
  canSizeOz: number;
  canType: "sleek" | "slim" | "standard";
  lidColor: string;
  secondaryPackaging: "none" | "quad_pak" | "carton" | "box" | "other";
  trayNotes: string | null;
  lidNotes: string | null;
  notes: string | null;
};

export type SkuPackagingLineInput = {
  itemId: string;
  quantity: number;
  unitOfMeasure: string;
  quantityBasis: "per_can" | "per_tray" | "per_case" | "per_unit";
};

export async function updateSkuPackaging(data: {
  skuId: string;
  formulaId: string;
  header: SkuPackagingHeaderInput;
  lines: SkuPackagingLineInput[];
}): Promise<ActionResult> {
  const { supabase, user } = await requireInternalUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { error } = await supabase.rpc("replace_sku_packaging", {
    p_sku_id: data.skuId,
    p_header: data.header,
    p_lines: data.lines,
  });
  if (error) return { success: false, error: error.message };

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

  const { error } = await supabase.rpc("replace_formula_lines", {
    p_formula_id: formulaId,
    p_lines: lines,
  });
  if (error) return { success: false, error: error.message };

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

  const { error } = await supabase.rpc("replace_formula_specs", {
    p_formula_id: formulaId,
    p_specs: specs,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath(`/dashboard/formulas/${formulaId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete formula
// ---------------------------------------------------------------------------

export async function deleteFormula(
  formulaId: string
): Promise<
  | { success: true; clientId: string }
  | { success: false; error: string }
> {
  const { supabase, user } = await requireInternalUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("delete_formula", {
    p_formula_id: formulaId,
  });
  if (error) return { success: false, error: error.message };

  const result = data as {
    clientId?: string;
    documents?: Array<{ id?: string; storagePath?: string | null }>;
  } | null;

  const clientId = result?.clientId;
  if (!clientId) {
    return { success: false, error: "Formula delete did not return a client id" };
  }

  const storagePaths = (result.documents ?? [])
    .map((doc) => doc.storagePath)
    .filter((path): path is string => Boolean(path));
  if (storagePaths.length > 0) {
    await supabase.storage.from("documents").remove(storagePaths);
  }

  revalidatePath(`/dashboard/formulas/${formulaId}`);
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/documents");
  revalidatePath("/dashboard/needs-attention");

  return { success: true, clientId };
}

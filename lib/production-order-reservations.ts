import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildScaledRequirements,
  type IngredientQuantityBasis,
} from "@/lib/material-readiness";

type NamedItem = { name: string };

function asNamedItem(
  value: NamedItem | NamedItem[] | null | undefined,
): NamedItem | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Create or refresh a draft batch + batch_lines for a production order so the
 * materials are counted in inventory_item_summary.quantity_reserved.
 */
export async function syncDraftBatchReservations(
  supabase: SupabaseClient,
  args: {
    orderId: string;
    clientId: string;
    skuId: string;
    formulaId: string;
    orderNumber: string;
    orderedQuantity: number;
    unitOfMeasure: string;
    createdBy: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [
    { data: formula, error: formulaError },
    { data: packagingHeader },
    { data: formulaLines },
    { data: packagingLines },
    { data: existingBatches, error: batchesError },
  ] = await Promise.all([
    supabase
      .from("formulas")
      .select("id, base_quantity, base_unit_of_measure, density_lbs_per_gallon")
      .eq("id", args.formulaId)
      .single(),
    supabase
      .from("sku_packaging")
      .select("cans_per_tray, can_size_oz")
      .eq("sku_id", args.skuId)
      .maybeSingle(),
    supabase
      .from("formula_lines")
      .select(
        "item_id, quantity, unit_of_measure, quantity_basis, items(name)",
      )
      .eq("formula_id", args.formulaId)
      .eq("line_type", "ingredient"),
    supabase
      .from("sku_packaging_lines")
      .select(
        "item_id, quantity, unit_of_measure, quantity_basis, items(name)",
      )
      .eq("packaging_id", args.skuId),
    supabase
      .from("batches")
      .select("id, status, batch_number")
      .eq("production_order_id", args.orderId)
      .order("created_at", { ascending: false }),
  ]);

  if (formulaError || !formula) {
    return {
      ok: false,
      error: formulaError?.message ?? "Formula not found for reservation",
    };
  }
  if (batchesError) {
    return { ok: false, error: batchesError.message };
  }

  const requirements = buildScaledRequirements({
    orderQuantity: args.orderedQuantity,
    orderUnitOfMeasure: args.unitOfMeasure,
    baseQuantity: Number(formula.base_quantity),
    baseUnitOfMeasure: formula.base_unit_of_measure,
    cansPerTray: packagingHeader?.cans_per_tray,
    canSizeOz:
      packagingHeader?.can_size_oz != null
        ? Number(packagingHeader.can_size_oz)
        : null,
    densityLbsPerGallon:
      formula.density_lbs_per_gallon != null
        ? Number(formula.density_lbs_per_gallon)
        : null,
    ingredients: ((formulaLines ?? []) as unknown as {
      item_id: string;
      quantity: number;
      unit_of_measure: string;
      quantity_basis: IngredientQuantityBasis;
      items: NamedItem | NamedItem[] | null;
    }[]).map((line) => ({
      itemId: line.item_id,
      itemName: asNamedItem(line.items)?.name ?? "",
      quantity: Number(line.quantity),
      unitOfMeasure: line.unit_of_measure,
      quantityBasis: line.quantity_basis ?? "per_batch",
    })),
    packaging: ((packagingLines ?? []) as unknown as {
      item_id: string;
      quantity: number;
      unit_of_measure: string;
      quantity_basis: string;
      items: NamedItem | NamedItem[] | null;
    }[]).map((line) => ({
      itemId: line.item_id,
      itemName: asNamedItem(line.items)?.name ?? "",
      quantity: Number(line.quantity),
      unitOfMeasure: line.unit_of_measure,
      quantityBasis: line.quantity_basis,
    })),
  });

  if (!requirements) {
    return {
      ok: false,
      error: "Could not calculate material requirements for this order",
    };
  }

  // Aggregate by item+uom; skip plant water (unlimited) and non-positive qty.
  const aggregated = new Map<
    string,
    { itemId: string; quantity: number; unitOfMeasure: string }
  >();
  for (const req of requirements) {
    if (req.unlimited || !(req.required > 0)) continue;
    const key = `${req.itemId}:${req.unitOfMeasure}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.quantity += req.required;
    } else {
      aggregated.set(key, {
        itemId: req.itemId,
        quantity: req.required,
        unitOfMeasure: req.unitOfMeasure,
      });
    }
  }

  const lineRows = [...aggregated.values()].map((row) => ({
    item_id: row.itemId,
    planned_quantity: row.quantity,
    unit_of_measure: row.unitOfMeasure,
  }));

  const draftBatch =
    (existingBatches ?? []).find((b) => b.status === "draft") ?? null;
  const activeNonDraft = (existingBatches ?? []).find((b) =>
    b.status === "scheduled" || b.status === "in_progress",
  );

  // If a scheduled/in-progress batch already owns the BOM, don't overwrite it.
  if (activeNonDraft && !draftBatch) {
    return { ok: true };
  }

  let batchId = draftBatch?.id ?? null;

  if (!batchId) {
    const batchNumber = `${args.orderNumber}-B1`;
    const { data: batch, error: batchError } = await supabase
      .from("batches")
      .insert({
        production_order_id: args.orderId,
        batch_number: batchNumber,
        planned_quantity: args.orderedQuantity,
        unit_of_measure: args.unitOfMeasure,
        status: "draft",
        created_by: args.createdBy,
      })
      .select("id")
      .single();

    if (batchError || !batch) {
      // Unique batch_number collision — retry with suffix.
      if (batchError?.code === "23505") {
        const { data: retryBatch, error: retryError } = await supabase
          .from("batches")
          .insert({
            production_order_id: args.orderId,
            batch_number: `${args.orderNumber}-B${Date.now().toString(36)}`,
            planned_quantity: args.orderedQuantity,
            unit_of_measure: args.unitOfMeasure,
            status: "draft",
            created_by: args.createdBy,
          })
          .select("id")
          .single();
        if (retryError || !retryBatch) {
          return {
            ok: false,
            error: retryError?.message ?? "Failed to create draft batch",
          };
        }
        batchId = retryBatch.id;
      } else {
        return {
          ok: false,
          error: batchError?.message ?? "Failed to create draft batch",
        };
      }
    } else {
      batchId = batch.id;
    }
  } else {
    const { error: updateBatchError } = await supabase
      .from("batches")
      .update({
        planned_quantity: args.orderedQuantity,
        unit_of_measure: args.unitOfMeasure,
        status: "draft",
      })
      .eq("id", batchId);
    if (updateBatchError) {
      return { ok: false, error: updateBatchError.message };
    }
  }

  const { error: deleteError } = await supabase
    .from("batch_lines")
    .delete()
    .eq("batch_id", batchId);
  if (deleteError) {
    return { ok: false, error: deleteError.message };
  }

  if (lineRows.length > 0) {
    const { error: insertError } = await supabase.from("batch_lines").insert(
      lineRows.map((line) => ({
        batch_id: batchId,
        item_id: line.item_id,
        planned_quantity: line.planned_quantity,
        unit_of_measure: line.unit_of_measure,
      })),
    );
    if (insertError) {
      return { ok: false, error: insertError.message };
    }
  }

  return { ok: true };
}

/** Release reservations by cancelling draft batches for an order. */
export async function cancelDraftBatchReservations(
  supabase: SupabaseClient,
  orderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("batches")
    .update({ status: "cancelled" })
    .eq("production_order_id", orderId)
    .eq("status", "draft");

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

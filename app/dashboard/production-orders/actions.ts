"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  cancelDraftBatchReservations,
  syncDraftBatchReservations,
} from "@/lib/production-order-reservations";

export type CreateProductionOrderInput = {
  clientId: string;
  skuId: string;
  formulaId: string;
  orderNumber: string;
  orderedQuantity: number;
  unitOfMeasure: string;
  notes: string | null;
};

function revalidateOrderPaths(args: {
  orderId: string;
  clientId: string;
  formulaId: string;
}) {
  revalidatePath("/dashboard/production-orders");
  revalidatePath(`/dashboard/production-orders/${args.orderId}/readiness`);
  revalidatePath("/dashboard/production");
  revalidatePath(`/dashboard/production/${args.orderId}`);
  revalidatePath(`/dashboard/clients/${args.clientId}`);
  revalidatePath(`/dashboard/formulas/${args.formulaId}`);
  revalidatePath("/dashboard/inventory/summary");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/needs-attention");
}

export async function createProductionOrder(
  data: CreateProductionOrderInput,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const clientId = data.clientId.trim();
  const skuId = data.skuId.trim();
  const formulaId = data.formulaId.trim();
  const orderNumber = data.orderNumber.trim();
  const unitOfMeasure = data.unitOfMeasure.trim();
  const notes = data.notes?.trim() || null;

  if (!clientId) return { success: false, error: "Client is required" };
  if (!skuId) return { success: false, error: "SKU is required" };
  if (!formulaId) return { success: false, error: "Formula is required" };
  if (!orderNumber) return { success: false, error: "Order number is required" };
  if (!unitOfMeasure) {
    return { success: false, error: "Unit of measure is required" };
  }
  if (
    !Number.isFinite(data.orderedQuantity) ||
    data.orderedQuantity <= 0
  ) {
    return { success: false, error: "Ordered quantity must be greater than 0" };
  }

  const [{ data: sku }, { data: formula }] = await Promise.all([
    supabase
      .from("skus")
      .select("id, client_id, formula_id")
      .eq("id", skuId)
      .single(),
    supabase
      .from("formulas")
      .select("id, client_id")
      .eq("id", formulaId)
      .single(),
  ]);

  if (!sku) return { success: false, error: "SKU not found" };
  if (!formula) return { success: false, error: "Formula not found" };
  if (sku.client_id !== clientId) {
    return { success: false, error: "SKU does not belong to the selected client" };
  }
  if (formula.client_id !== clientId) {
    return {
      success: false,
      error: "Formula does not belong to the selected client",
    };
  }

  const { data: order, error } = await supabase
    .from("production_orders")
    .insert({
      client_id: clientId,
      sku_id: skuId,
      formula_id: formulaId,
      order_number: orderNumber,
      ordered_quantity: data.orderedQuantity,
      unit_of_measure: unitOfMeasure,
      status: "pending",
      created_by: user.id,
      notes,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        error: `Order number "${orderNumber}" already exists for this client`,
      };
    }
    return { success: false, error: error.message };
  }

  const reservation = await syncDraftBatchReservations(supabase, {
    orderId: order.id,
    clientId,
    skuId,
    formulaId,
    orderNumber,
    orderedQuantity: data.orderedQuantity,
    unitOfMeasure,
    createdBy: user.id,
  });

  if (!reservation.ok) {
    // No DELETE grant on production_orders — cancel instead of leaving a
    // pending order without reservations.
    await cancelDraftBatchReservations(supabase, order.id);
    await supabase
      .from("production_orders")
      .update({ status: "cancelled" })
      .eq("id", order.id);
    return { success: false, error: reservation.error };
  }

  revalidateOrderPaths({
    orderId: order.id,
    clientId,
    formulaId,
  });

  return { success: true, id: order.id };
}

export type ProductionOrderStatus =
  | "pending"
  | "scheduled"
  | "in_progress"
  | "complete"
  | "cancelled";

export type UpdateProductionOrderInput = {
  id: string;
  orderNumber: string;
  status: ProductionOrderStatus;
  skuId: string;
  formulaId: string;
  orderedQuantity: number;
  unitOfMeasure: string;
  actualQuantity: number | null;
  notes: string | null;
};

const ORDER_STATUSES: ProductionOrderStatus[] = [
  "pending",
  "scheduled",
  "in_progress",
  "complete",
  "cancelled",
];

export async function updateProductionOrder(
  data: UpdateProductionOrderInput,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const id = data.id.trim();
  const orderNumber = data.orderNumber.trim();
  const skuId = data.skuId.trim();
  const formulaId = data.formulaId.trim();
  const unitOfMeasure = data.unitOfMeasure.trim();
  const notes = data.notes?.trim() || null;

  if (!id) return { success: false, error: "Order id is required" };
  if (!orderNumber) return { success: false, error: "Order number is required" };
  if (!skuId) return { success: false, error: "SKU is required" };
  if (!formulaId) return { success: false, error: "Formula is required" };
  if (!unitOfMeasure) {
    return { success: false, error: "Unit of measure is required" };
  }
  if (!ORDER_STATUSES.includes(data.status)) {
    return { success: false, error: "Invalid status" };
  }
  if (
    !Number.isFinite(data.orderedQuantity) ||
    data.orderedQuantity <= 0
  ) {
    return { success: false, error: "Ordered quantity must be greater than 0" };
  }
  if (
    data.actualQuantity != null &&
    (!Number.isFinite(data.actualQuantity) || data.actualQuantity < 0)
  ) {
    return { success: false, error: "Actual quantity must be zero or greater" };
  }

  const { data: existing, error: existingError } = await supabase
    .from("production_orders")
    .select("id, client_id, status")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return { success: false, error: existingError?.message ?? "Order not found" };
  }

  const [{ data: sku }, { data: formula }] = await Promise.all([
    supabase
      .from("skus")
      .select("id, client_id")
      .eq("id", skuId)
      .single(),
    supabase
      .from("formulas")
      .select("id, client_id")
      .eq("id", formulaId)
      .single(),
  ]);

  if (!sku) return { success: false, error: "SKU not found" };
  if (!formula) return { success: false, error: "Formula not found" };
  if (sku.client_id !== existing.client_id) {
    return { success: false, error: "SKU does not belong to this order's client" };
  }
  if (formula.client_id !== existing.client_id) {
    return {
      success: false,
      error: "Formula does not belong to this order's client",
    };
  }

  const { error } = await supabase
    .from("production_orders")
    .update({
      order_number: orderNumber,
      status: data.status,
      sku_id: skuId,
      formula_id: formulaId,
      ordered_quantity: data.orderedQuantity,
      unit_of_measure: unitOfMeasure,
      actual_quantity: data.actualQuantity,
      notes,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        error: `Order number "${orderNumber}" already exists for this client`,
      };
    }
    return { success: false, error: error.message };
  }

  if (data.status === "cancelled" || data.status === "complete") {
    const release = await cancelDraftBatchReservations(supabase, id);
    if (!release.ok) {
      return { success: false, error: release.error };
    }
  } else {
    const reservation = await syncDraftBatchReservations(supabase, {
      orderId: id,
      clientId: existing.client_id,
      skuId,
      formulaId,
      orderNumber,
      orderedQuantity: data.orderedQuantity,
      unitOfMeasure,
      createdBy: user.id,
    });
    if (!reservation.ok) {
      return { success: false, error: reservation.error };
    }
  }

  revalidateOrderPaths({
    orderId: id,
    clientId: existing.client_id,
    formulaId,
  });

  return { success: true };
}

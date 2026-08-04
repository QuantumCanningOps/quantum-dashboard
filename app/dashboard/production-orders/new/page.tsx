import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import { CreateProductionOrderForm } from "./CreateProductionOrderForm";

type NewProductionOrderPageProps = {
  searchParams?: Promise<{
    clientId?: string;
    skuId?: string;
    formulaId?: string;
    quantity?: string;
    uom?: string;
  }>;
};

export default function NewProductionOrderPage({
  searchParams,
}: NewProductionOrderPageProps) {
  return (
    <Suspense
      fallback={
        <div className="h-64 w-full max-w-2xl animate-pulse rounded-lg bg-muted" />
      }
    >
      <NewProductionOrderContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NewProductionOrderContent({
  searchParams,
}: NewProductionOrderPageProps) {
  const params = (await searchParams) ?? {};
  const supabase = await createClient();

  const [
    { data: clients },
    { data: skus },
    { data: formulas },
    { data: existingOrders },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, code")
      .eq("active", true)
      .order("name"),
    supabase
      .from("skus")
      .select("id, client_id, code, name, formula_id")
      .order("code"),
    supabase
      .from("formulas")
      .select(
        "id, client_id, formula_number, name, version, status, base_unit_of_measure",
      )
      .order("name")
      .order("formula_number")
      .order("version", { ascending: false }),
    supabase
      .from("production_orders")
      .select("client_id, order_number")
      .order("created_at", { ascending: false }),
  ]);

  const orderNumbersByClient: Record<string, string[]> = {};
  for (const order of existingOrders ?? []) {
    const list = orderNumbersByClient[order.client_id] ?? [];
    list.push(order.order_number);
    orderNumbersByClient[order.client_id] = list;
  }

  const defaultFormulaId = params.formulaId ?? "";
  const formula = (formulas ?? []).find((f) => f.id === defaultFormulaId);

  let defaultClientId = params.clientId ?? formula?.client_id ?? "";
  let defaultSkuId = params.skuId ?? "";
  let resolvedFormulaId = defaultFormulaId;

  // Resolve SKU from formula linkage when arriving from a formula page.
  if (resolvedFormulaId && !defaultSkuId) {
    const linkedSku = (skus ?? []).find(
      (sku) =>
        sku.formula_id === resolvedFormulaId &&
        (!defaultClientId || sku.client_id === defaultClientId),
    );
    if (linkedSku) {
      defaultSkuId = linkedSku.id;
      defaultClientId = defaultClientId || linkedSku.client_id;
    }
  }

  // Resolve formula from SKU when arriving with skuId only.
  if (defaultSkuId && !resolvedFormulaId) {
    const sku = (skus ?? []).find((s) => s.id === defaultSkuId);
    if (sku) {
      defaultClientId = defaultClientId || sku.client_id;
      if (sku.formula_id) resolvedFormulaId = sku.formula_id;
    }
  }

  // Keep SKU/formula within the selected client.
  const clientSkus = (skus ?? []).filter(
    (sku) => sku.client_id === defaultClientId,
  );
  if (defaultSkuId && !clientSkus.some((sku) => sku.id === defaultSkuId)) {
    defaultSkuId = "";
  }
  if (
    resolvedFormulaId &&
    !(formulas ?? []).some(
      (f) => f.id === resolvedFormulaId && f.client_id === defaultClientId,
    )
  ) {
    resolvedFormulaId = "";
  }

  // If client is known but SKU/formula aren't, pick sensible defaults.
  if (defaultClientId && !defaultSkuId) {
    const preferred =
      clientSkus.find((sku) => sku.formula_id === resolvedFormulaId) ??
      clientSkus[0];
    defaultSkuId = preferred?.id ?? "";
    if (!resolvedFormulaId && preferred?.formula_id) {
      resolvedFormulaId = preferred.formula_id;
    }
  }
  if (defaultClientId && !resolvedFormulaId) {
    const clientFormula = (formulas ?? []).find(
      (f) => f.client_id === defaultClientId,
    );
    resolvedFormulaId = clientFormula?.id ?? "";
  }

  const parsedQuantity = Number(params.quantity);
  const defaultOrderedQuantity =
    params.quantity != null &&
    params.quantity.trim() !== "" &&
    Number.isFinite(parsedQuantity) &&
    parsedQuantity > 0
      ? String(parsedQuantity)
      : "";
  const defaultUnitOfMeasure = params.uom?.trim() || "";

  return (
    <CreateProductionOrderForm
      key={[
        defaultClientId,
        defaultSkuId,
        resolvedFormulaId,
        defaultOrderedQuantity,
        defaultUnitOfMeasure,
      ].join(":")}
      clients={clients ?? []}
      skus={skus ?? []}
      formulas={formulas ?? []}
      orderNumbersByClient={orderNumbersByClient}
      defaultClientId={defaultClientId}
      defaultSkuId={defaultSkuId}
      defaultFormulaId={resolvedFormulaId}
      defaultOrderedQuantity={defaultOrderedQuantity}
      defaultUnitOfMeasure={defaultUnitOfMeasure}
      lockClient={!!params.clientId || !!params.formulaId}
      lockFormula={!!params.formulaId}
    />
  );
}

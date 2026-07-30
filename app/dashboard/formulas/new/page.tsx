import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import { CreateFormulaForm } from "./CreateFormulaForm";

type NewFormulaPageProps = {
  searchParams?: Promise<{
    clientId?: string;
    skuId?: string;
  }>;
};

export default function NewFormulaPage({ searchParams }: NewFormulaPageProps) {
  return (
    <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-lg bg-muted" />}>
      <NewFormulaContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NewFormulaContent({ searchParams }: NewFormulaPageProps) {
  const params = (await searchParams) ?? {};
  const supabase = await createClient();

  const [{ data: clients }, { data: items }, { data: skus }] = await Promise.all([
    supabase.from("clients").select("id, name, code").eq("active", true).order("name"),
    supabase
      .from("items")
      .select(
        "id, name, item_type, unit_of_measure, requires_coa, shelf_life_days, client_id, supplier_id"
      )
      .order("name"),
    supabase
      .from("skus")
      .select("id, client_id, code, name, shelf_life_days, formula_id")
      .order("code"),
  ]);

  const defaultClientId = params.clientId ?? "";
  const defaultSkuId = params.skuId ?? "";
  const selectedSku = (skus ?? []).find((sku) => sku.id === defaultSkuId);
  const resolvedClientId =
    defaultClientId || selectedSku?.client_id || "";
  const resolvedSkuId =
    selectedSku && selectedSku.client_id === resolvedClientId
      ? selectedSku.id
      : "";

  return (
    <CreateFormulaForm
      clients={clients ?? []}
      items={items ?? []}
      skus={skus ?? []}
      defaultClientId={resolvedClientId}
      defaultSkuId={resolvedSkuId}
      defaultName={selectedSku?.name ?? ""}
    />
  );
}

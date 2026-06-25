import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import { CreateFormulaForm } from "./CreateFormulaForm";

export default function NewFormulaPage() {
  return (
    <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-lg bg-muted" />}>
      <NewFormulaContent />
    </Suspense>
  );
}

async function NewFormulaContent() {
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
      .select("id, client_id, code, name, shelf_life_days")
      .order("code"),
  ]);

  return (
    <CreateFormulaForm
      clients={clients ?? []}
      items={items ?? []}
      skus={skus ?? []}
    />
  );
}

import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import { ReceivingForm } from "./ReceivingForm";

export default function NewReceivingPage() {
  return (
    <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-lg bg-muted" />}>
      <NewReceivingContent />
    </Suspense>
  );
}

async function NewReceivingContent() {
  const supabase = await createClient();

  const [
    { data: clients },
    { data: suppliers },
    { data: items },
    { data: thirdPartyLogistics },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, code")
      .eq("active", true)
      .order("name"),
    supabase
      .from("suppliers")
      .select("id, name, code")
      .eq("active", true)
      .order("name"),
    supabase
      .from("items")
      .select("id, name, unit_of_measure, requires_coa, shelf_life_days, client_id, supplier_id")
      .order("name"),
    supabase
      .from("third_party_logistics")
      .select("id, name, code")
      .eq("active", true)
      .order("name"),
  ]);

  return (
    <ReceivingForm
      clients={clients ?? []}
      suppliers={suppliers ?? []}
      items={items ?? []}
      thirdPartyLogistics={thirdPartyLogistics ?? []}
    />
  );
}

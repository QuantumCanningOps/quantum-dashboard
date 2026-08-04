import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import { CountForm } from "./CountForm";

export default function NewInventoryCountPage() {
  return (
    <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-lg bg-muted" />}>
      <NewCountContent />
    </Suspense>
  );
}

async function NewCountContent() {
  const supabase = await createClient();

  const [
    { data: clients },
    { data: items },
    { data: locations },
    { data: suppliers },
    { data: zones },
    { data: onHand },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, code")
      .eq("active", true)
      .order("name"),
    supabase
      .from("items")
      .select(
        "id, name, item_code, unit_of_measure, client_id, supplier_id, requires_coa",
      )
      .order("name"),
    supabase
      .from("locations")
      .select("id, label, warehouse_zones ( name )")
      .eq("active", true)
      .order("label"),
    supabase
      .from("suppliers")
      .select("id, name, code")
      .eq("active", true)
      .order("name"),
    supabase
      .from("warehouse_zones")
      .select("id, name, zone_type")
      .order("name"),
    supabase
      .from("inventory_on_hand")
      .select(
        "lot_id, lot_number, item_id, item_name, location_id, location_label, unit_of_measure, quantity_on_hand, supplier_id, client_id, expiration_date",
      )
      .order("item_name"),
  ]);

  const locationOptions = (locations ?? []).map((loc) => {
    const zone = loc.warehouse_zones as { name: string } | { name: string }[] | null;
    const zoneName = Array.isArray(zone) ? zone[0]?.name : zone?.name;
    return {
      id: loc.id as string,
      label: loc.label as string,
      zone_name: zoneName ?? null,
    };
  });

  return (
    <CountForm
      clients={clients ?? []}
      items={(items ?? []).map((item) => ({
        ...item,
        requires_coa: Boolean(item.requires_coa),
      }))}
      locations={locationOptions}
      suppliers={suppliers ?? []}
      zones={zones ?? []}
      onHand={(onHand ?? []).map((row) => ({
        ...row,
        quantity_on_hand: Number(row.quantity_on_hand),
      }))}
    />
  );
}

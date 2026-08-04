import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import {
  CountForm,
  type DraftCountInitial,
} from "../../new/CountForm";
import type { CountReason } from "../../actions";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function EditInventoryCountPage({ params }: PageProps) {
  return (
    <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-lg bg-muted" />}>
      <EditCountContent params={params} />
    </Suspense>
  );
}

async function EditCountContent({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: count } = await supabase
    .from("inventory_counts")
    .select("id, client_id, count_date, reason, status, notes")
    .eq("id", id)
    .single();

  if (!count) notFound();
  if (count.status !== "draft") {
    redirect(`/dashboard/inventory/counts/${id}`);
  }

  const [
    { data: lines },
    { data: clients },
    { data: items },
    { data: locations },
    { data: suppliers },
    { data: zones },
    { data: onHand },
  ] = await Promise.all([
    supabase
      .from("inventory_count_lines")
      .select(
        `
        id,
        item_id,
        lot_id,
        lot_number,
        location_id,
        system_quantity,
        counted_quantity,
        unit_of_measure,
        supplier_id,
        manufacture_date,
        expiration_date,
        received_at,
        notes,
        coa_file_name,
        coa_storage_path
      `,
      )
      .eq("inventory_count_id", id)
      .order("lot_number"),
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
      .eq("client_id", count.client_id)
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

  const draft: DraftCountInitial = {
    id: count.id,
    clientId: count.client_id,
    countDate: count.count_date,
    reason: count.reason as CountReason,
    notes: count.notes,
    lines: (lines ?? []).map((line) => ({
      id: line.id,
      itemId: line.item_id,
      lotId: line.lot_id,
      lotNumber: line.lot_number,
      locationId: line.location_id,
      systemQuantity: Number(line.system_quantity),
      countedQuantity: Number(line.counted_quantity),
      unitOfMeasure: line.unit_of_measure,
      supplierId: line.supplier_id,
      manufactureDate: line.manufacture_date,
      expirationDate: line.expiration_date,
      receivedAt: line.received_at,
      notes: line.notes,
      coaFileName: line.coa_file_name,
      coaStoragePath: line.coa_storage_path,
    })),
  };

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
      draft={draft}
    />
  );
}

import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CountDetail } from "./CountDetail";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function InventoryCountDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-lg bg-muted" />}>
      <CountDetailContent params={params} />
    </Suspense>
  );
}

async function CountDetailContent({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: count } = await supabase
    .from("inventory_counts")
    .select(
      `
      id,
      count_date,
      reason,
      status,
      notes,
      posted_at,
      clients ( name, code )
    `,
    )
    .eq("id", id)
    .single();

  if (!count) notFound();

  const { data: lines } = await supabase
    .from("inventory_count_lines")
    .select(
      `
      id,
      lot_id,
      lot_number,
      system_quantity,
      counted_quantity,
      unit_of_measure,
      expiration_date,
      received_at,
      coa_file_name,
      notes,
      items ( name ),
      locations ( label )
    `,
    )
    .eq("inventory_count_id", id)
    .order("lot_number");

  const clientRel = oneRel<{ name: string; code: string }>(count.clients);

  return (
    <CountDetail
      count={{
        id: count.id,
        count_date: count.count_date,
        reason: count.reason,
        status: count.status,
        notes: count.notes,
        posted_at: count.posted_at,
        client_name: clientRel?.name ?? "Unknown client",
        client_code: clientRel?.code ?? "—",
      }}
      lines={(lines ?? []).map((line) => {
        const item = oneRel<{ name: string }>(line.items);
        const location = oneRel<{ label: string }>(line.locations);
        return {
          id: line.id,
          lot_id: line.lot_id,
          lot_number: line.lot_number,
          item_name: item?.name ?? "Unknown item",
          location_label: location?.label ?? "—",
          system_quantity: Number(line.system_quantity),
          counted_quantity: Number(line.counted_quantity),
          unit_of_measure: line.unit_of_measure,
          expiration_date: line.expiration_date,
          received_at: line.received_at,
          coa_file_name: line.coa_file_name,
          notes: line.notes,
        };
      })}
    />
  );
}

function oneRel<T extends object>(value: unknown): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value as T;
}

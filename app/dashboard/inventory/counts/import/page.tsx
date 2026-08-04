import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import { CsvImportForm } from "./CsvImportForm";

export default function ImportInventoryCountPage() {
  return (
    <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-lg bg-muted" />}>
      <ImportContent />
    </Suspense>
  );
}

async function ImportContent() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, code")
    .eq("active", true)
    .order("name");

  return <CsvImportForm clients={clients ?? []} />;
}

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { ReactNode } from "react";
import { ClientsPanels } from "./ClientsMenu";

export default async function ClientsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, code, active")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <Button asChild>
          <Link href="/dashboard/formulas/new">+ New Formula</Link>
        </Button>
      </div>

      <ClientsPanels clients={clients ?? []}>{children}</ClientsPanels>
    </div>
  );
}

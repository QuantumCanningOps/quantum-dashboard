import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ClientsPanels } from "./ClientsMenu";

export default function ClientsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ClientsLayoutFallback />}>
      <ClientsShell>{children}</ClientsShell>
    </Suspense>
  );
}

async function ClientsShell({ children }: { children: ReactNode }) {
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

function ClientsLayoutFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <div className="h-9 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex min-h-[70vh] flex-col gap-4 md:flex-row md:gap-6">
        <aside className="w-full shrink-0 md:w-64 lg:w-72">
          <div className="rounded-lg border bg-card">
            <div className="border-b px-3 py-2.5">
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            </div>
            <div className="flex flex-col gap-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-muted" />
              ))}
            </div>
          </div>
        </aside>
        <section className="hidden min-w-0 flex-1 md:block">
          <div className="h-40 animate-pulse rounded-lg border bg-muted/40" />
        </section>
      </div>
    </div>
  );
}

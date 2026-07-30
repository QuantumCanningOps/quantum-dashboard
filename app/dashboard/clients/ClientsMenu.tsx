"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type ClientMenuItem = {
  id: string;
  name: string;
  code: string;
  active: boolean | null;
};

export function ClientsMenu({ clients }: { clients: ClientMenuItem[] }) {
  const pathname = usePathname();
  const selectedId = pathname.startsWith("/dashboard/clients/")
    ? pathname.slice("/dashboard/clients/".length).split("/")[0]
    : null;

  return (
    <nav aria-label="Clients" className="flex flex-col">
      {clients.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">No clients</p>
      ) : (
        <ul className="flex flex-col">
          {clients.map((client) => {
            const selected = client.id === selectedId;
            return (
              <li key={client.id}>
                <Link
                  href={`/dashboard/clients/${client.id}`}
                  className={cn(
                    "flex items-center gap-2 border-l-2 px-3 py-2.5 text-sm transition-colors",
                    selected
                      ? "border-foreground bg-muted font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                  aria-current={selected ? "page" : undefined}
                >
                  <span className="min-w-0 flex-1 truncate">{client.name}</span>
                  {!client.active && (
                    <Badge className="shrink-0 bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0">
                      Inactive
                    </Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

export function ClientsPanels({
  clients,
  children,
}: {
  clients: ClientMenuItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const hasSelection = pathname.startsWith("/dashboard/clients/");

  return (
    <div className="flex min-h-[70vh] flex-col gap-4 md:flex-row md:gap-6">
      <aside
        className={cn(
          "w-full shrink-0 md:w-64 lg:w-72",
          hasSelection && "hidden md:block",
        )}
      >
        <div className="rounded-lg border bg-card">
          <div className="border-b px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              All clients
            </p>
          </div>
          <ClientsMenu clients={clients} />
        </div>
      </aside>

      <section
        className={cn(
          "min-w-0 flex-1",
          !hasSelection && "hidden md:block",
        )}
      >
        {hasSelection && (
          <Link
            href="/dashboard/clients"
            className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground hover:underline md:hidden"
          >
            ← All clients
          </Link>
        )}
        {children}
      </section>
    </div>
  );
}

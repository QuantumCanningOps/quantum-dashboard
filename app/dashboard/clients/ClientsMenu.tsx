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

function useClientSelection() {
  const pathname = usePathname();
  const hasSelection = pathname.startsWith("/dashboard/clients/");
  const selectedId = hasSelection
    ? pathname.slice("/dashboard/clients/".length).split("/")[0]
    : null;
  return { hasSelection, selectedId };
}

export function ClientsMenu({ clients }: { clients: ClientMenuItem[] }) {
  const { selectedId } = useClientSelection();

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
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {client.code}
                  </span>
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
  const { hasSelection } = useClientSelection();

  return (
    <div className="flex min-h-[70vh] flex-col gap-4 md:flex-row md:gap-6">
      <aside
        className={cn(
          "w-full shrink-0 md:w-56 lg:w-64",
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
            href="/dashboard/clients?browse=1"
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

export function ClientsLayoutFallback() {
  const { hasSelection } = useClientSelection();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <div className="h-9 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex min-h-[70vh] flex-col gap-4 md:flex-row md:gap-6">
        <aside
          className={cn(
            "w-full shrink-0 md:w-56 lg:w-64",
            hasSelection && "hidden md:block",
          )}
        >
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
        <section
          className={cn(
            "min-w-0 flex-1",
            !hasSelection && "hidden md:block",
          )}
        >
          <div className="flex flex-col gap-6">
            <div className="h-8 w-56 animate-pulse rounded bg-muted" />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-lg border bg-muted/40"
                />
              ))}
            </div>
            <div className="h-40 animate-pulse rounded-lg border bg-muted/40" />
          </div>
        </section>
      </div>
    </div>
  );
}

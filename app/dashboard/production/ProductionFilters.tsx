"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";

type Client = { id: string; name: string };

type Props = {
  clientId: string;
  status: string;
  q: string;
  clients: Client[];
};

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
  { value: "cancelled", label: "Cancelled" },
];

export function ProductionFilters({ clientId, status, q, clients }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams();
      const current = { clientId, status, q, [key]: value };
      if (current.clientId) params.set("clientId", current.clientId);
      if (current.status) params.set("status", current.status);
      if (current.q) params.set("q", current.q);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [clientId, status, q, pathname, router],
  );

  return (
    <div className="flex flex-wrap gap-2">
      <Input
        placeholder="Search orders…"
        value={q}
        onChange={(e) => update("q", e.target.value)}
        className="h-8 w-48 text-sm"
      />
      <select
        value={clientId}
        onChange={(e) => update("clientId", e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
      >
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={status}
        onChange={(e) => update("status", e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
      >
        <option value="">All statuses</option>
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

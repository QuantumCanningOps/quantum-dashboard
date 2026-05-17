"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";

type Client = { id: string; name: string };

type Props = {
  clientId: string;
  itemType: string;
  q: string;
  clients: Client[];
};

const itemTypeOptions = [
  { value: "raw_ingredient", label: "Ingredient" },
  { value: "packaging", label: "Packaging" },
  { value: "wip", label: "WIP" },
  { value: "finished_good", label: "Finished Good" },
];

export function SummaryFilters({ clientId, itemType, q, clients }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams();
      const current = { clientId, itemType, q, [key]: value };
      if (current.clientId) params.set("clientId", current.clientId);
      if (current.itemType) params.set("itemType", current.itemType);
      if (current.q) params.set("q", current.q);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [clientId, itemType, q, pathname, router],
  );

  return (
    <div className="flex flex-wrap gap-2">
      <Input
        placeholder="Search items…"
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
        value={itemType}
        onChange={(e) => update("itemType", e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
      >
        <option value="">All types</option>
        {itemTypeOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

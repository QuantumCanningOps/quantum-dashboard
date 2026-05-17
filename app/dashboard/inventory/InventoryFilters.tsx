"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type FilterOption = {
  id: string;
  name: string;
  code?: string | null;
};

type InventoryFilterValues = {
  clientId: string;
  itemId: string;
  supplierId: string;
  itemType: string;
  status: string;
  location: string;
  q: string;
};

const itemTypeOptions = [
  "raw_ingredient",
  "packaging",
  "wip",
  "finished_good",
];

const statusOptions = ["released", "quarantine", "on_hold", "consumed"];

export function InventoryFilters({
  filters,
  clients,
  suppliers,
}: {
  filters: InventoryFilterValues;
  clients: FilterOption[];
  suppliers: FilterOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.q);

  useEffect(() => {
    setQuery(filters.q);
  }, [filters.q]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (query !== filters.q) {
        updateFilter("q", query);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [query, filters.q]);

  function updateFilter(name: string, value: string) {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (value) {
      nextParams.set(name, value);
    } else {
      nextParams.delete(name);
    }

    const nextQuery = nextParams.toString();
    startTransition(() => {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    });
  }

  return (
    <div className="grid gap-3 md:grid-cols-6">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search item, lot, supplier"
        className="md:col-span-2"
      />
      <FilterSelect
        label="All clients"
        value={filters.clientId}
        onChange={(value) => updateFilter("clientId", value)}
        options={clients.map((client) => ({
          value: client.id,
          label: `${client.name}${client.code ? ` (${client.code})` : ""}`,
        }))}
      />
      <FilterSelect
        label="All suppliers"
        value={filters.supplierId}
        onChange={(value) => updateFilter("supplierId", value)}
        options={suppliers.map((supplier) => ({
          value: supplier.id,
          label: `${supplier.name}${supplier.code ? ` (${supplier.code})` : ""}`,
        }))}
      />
      <FilterSelect
        label="All types"
        value={filters.itemType}
        onChange={(value) => updateFilter("itemType", value)}
        options={itemTypeOptions.map((type) => ({
          value: type,
          label: formatItemType(type),
        }))}
      />
      <FilterSelect
        label="All statuses"
        value={filters.status}
        onChange={(value) => updateFilter("status", value)}
        options={statusOptions.map((status) => ({
          value: status,
          label: formatStatus(status),
        }))}
      />
      <FilterSelect
        label="All locations"
        value={filters.location}
        onChange={(value) => updateFilter("location", value)}
        options={[
          { value: "onsite", label: "Onsite" },
          { value: "offsite", label: "Offsite (3PL)" },
        ]}
      />
      <div className="flex items-center gap-3 md:col-span-6">
        <Button asChild type="button" variant="outline" size="sm">
          <Link href="/dashboard/inventory">Clear filters</Link>
        </Button>
        {isPending && (
          <span className="text-xs text-muted-foreground">Updating...</span>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <option value="" className="bg-background text-foreground">
        {label}
      </option>
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          className="bg-background text-foreground"
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}

function formatItemType(type: string) {
  const labels: Record<string, string> = {
    raw_ingredient: "Ingredient",
    packaging: "Packaging",
    wip: "WIP",
    finished_good: "Finished",
  };
  return labels[type] ?? type;
}

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    released: "Released",
    quarantine: "Quarantine",
    on_hold: "On Hold",
    consumed: "Consumed",
  };
  return labels[status] ?? status;
}

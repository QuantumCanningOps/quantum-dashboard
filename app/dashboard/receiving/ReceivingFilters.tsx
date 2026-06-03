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

type ReceivingFilterValues = {
  clientId: string;
  supplierId: string;
  dateFrom: string;
  dateTo: string;
  q: string;
};

export function ReceivingFilters({
  filters,
  clients,
  suppliers,
}: {
  filters: ReceivingFilterValues;
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
        placeholder="Search item, lot, client, supplier, PO #"
        className="md:col-span-2"
      />
      <FilterSelect
        label="All clients"
        value={filters.clientId}
        onChange={(value) => updateFilter("clientId", value)}
        options={clients.map((c) => ({
          value: c.id,
          label: `${c.name}${c.code ? ` (${c.code})` : ""}`,
        }))}
      />
      <FilterSelect
        label="All suppliers"
        value={filters.supplierId}
        onChange={(value) => updateFilter("supplierId", value)}
        options={suppliers.map((s) => ({
          value: s.id,
          label: `${s.name}${s.code ? ` (${s.code})` : ""}`,
        }))}
      />
      <input
        type="date"
        value={filters.dateFrom}
        onChange={(e) => updateFilter("dateFrom", e.target.value)}
        title="Received from"
        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <input
        type="date"
        value={filters.dateTo}
        onChange={(e) => updateFilter("dateTo", e.target.value)}
        title="Received to"
        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <div className="flex items-center gap-3 md:col-span-6">
        <Button asChild type="button" variant="outline" size="sm">
          <Link href="/dashboard/receiving">Clear filters</Link>
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

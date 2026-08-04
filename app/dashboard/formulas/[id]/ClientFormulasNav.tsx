"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ClientFormulaNavItem = {
  id: string;
  formula_number: string | null;
  name: string | null;
  version: number;
  status: string;
  sku_code: string | null;
  sku_name: string | null;
};

function formulaLabel(formula: ClientFormulaNavItem) {
  return (
    formula.name?.trim() ||
    formula.sku_name?.trim() ||
    formula.formula_number?.trim() ||
    "Untitled formula"
  );
}

type FormulaStatus =
  | "draft"
  | "pending_authorization"
  | "authorized"
  | "retired";

function asFormulaStatus(status: string): FormulaStatus | null {
  switch (status) {
    case "draft":
    case "pending_authorization":
    case "authorized":
    case "retired":
      return status;
    default:
      return null;
  }
}

function statusClasses(status: string) {
  const known = asFormulaStatus(status);
  if (!known) return "bg-muted text-muted-foreground border-border";
  switch (known) {
    case "draft":
      return "bg-gray-100 text-gray-700 border-gray-200";
    case "pending_authorization":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "authorized":
      return "bg-green-100 text-green-800 border-green-200";
    case "retired":
      return "bg-red-100 text-red-700 border-red-200";
    default: {
      const _exhaustive: never = known;
      return _exhaustive;
    }
  }
}

function statusLabel(status: string) {
  const known = asFormulaStatus(status);
  if (!known) return status;
  switch (known) {
    case "draft":
      return "Draft";
    case "pending_authorization":
      return "Pending";
    case "authorized":
      return "Auth";
    case "retired":
      return "Retired";
    default: {
      const _exhaustive: never = known;
      return _exhaustive;
    }
  }
}

export function ClientFormulasNav({
  clientId,
  clientName,
  formulas,
  currentFormulaId,
}: {
  clientId: string;
  clientName: string;
  formulas: ClientFormulaNavItem[];
  currentFormulaId: string;
}) {
  return (
    <aside className="w-full shrink-0 md:w-56 lg:w-64">
      <div className="rounded-lg border bg-card md:sticky md:top-6 md:max-h-[calc(100vh-5rem)] md:overflow-y-auto">
        <div className="border-b px-3 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Formulas
          </p>
          <Link
            href={`/dashboard/clients/${clientId}`}
            className="mt-0.5 block truncate text-sm font-medium hover:underline"
          >
            {clientName}
          </Link>
        </div>
        <nav aria-label={`${clientName} formulas`}>
          {formulas.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No formulas
            </p>
          ) : (
            <ul className="flex flex-col">
              {formulas.map((formula) => {
                const selected = formula.id === currentFormulaId;
                const label = formulaLabel(formula);
                return (
                  <li key={formula.id}>
                    <Link
                      href={`/dashboard/formulas/${formula.id}`}
                      className={cn(
                        "flex flex-col gap-1 border-l-2 px-3 py-2.5 text-sm transition-colors",
                        selected
                          ? "border-foreground bg-muted font-medium text-foreground"
                          : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        formula.status === "retired" && !selected && "opacity-60",
                      )}
                      aria-current={selected ? "page" : undefined}
                    >
                      <span className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        <Badge
                          className={cn(
                            "shrink-0 px-1.5 py-0 text-[10px]",
                            statusClasses(formula.status),
                          )}
                        >
                          {statusLabel(formula.status)}
                        </Badge>
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {formula.sku_code ? (
                          <span className="truncate font-mono">
                            {formula.sku_code}
                          </span>
                        ) : null}
                        {formula.formula_number ? (
                          <span className="truncate font-mono">
                            {formula.sku_code ? "· " : ""}
                            {formula.formula_number}
                          </span>
                        ) : null}
                        <span className="shrink-0">v{formula.version}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>
      </div>
    </aside>
  );
}

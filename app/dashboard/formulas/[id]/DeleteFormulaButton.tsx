"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteFormula } from "./actions";

export function DeleteFormulaButton({
  formulaId,
  formulaLabel,
}: {
  formulaId: string;
  formulaLabel: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteFormula(formulaId);
    if (!result.success) {
      setError(result.error);
      setDeleting(false);
      return;
    }
    router.push(`/dashboard/clients/${result.clientId}`);
    router.refresh();
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        Delete formula
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
      <p className="text-sm text-destructive">
        Delete <span className="font-medium">{formulaLabel}</span>? This removes
        formula lines, specs, and linked PA/artwork documents. The SKU stays,
        unlinked. Formulas used by production orders cannot be deleted.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={deleting}
          onClick={() => {
            void handleDelete();
          }}
        >
          {deleting ? "Deleting…" : "Yes, delete"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={deleting}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

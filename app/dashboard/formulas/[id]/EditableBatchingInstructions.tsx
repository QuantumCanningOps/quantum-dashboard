"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil } from "lucide-react";
import { updateBatchingInstructions } from "./actions";

export function EditableBatchingInstructions({
  formulaId,
  batchingInstructions,
}: {
  formulaId: string;
  batchingInstructions: string | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(batchingInstructions ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(batchingInstructions ?? "");
    setError(null);
    setIsEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateBatchingInstructions(formulaId, draft.trim() || null);
    if (!result.success) {
      setError(result.error);
      setSaving(false);
      return;
    }
    setSaving(false);
    setIsEditing(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Batching Instructions</CardTitle>
        {!isEditing && (
          <button
            type="button"
            onClick={startEditing}
            aria-label="Edit batching instructions"
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isEditing ? (
          <>
            <textarea
              className="flex min-h-32 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            {batchingInstructions ?? "No batching instructions recorded."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

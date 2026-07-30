"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil } from "lucide-react";
import {
  saveClientContacts,
  type ContactRow,
} from "./actions";

type ContactDraft = {
  key: string;
  id?: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  primaryContact: boolean;
};

function toDraft(contact: ContactRow): ContactDraft {
  return {
    key: contact.id,
    id: contact.id,
    name: contact.name,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    role: contact.role ?? "",
    primaryContact: contact.primary_contact,
  };
}

function newContactDraft(): ContactDraft {
  return {
    key: crypto.randomUUID(),
    name: "",
    email: "",
    phone: "",
    role: "",
    primaryContact: false,
  };
}

export function EditableContacts({
  clientId,
  contacts,
}: {
  clientId: string;
  contacts: ContactRow[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentContacts, setCurrentContacts] = useState(contacts);
  const [drafts, setDrafts] = useState<ContactDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentContacts(contacts);
  }, [contacts]);

  function startEditing() {
    setDrafts(
      currentContacts.length > 0
        ? currentContacts.map(toDraft)
        : [newContactDraft()],
    );
    setError(null);
    setIsEditing(true);
  }

  function updateDraft(key: string, updates: Partial<ContactDraft>) {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.key !== key) {
          if (updates.primaryContact) {
            return { ...d, primaryContact: false };
          }
          return d;
        }
        return { ...d, ...updates };
      }),
    );
  }

  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  function addDraft() {
    setDrafts((prev) => [...prev, newContactDraft()]);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const payload = drafts
      .filter((d) => d.name.trim())
      .map((d) => ({
        id: d.id,
        name: d.name,
        email: d.email.trim() || null,
        phone: d.phone.trim() || null,
        role: d.role.trim() || null,
        primaryContact: d.primaryContact,
      }));

    const result = await saveClientContacts(clientId, payload);
    if (!result.success) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setCurrentContacts(result.contacts);
    setSaving(false);
    setIsEditing(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Contacts</CardTitle>
        {!isEditing && (
          <button
            type="button"
            onClick={startEditing}
            aria-label="Edit contacts"
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isEditing ? (
          <>
            {drafts.map((draft, i) => (
              <div
                key={draft.key}
                className="flex flex-col gap-3 rounded-lg border p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Contact {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeDraft(draft.key)}
                    className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <Label className="text-xs">Name *</Label>
                    <Input
                      placeholder="Contact name"
                      value={draft.name}
                      onChange={(e) =>
                        updateDraft(draft.key, { name: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Role</Label>
                    <Input
                      placeholder="e.g. Account Manager"
                      value={draft.role}
                      onChange={(e) =>
                        updateDraft(draft.key, { role: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Phone</Label>
                    <Input
                      type="tel"
                      placeholder="Phone"
                      value={draft.phone}
                      onChange={(e) =>
                        updateDraft(draft.key, { phone: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <Label className="text-xs">Email</Label>
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      value={draft.email}
                      onChange={(e) =>
                        updateDraft(draft.key, { email: e.target.value })
                      }
                    />
                  </div>
                  <label className="col-span-2 flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={draft.primaryContact}
                      onCheckedChange={(checked) =>
                        updateDraft(draft.key, {
                          primaryContact: checked === true,
                        })
                      }
                    />
                    Primary contact
                  </label>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={addDraft}
            >
              + Add Contact
            </Button>

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
        ) : currentContacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contacts</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {currentContacts.map((contact) => (
              <li key={contact.id} className="flex flex-col gap-0.5 text-sm">
                <div className="flex items-center gap-2">
                  {contact.primary_contact && (
                    <span className="text-yellow-500" title="Primary">
                      ★
                    </span>
                  )}
                  <span className="font-medium">{contact.name}</span>
                  {contact.role && (
                    <span className="text-muted-foreground">{contact.role}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="hover:underline"
                    >
                      {contact.email}
                    </a>
                  )}
                  {contact.phone && <span>{contact.phone}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

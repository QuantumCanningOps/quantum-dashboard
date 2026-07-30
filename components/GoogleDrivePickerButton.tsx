"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  getGoogleDrivePickerSession,
  importGoogleDriveFile,
} from "@/app/dashboard/google/actions";

declare global {
  interface Window {
    gapi?: {
      load: (api: string, callback: () => void) => void;
    };
    google?: {
      picker?: {
        PickerBuilder: new () => GooglePickerBuilder;
        ViewId: { DOCS: unknown; DOCS_IMAGES: unknown };
        Action: { PICKED: string; CANCEL: string };
        Feature: { MULTISELECT_ENABLED: unknown };
        DocsView: new (viewId?: unknown) => GoogleDocsView;
      };
    };
  }
}

type GoogleDocsView = {
  setMimeTypes: (mimeTypes: string) => GoogleDocsView;
  setIncludeFolders: (include: boolean) => GoogleDocsView;
};

type GooglePickerBuilder = {
  addView: (view: unknown) => GooglePickerBuilder;
  enableFeature: (feature: unknown) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setAppId: (appId: string) => GooglePickerBuilder;
  setCallback: (cb: (data: GooglePickerResponse) => void) => GooglePickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
};

type GooglePickerResponse = {
  action: string;
  docs?: Array<{ id: string; name: string; mimeType?: string }>;
};

const DEFAULT_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.google-apps.document",
].join(",");

let gapiLoader: Promise<void> | null = null;

function loadGapiPicker(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Picker is only available in the browser."));
  }
  if (window.google?.picker) return Promise.resolve();
  if (gapiLoader) return gapiLoader;

  gapiLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-google-api="true"]',
    );
    const start = () => {
      if (!window.gapi) {
        reject(new Error("Google API failed to load."));
        return;
      }
      window.gapi.load("picker", () => resolve());
    };

    if (existing) {
      if (window.gapi) start();
      else existing.addEventListener("load", start, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.defer = true;
    script.dataset.googleApi = "true";
    script.onload = start;
    script.onerror = () => reject(new Error("Failed to load Google API script."));
    document.head.appendChild(script);
  });

  return gapiLoader;
}

function base64ToFile(base64: string, fileName: string, mimeType: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType });
}

export function GoogleDrivePickerButton({
  onFile,
  mimeTypes = DEFAULT_MIME_TYPES,
  disabled = false,
  label = "Google Drive",
  size = "sm",
  variant = "outline",
}: {
  onFile: (file: File) => void | Promise<void>;
  mimeTypes?: string;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "default";
  variant?: "outline" | "ghost" | "secondary";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);

    try {
      const session = await getGoogleDrivePickerSession();
      if (!session.ok) {
        setError(session.message);
        return;
      }

      await loadGapiPicker();
      const pickerApi = window.google?.picker;
      if (!pickerApi) {
        throw new Error("Google Picker unavailable.");
      }

      await new Promise<void>((resolve, reject) => {
        const view = new pickerApi.DocsView()
          .setIncludeFolders(true)
          .setMimeTypes(mimeTypes);

        const builder = new pickerApi.PickerBuilder()
          .addView(view)
          .setOAuthToken(session.accessToken)
          .setDeveloperKey(session.developerKey)
          .setCallback((data) => {
            void (async () => {
              if (data.action === pickerApi.Action.CANCEL) {
                resolve();
                return;
              }
              if (data.action !== pickerApi.Action.PICKED || !data.docs?.[0]?.id) {
                return;
              }

              try {
                const imported = await importGoogleDriveFile(data.docs[0].id);
                if (!imported.ok) {
                  setError(imported.message);
                  reject(new Error(imported.message));
                  return;
                }
                const file = base64ToFile(
                  imported.base64,
                  imported.fileName,
                  imported.mimeType,
                );
                await onFile(file);
                resolve();
              } catch (e) {
                reject(e instanceof Error ? e : new Error(String(e)));
              }
            })();
          });

        if (session.appId) {
          builder.setAppId(session.appId);
        }

        builder.build().setVisible(true);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Drive picker failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || busy}
        onClick={() => {
          void handleClick();
        }}
      >
        {busy ? "Opening Drive…" : label}
      </Button>
      {error && (
        <p className="text-xs text-destructive">
          {error}{" "}
          {(error.toLowerCase().includes("connect") ||
            error.toLowerCase().includes("reconnect")) && (
            <Link href="/dashboard/settings" className="underline">
              Open Settings
            </Link>
          )}
        </p>
      )}
    </div>
  );
}

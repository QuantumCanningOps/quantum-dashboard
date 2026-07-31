"use client";

import { usePathname, useRouter } from "next/navigation";

export function ImportWarningBanner({ message }: { message: string }) {
  const router = useRouter();
  const pathname = usePathname();

  if (!message.trim()) return null;

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <p>
        <span className="font-medium">Import incomplete: </span>
        {message}
      </p>
      <button
        type="button"
        onClick={() => router.replace(pathname)}
        className="shrink-0 text-xs font-medium text-amber-800 hover:underline dark:text-amber-200"
      >
        Dismiss
      </button>
    </div>
  );
}

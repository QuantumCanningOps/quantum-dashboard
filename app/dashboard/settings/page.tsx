import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DisconnectGoogleButton } from "./DisconnectGoogleButton";

type SearchParams = Promise<{ error?: string; connected?: string }>;

type PublicConnection = {
  google_email: string;
  google_sub: string;
  scopes: string[];
  status: string;
  connected_at: string;
  updated_at: string;
};

function scopeLabel(scope: string): string {
  if (scope.includes("gmail")) return "Gmail";
  if (scope.includes("drive")) return "Drive";
  if (scope.includes("calendar")) return "Calendar";
  if (scope === "email" || scope === "profile" || scope === "openid") {
    return scope;
  }
  return scope.replace("https://www.googleapis.com/auth/", "");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: connection } = await supabase
    .from("google_connections_public")
    .select(
      "google_email, google_sub, scopes, status, connected_at, updated_at",
    )
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  const conn = connection as PublicConnection | null;
  const isConnected = conn?.status === "active";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage connected accounts and integrations.
        </p>
      </div>

      {params.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {params.error}
        </div>
      ) : null}

      {params.connected === "1" ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Google account connected successfully.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Google</CardTitle>
          <CardDescription>
            Connect Gmail, Drive, and Calendar for future ops features. This is
            separate from how you sign in to Quantum.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {conn ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Account</span>
                <span className="font-medium">{conn.google_email}</span>
                <Badge
                  variant={
                    conn.status === "active"
                      ? "default"
                      : conn.status === "needs_reauth"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {conn.status}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground mb-2">Granted scopes</p>
                <div className="flex flex-wrap gap-1.5">
                  {conn.scopes.map((scope) => (
                    <Badge key={scope} variant="outline" title={scope}>
                      {scopeLabel(scope)}
                    </Badge>
                  ))}
                </div>
              </div>
              <p className="text-muted-foreground">
                Connected{" "}
                {new Date(conn.connected_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No Google account connected.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            {!isConnected ? (
              <Button asChild>
                <Link href="/api/google/oauth/start">
                  {conn ? "Reconnect Google" : "Connect Google"}
                </Link>
              </Button>
            ) : null}
            {conn ? <DisconnectGoogleButton /> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

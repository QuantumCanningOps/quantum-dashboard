import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeRedirect />
    </Suspense>
  );
}

async function HomeRedirect() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    redirect("/dashboard");
  }
  redirect("/auth/login");
  return null;
}

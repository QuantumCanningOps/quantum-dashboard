// "/" is redirected in lib/supabase/proxy.ts (login vs dashboard).
// This page should not run in normal requests.
export default function Home() {
  return null;
}

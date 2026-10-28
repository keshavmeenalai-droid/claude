"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6">
      <h2 className="text-lg font-semibold text-rose-200">Something went wrong loading this page</h2>
      <p className="mt-2 text-sm text-slate-300">
        Usually the database is not set up yet (run supabase/migrations/0001_init.sql) or an environment variable is missing.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-slate-500">Error id: {error.digest} (details are in the Vercel function logs)</p>}
      <button onClick={reset} className="mt-4 rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-100 hover:bg-white/15">Try again</button>
    </div>
  );
}

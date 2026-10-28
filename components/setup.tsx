import { seedStrategy } from "@/app/actions";
import { ActionForm, SubmitButton } from "./forms";
import { Card } from "./ui";

export function DbMissing() {
  return (
    <Card title="Connect Supabase to start">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300">
        <li>Create a Supabase project, open <b>SQL Editor</b>, paste <code className="text-sky-300">supabase/migrations/0001_init.sql</code> and run it.</li>
        <li>
          In Vercel → Project → Settings → Environment Variables add <code className="text-sky-300">SUPABASE_URL</code> and <code className="text-sky-300">SUPABASE_SERVICE_ROLE_KEY</code> (Supabase → Project Settings → API).
        </li>
        <li>Redeploy. Full steps are in <code className="text-sky-300">README.md</code>.</li>
      </ol>
    </Card>
  );
}

export function SeedPrompt() {
  return (
    <Card title="Load the QVM Compass strategy" subtitle="One click loads the 15 stocks, INDY, the order plan, alternates, watchlist, parameters and review tasks from config/qvm_strategy.json.">
      <ActionForm action={seedStrategy} className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="success">Load strategy</SubmitButton>
        <span className="text-xs text-slate-400">Then press “Run check now” to load prices, and import your WInS Open Positions on the Trades page.</span>
      </ActionForm>
    </Card>
  );
}

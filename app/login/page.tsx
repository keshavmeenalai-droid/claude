import { login } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, inputCls } from "@/components/ui";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-900 ring-1 ring-sky-400/30">
            <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
              <path d="M14 46 L32 14 L50 46 Z" fill="none" stroke="#38bdf8" strokeWidth="5" strokeLinejoin="round" />
              <circle cx="32" cy="38" r="4" fill="#f43f5e" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white">Northgate AlertGuard</h1>
          <p className="mt-1 text-sm text-slate-400">QVM Compass · trade alerts for the team</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-ink-900/80 p-6 shadow-2xl">
          <ActionForm action={login} className="space-y-4">
            <input type="hidden" name="next" value={next ?? "/"} />
            <Field label="Your name" hint="Shown when you acknowledge alerts or record trades.">
              <input name="name" className={inputCls} placeholder="e.g. Keshav" autoComplete="name" />
            </Field>
            <Field label="Team password">
              <input name="password" type="password" required className={inputCls} autoComplete="current-password" autoFocus />
            </Field>
            <SubmitButton className="w-full">Sign in</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </main>
  );
}

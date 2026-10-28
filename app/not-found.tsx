import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold text-white">Not found</h1>
      <Link href="/" className="text-sm text-sky-300 hover:underline">Back to the dashboard</Link>
    </main>
  );
}

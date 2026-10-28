import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Northgate AlertGuard", template: "%s · Northgate AlertGuard" },
  description: "Trade tracker and exit alerts for the QVM Compass strategy on WInS.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#060b16" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}

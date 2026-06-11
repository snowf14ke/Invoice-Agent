import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Invoice-Agent — document intelligence, measured honestly",
  description:
    "OCR → typed extraction → Postgres/pgvector → tool-calling agent, with a versioned eval storyboard showing what every improvement actually bought.",
};

const nav = [
  { href: "/", label: "Story" },
  { href: "/demo", label: "Live demo" },
  { href: "/evals", label: "Eval receipts" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight text-zinc-100">
              Invoice<span className="text-emerald-400">-Agent</span>
            </Link>
            <nav className="flex items-center gap-5 text-sm">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="text-zinc-400 transition-colors hover:text-zinc-100"
                >
                  {n.label}
                </Link>
              ))}
              <a
                href="https://github.com/snowf14ke/Invoice-Agent"
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-zinc-700 px-2.5 py-1 text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
              >
                GitHub
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
        <footer className="border-t border-zinc-800 py-6 text-center text-xs text-zinc-500">
          Built as a measured storyboard: every version is a git tag + a frozen eval snapshot.
        </footer>
      </body>
    </html>
  );
}

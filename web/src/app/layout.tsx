import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Display face for headings — characterful grotesque; body stays a quiet
// humanist sans; numbers/code get IBM Plex Mono for the instrument feel.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Munkhtsetseg Davaadorj — AI Engineer",
  description:
    "AI engineer in Ulaanbaatar (remote, UTC+8) — production RAG, OCR, model compression, and LLM systems with rigorous, measured evaluation.",
};

export const viewport: Viewport = {
  themeColor: "#05080f",
};

const nav = [
  { href: "/", label: "Portfolio" },
  { href: "/invoice-agent", label: "Case study" },
  { href: "/evals", label: "Evals" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // the inline .js bootstrap script mutates <html> class pre-hydration
      suppressHydrationWarning
      // Next 16: acknowledge css smooth-scroll so route transitions reset instantly
      data-scroll-behavior="smooth"
      className={`${bricolage.variable} ${instrument.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* gates the hidden animation start-states so no-JS visitors see everything */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
        <header className="sticky top-0 z-20 border-b border-ink-700/70 bg-ink-950/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="group flex items-center gap-2.5">
              {/* monogram mark */}
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-azure-400/40 bg-azure-500/10 font-mono text-xs font-semibold text-azure-300 transition-colors group-hover:bg-azure-500/20">
                MD
              </span>
              {/* monogram carries the brand on small screens */}
              <span className="hidden font-display font-semibold tracking-tight text-mist-100 sm:block">
                Munkhtsetseg<span className="text-azure-400"> Davaadorj</span>
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm sm:gap-5">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="whitespace-nowrap text-mist-400 transition-colors hover:text-mist-100"
                >
                  {n.label}
                </Link>
              ))}
              <a
                href="https://github.com/snowf14ke/Invoice-Agent"
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-ink-600 px-2.5 py-1 text-mist-300 transition-colors hover:border-azure-400/60 hover:text-mist-100"
              >
                GitHub
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
        <footer className="border-t border-ink-700/70 py-6 text-center text-xs text-mist-500">
          © 2026 Munkhtsetseg Davaadorj — every project claim links back to a frozen eval
          snapshot, not adjectives.
        </footer>
      </body>
    </html>
  );
}

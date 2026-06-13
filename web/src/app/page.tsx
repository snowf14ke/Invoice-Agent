import Link from "next/link";
import type { ComponentType } from "react";

import AgentDemo, { type DemoScene } from "@/components/AgentDemo";
import ContactForm from "@/components/ContactForm";
import { Reveal } from "@/components/Motion";
import { BichigDemo, InvoiceDemo } from "@/components/ProjectDemos";
import SectionHeader from "@/components/SectionHeader";
import { TtsDemo } from "@/components/TtsDemo";
import { experience, projects, site, skills, type Highlight } from "@/data/portfolio";
import { loadReplaySets } from "@/lib/data";

// Questions from the frozen replay set that read well in the hero terminal
// (short question, short trace, crisp answer).
const DEMO_QUESTIONS = [
  "What is the total gross worth of invoice 61356291?",
  "Who is the seller on invoice 10372826?",
  "How much did we spend with Davis PLC in total?",
];

function buildDemoScenes(): { scenes: DemoScene[]; version: string } {
  const sets = loadReplaySets();
  const latest = sets[sets.length - 1];
  if (!latest) return { scenes: [], version: "" };
  const scenes = DEMO_QUESTIONS.flatMap((q) => {
    const item = latest.items.find((it) => it.question === q);
    if (!item) return [];
    const answer = item.answer.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    return [
      {
        question: item.question,
        steps: item.trace.slice(0, 4).map((s) => {
          const args = JSON.stringify(s.args);
          return {
            tool: s.tool,
            args: args.length > 58 ? args.slice(0, 55) + "…" : args,
            result: (s.result ?? "").split("\n")[0].slice(0, 90),
          };
        }),
        answer: answer.length > 200 ? answer.slice(0, 197) + "…" : answer,
      },
    ];
  });
  // replay regeneration can rename questions — fail loudly in dev, not silently in prod
  if (scenes.length < DEMO_QUESTIONS.length && process.env.NODE_ENV !== "production") {
    console.warn(
      `AgentDemo: only ${scenes.length}/${DEMO_QUESTIONS.length} demo questions found in replay set ${latest.version}`,
    );
  }
  return { scenes, version: latest.version };
}

const PROJECT_DEMOS: Record<string, ComponentType> = {
  "invoice-agent": InvoiceDemo,
  "bichig-ocr": BichigDemo,
  "tts-lipsync": TtsDemo,
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Wraps each highlight substring of an experience outcome in an emphasized
// span; a highlight that no longer matches the text falls back to plain text.
function renderOutcome(outcome: string, highlights?: Highlight[]) {
  if (!highlights || highlights.length === 0) return outcome;
  const pattern = new RegExp(`(${highlights.map((h) => escapeRegExp(h.text)).join("|")})`, "g");
  return outcome.split(pattern).map((part, i) => {
    const h = highlights.find((x) => x.text === part);
    if (!h) return part;
    return h.tone === "azure" ? (
      <span key={i} className="rounded bg-azure-500/10 px-1 font-mono text-[13px] font-medium text-azure-300">
        {part}
      </span>
    ) : (
      <span key={i} className="font-mono text-[13px] font-medium text-emerald-400">
        {part}
      </span>
    );
  });
}

// Icon paths: simple-icons (GitHub/LinkedIn/Instagram/Facebook), heroicons (mail).
const SOCIAL_LINKS: { label: string; href: string; paths: string[] }[] = [
  {
    label: "Email",
    href: `mailto:${site.email}`,
    paths: [
      "M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67Z",
      "M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908Z",
    ],
  },
  {
    label: "GitHub",
    href: site.github,
    paths: [
      "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
    ],
  },
  {
    label: "LinkedIn",
    href: site.socials.linkedin,
    paths: [
      "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
    ],
  },
  {
    label: "Instagram",
    href: site.socials.instagram,
    paths: [
      "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z",
    ],
  },
  {
    label: "Facebook",
    href: site.socials.facebook,
    paths: [
      "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
    ],
  },
];

export default function PortfolioPage() {
  const demo = buildDemoScenes();

  return (
    <div className="space-y-24">
      {/* hero */}
      <section className="grid items-center gap-10 pt-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <div className="fade-up kicker">AI engineer · Ulaanbaatar · UTC+8</div>
          <div className="fade-up space-y-3" style={{ animationDelay: "100ms" }}>
            <h1 className="font-display text-4xl font-bold tracking-tight text-mist-100 sm:text-5xl">
              {site.name}
            </h1>
            <p className="bg-gradient-to-r from-azure-300 to-emerald-400 bg-clip-text text-xl font-medium text-transparent">
              {site.tagline}
            </p>
          </div>
          <p className="fade-up max-w-xl text-mist-300" style={{ animationDelay: "200ms" }}>
            I&apos;m an AI engineer who turns research models into{" "}
            <strong className="font-semibold text-mist-100">working products</strong>. I&apos;ve
            shipped Mongolian-script OCR, document-answering agents, and real-time speech systems —
            and I <strong className="font-semibold text-mist-100">prove they work with numbers</strong>,
            not promises.
          </p>
          <div className="fade-up flex flex-wrap gap-3" style={{ animationDelay: "300ms" }}>
            <a
              href="#projects"
              className="rounded-lg bg-azure-500 px-4 py-2 text-sm font-semibold text-ink-950 transition-all hover:bg-azure-400 hover:shadow-[0_0_24px_rgb(92_165_247/0.35)]"
            >
              View work
            </a>
            <a
              href={`mailto:${site.email}`}
              className="rounded-lg border border-ink-600 px-4 py-2 text-sm text-mist-300 transition-colors hover:border-azure-400/60 hover:text-mist-100"
            >
              Email me
            </a>
            <a
              href={site.cvPath}
              download
              className="rounded-lg border border-ink-600 px-4 py-2 text-sm text-mist-300 transition-colors hover:border-azure-400/60 hover:text-mist-100"
            >
              Download CV
            </a>
          </div>
          <div
            className="fade-up flex items-center gap-2 text-sm text-mist-400"
            style={{ animationDelay: "400ms" }}
          >
            <span className="relative h-2 w-2 rounded-full bg-emerald-400 text-emerald-400 status-ping" />
            {site.availability} · {site.remote}
          </div>
        </div>

        {/* the "gif": a looping replay of a real recorded agent run.
            min-w-0 lets the terminal's nowrap mono lines truncate instead of
            stretching the grid column past the viewport on mobile */}
        {demo.scenes.length > 0 && (
          <div className="fade-up min-w-0" style={{ animationDelay: "350ms" }}>
            <AgentDemo scenes={demo.scenes} version={demo.version} />
            <p className="mt-2.5 text-center text-xs text-mist-500">
              Frozen replay from the eval harness —{" "}
              <Link
                href="/invoice-agent"
                className="text-azure-400 transition-colors hover:text-azure-300"
              >
                see how it&apos;s measured →
              </Link>
            </p>
          </div>
        )}
      </section>

      {/* experience */}
      <section id="experience" className="space-y-8">
        <Reveal>
          <SectionHeader index="01" kicker="Track record" title="Work experience" />
        </Reveal>
        <ol className="relative ml-1.5 space-y-8 border-l border-ink-700 pl-7">
          {experience.map((e, i) => (
            <Reveal key={e.company} delay={i * 60}>
              <li className="relative">
                <span
                  className={`absolute top-1 -left-[35.5px] h-2.5 w-2.5 rounded-full border-2 bg-ink-950 ${
                    i === 0 ? "border-emerald-400" : "border-azure-400/70"
                  }`}
                />
                <div className="font-mono text-xs text-mist-500">{e.period}</div>
                <div className="mt-1 font-display text-lg font-semibold text-mist-100">
                  {e.role} <span className="font-medium text-azure-300">· {e.company}</span>
                </div>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-mist-300">
                  {renderOutcome(e.outcome, e.highlights)}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* projects */}
      <section id="projects" className="space-y-8">
        <Reveal>
          <SectionHeader index="02" kicker="Shipped & measured" title="Projects" />
        </Reveal>
        <div className="space-y-16">
          {projects.map((p, i) => {
            const Demo = PROJECT_DEMOS[p.slug];
            const flip = i % 2 === 1;
            return (
              <Reveal key={p.slug} delay={i * 60}>
                <div
                  className={`grid items-center gap-6 lg:gap-10 ${
                    Demo ? (flip ? "md:grid-cols-[1fr_1.2fr]" : "md:grid-cols-[1.2fr_1fr]") : ""
                  }`}
                >
                  {/* demo first in the DOM so mobile stacks demo-on-top */}
                  {Demo && (
                    <div className={`min-w-0 ${flip ? "md:order-2" : ""}`}>
                      <Demo />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-display text-xl font-semibold text-mist-100">{p.title}</h3>
                    <div className="mt-3 space-y-2 text-sm leading-relaxed">
                      <p className="text-mist-400">
                        <span className="font-mono text-xs font-medium tracking-wide text-rose-400/90 uppercase">
                          Problem ·{" "}
                        </span>
                        {p.problem}
                      </p>
                      <p className="text-mist-400">
                        <span className="font-mono text-xs font-medium tracking-wide text-azure-400/90 uppercase">
                          Built ·{" "}
                        </span>
                        {p.action}
                      </p>
                      <p className="text-mist-300">
                        <span className="font-mono text-xs font-medium tracking-wide text-emerald-400/90 uppercase">
                          Result ·{" "}
                        </span>
                        {p.result}
                      </p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {p.metrics.map((m) => (
                        <span
                          key={m.label}
                          className="rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1 font-mono text-xs"
                        >
                          <span className="text-mist-500">{m.label}: </span>
                          <span className="text-emerald-400">{m.value}</span>
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                      {p.links.caseStudy && (
                        <Link
                          href={p.links.caseStudy}
                          className="text-sm font-medium text-azure-400 transition-colors hover:text-azure-300"
                        >
                          Read the case study →
                        </Link>
                      )}
                      {p.links.repo && (
                        <a
                          href={p.links.repo}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-mist-400 transition-colors hover:text-mist-200"
                        >
                          GitHub ↗
                        </a>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-ink-700 px-2 py-0.5 text-[11px] text-mist-500"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* skills */}
      <section id="skills" className="space-y-8">
        <Reveal>
          <SectionHeader index="03" kicker="Toolbox" title="Skills" />
        </Reveal>
        <Reveal>
          <div className="grid gap-4 sm:grid-cols-3">
            {skills.map((g) => (
              <div key={g.group} className="panel p-5">
                <div className="kicker">{g.group}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {g.items.map((s) => (
                    <span
                      key={s}
                      className="rounded-md border border-ink-700 bg-ink-900 px-2.5 py-1 text-xs text-mist-300"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* contact */}
      <section id="contact" className="pb-6">
        <Reveal>
          <div className="panel relative overflow-hidden p-10 text-center">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(60% 80% at 50% 0%, rgb(47 127 232 / 0.14), transparent 70%)",
              }}
            />
            <h2 className="relative font-display text-3xl font-semibold text-mist-100">
              Let&apos;s work together
            </h2>
            <p className="relative mx-auto mt-2 max-w-md text-sm text-mist-400">
              {site.availability} — {site.remote}.
            </p>
            <div className="relative">
              <ContactForm />
            </div>
            <div className="relative mt-8 font-mono text-[11px] tracking-[0.18em] text-mist-500 uppercase">
              or reach me directly
            </div>
            <div className="relative mt-4 flex flex-wrap justify-center gap-3">
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  {...(s.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-600 text-mist-400 transition-colors hover:border-azure-400/60 hover:text-azure-300"
                >
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
                    {s.paths.map((d) => (
                      <path key={d} d={d} />
                    ))}
                  </svg>
                </a>
              ))}
            </div>
            <p className="relative mt-5 text-xs text-mist-500">
              or{" "}
              <a
                href={site.cvPath}
                download
                className="text-mist-300 underline decoration-ink-600 underline-offset-4 transition-colors hover:text-mist-100"
              >
                download my CV
              </a>
            </p>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

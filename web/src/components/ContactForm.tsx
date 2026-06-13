"use client";

// Contact form posting to Formspree (site.formspreeId). While the ID is empty
// the form still renders; submissions fail into the error state, which always
// offers the mailto fallback.

import { useState } from "react";

import { site } from "@/data/portfolio";

type Status = "idle" | "submitting" | "success" | "error";

const inputClasses =
  "w-full rounded-lg border border-ink-600 bg-ink-900 px-3.5 py-2.5 text-sm text-mist-200 " +
  "placeholder:text-mist-500 focus:border-azure-400/60 focus:outline-none";

export default function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    try {
      const res = await fetch(`https://formspree.io/f/${site.formspreeId}`, {
        method: "POST",
        body: new FormData(e.currentTarget),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Formspree responded ${res.status}`);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <p className="mx-auto mt-6 max-w-md text-sm text-emerald-400">
        ✓ Thanks — your message is on its way. I&apos;ll get back to you within a day.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-6 flex max-w-md flex-col gap-3 text-left">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input name="name" type="text" required placeholder="Your name" className={inputClasses} />
        <input name="email" type="email" required placeholder="Your email" className={inputClasses} />
      </div>
      <textarea
        name="message"
        required
        rows={4}
        placeholder="What are you building?"
        className={inputClasses}
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-lg bg-azure-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition-all hover:bg-azure-400 hover:shadow-[0_0_24px_rgb(92_165_247/0.35)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "submitting" ? "Sending…" : "Send message"}
      </button>
      {status === "error" && (
        <p className="text-sm text-rose-400">
          Something went wrong —{" "}
          <a href={`mailto:${site.email}`} className="underline hover:text-rose-300">
            email me instead
          </a>
          .
        </p>
      )}
    </form>
  );
}

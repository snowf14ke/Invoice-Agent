// All portfolio-page content lives here. Adding the next project = appending
// one object to `projects` (and a repo/case-study link if it has one).

export const site = {
  name: "Munkhtsetseg Davaadorj",
  tagline: "AI engineer — production RAG, OCR, evals",
  location: "Ulaanbaatar, Mongolia",
  remote: "Remote · UTC+8",
  availability: "Open to remote & contract work",
  email: "davaa3333@gmail.com",
  github: "https://github.com/snowf14ke",
  cvPath: "/cv/Munkhtsetseg-Davaadorj-CV.pdf",
  socials: {
    linkedin: "https://www.linkedin.com/in/davaadorj-munkhtsetseg-479b69237/",
    instagram: "https://www.instagram.com/8nowfake",
    facebook: "https://www.facebook.com/davaadorz.m.2025",
  },
  // Formspree form ID (formspree.io) — while empty, the contact form renders
  // but submissions land in the error state with a mailto fallback.
  formspreeId: "",
};

// Exact substrings of `outcome`, emphasized at render time.
// azure = measured metric, emerald = shipped-to-production phrase.
export type Highlight = { text: string; tone: "azure" | "emerald" };

export type Experience = {
  company: string;
  role: string;
  period: string;
  outcome: string;
  highlights?: Highlight[];
};

export const experience: Experience[] = [
  {
    company: "Steppelink Holding",
    role: "DevOps Engineer",
    period: "Jul 2025 — present",
    outcome:
      "Took Mongolian-script document AI from research to a production endpoint: fine-tuned TrOCR for script recognition and built an mT5 seq2seq for bichig → Cyrillic — pruned unused token weights 600M → 43M params for up to 5× faster inference.",
    highlights: [
      { text: "production endpoint", tone: "emerald" },
      { text: "600M → 43M params", tone: "azure" },
      { text: "up to 5× faster", tone: "azure" },
    ],
  },
  {
    company: "Chimege",
    role: "AI Engineer",
    period: "Feb 2025 — May 2025",
    outcome:
      "Shipped RAG over vector databases, fine-tuned multilingual translation models (MADLAD), and integrated STT/TTS with a Cruzr robot in Kotlin.",
    highlights: [
      { text: "RAG over vector databases", tone: "emerald" },
      { text: "STT/TTS", tone: "azure" },
    ],
  },
  {
    company: "Virtual Plus",
    role: "AI Engineer / AIOps",
    period: "Jun 2024 — Feb 2025",
    outcome:
      "Deployed PyTorch TTS and lip-sync models on AWS SageMaker in Docker; optimized real-time inference with FastAPI and ran Jenkins CI/CD.",
    highlights: [
      { text: "AWS SageMaker", tone: "azure" },
      { text: "real-time inference", tone: "emerald" },
    ],
  },
  {
    company: "Cloudbridge",
    role: "Game Developer",
    period: "Aug 2023 — Feb 2024",
    outcome: "Built game mechanics and performance optimizations.",
  },
  {
    company: "MetaForce LLC",
    role: "Game Developer",
    period: "Sep 2022 — May 2023",
    outcome: "Implemented core game features and collaborated on game design systems.",
  },
];

export type Project = {
  slug: string;
  title: string;
  problem: string;
  action: string;
  result: string;
  metrics: { label: string; value: string }[];
  tags: string[];
  links: { caseStudy?: string; repo?: string };
};

export const projects: Project[] = [
  {
    slug: "invoice-agent",
    title: "Invoice-Agent — document intelligence, measured honestly",
    problem:
      "Piles of scanned invoices are unsearchable: OCR noise, no structure, no way to ask questions across them.",
    action:
      "Built the full pipeline — serverless GPU OCR → typed LLM extraction → Postgres/pgvector → tool-calling agent — gated by a 77-question eval harness with an independent judge.",
    result:
      "Hybrid retrieval (full-text + vector + RRF) lifted hit@5 0.29 → 0.97 and MRR 0.23 → 0.94; every claim on the case study is read from a frozen eval snapshot.",
    metrics: [
      { label: "hit@5", value: "0.29 → 0.97" },
      { label: "MRR", value: "0.23 → 0.94" },
      { label: "faithfulness", value: "0.88" },
    ],
    tags: ["RAG", "LangGraph", "pgvector", "Evals", "FastAPI", "RunPod"],
    links: { caseStudy: "/invoice-agent", repo: "https://github.com/snowf14ke/Invoice-Agent" },
  },
  {
    slug: "bichig-ocr",
    title: "Mongolian script OCR & transliteration",
    problem:
      "Traditional Mongolian script (bichig) has almost no usable OCR or conversion tooling, and the off-the-shelf models are too big to serve cheaply.",
    action:
      "Fine-tuned TrOCR (base-stage1) for Mongolian script recognition and an mT5 seq2seq for bichig → Cyrillic, then pruned mT5's unused token weights — 600M → 43M parameters — and shipped both as a production endpoint.",
    result:
      "~14× smaller transliteration model with up to 5× faster inference, serving in production at Steppelink.",
    metrics: [
      { label: "params", value: "600M → 43M" },
      { label: "inference", value: "up to 5× faster" },
    ],
    tags: ["TrOCR", "mT5", "Fine-tuning", "Model pruning"],
    links: {},
  },
  {
    slug: "tts-lipsync",
    title: "Real-time TTS & lip-sync platform",
    problem: "Virtual humans need speech and matching lip motion generated in real time.",
    action:
      "Deployed PyTorch TTS and lip-sync models on AWS SageMaker in Docker containers and tuned the serving path (FastAPI, Uvicorn, Gunicorn) for real-time inference.",
    result: "Production real-time inference with Jenkins CI/CD, shipped at Virtual Plus.",
    metrics: [{ label: "inference", value: "real-time" }],
    tags: ["PyTorch", "SageMaker", "Docker", "FastAPI"],
    links: {},
  },
];

export const skills: { group: string; items: string[] }[] = [
  { group: "ML & AI", items: ["PyTorch", "RAG", "Vector DBs", "Fine-tuning", "Model compression", "TTS/STT", "Evals"] },
  { group: "MLOps & DevOps", items: ["AWS SageMaker", "Docker", "Jenkins CI/CD", "FastAPI", "RunPod serverless", "Supabase/Postgres"] },
  { group: "Languages", items: ["Python", "TypeScript", "C#", "Kotlin", "SQL"] },
];

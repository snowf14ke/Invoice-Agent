// Animated SVG pipeline: dashed connectors drift (CSS), packets travel the
// data paths (SMIL animateMotion), nodes carry a breathing status dot.
// All motion is disabled under prefers-reduced-motion in globals.css.

const INK_850 = "#0d1526";
const INK_700 = "#1b2942";
const INK_600 = "#2a3d61";
const MIST_100 = "#e9f0f9";
const MIST_400 = "#7e93b4";
const MIST_500 = "#5d7191";
const AZURE = "#5ca5f7";
const EMERALD = "#34d399";

function Node({
  x,
  y,
  w,
  title,
  sub,
  dot = AZURE,
}: {
  x: number;
  y: number;
  w: number;
  title: string;
  sub: string;
  dot?: string;
}) {
  const cx = x + w / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={64} rx={10} fill={INK_850} stroke={INK_700} />
      <circle className="node-pulse" cx={x + 14} cy={y + 14} r={3} fill={dot} />
      <text
        x={cx}
        y={y + 30}
        textAnchor="middle"
        fontSize={13}
        fontWeight={600}
        fill={MIST_100}
      >
        {title}
      </text>
      <text
        x={cx}
        y={y + 47}
        textAnchor="middle"
        fontSize={10.5}
        fill={MIST_400}
        fontFamily="var(--font-plex-mono), monospace"
      >
        {sub}
      </text>
    </g>
  );
}

function Packet({ path, dur, begin = "0s" }: { path: string; dur: string; begin?: string }) {
  return (
    <circle className="anim-dot" r={3.5} fill={AZURE}>
      <animateMotion dur={dur} begin={begin} repeatCount="indefinite" path={path} />
    </circle>
  );
}

export default function ArchDiagram() {
  return (
    <div className="panel overflow-x-auto p-4">
      <svg
        viewBox="0 0 920 344"
        className="w-full min-w-[720px]"
        role="img"
        aria-labelledby="arch-title"
      >
        <title id="arch-title">
          Pipeline: document image → OCR → typed extraction → Postgres, queried by a LangGraph
          agent through three tools, answered with sources; everything gated by the eval harness
        </title>
        <defs>
          <marker id="arr" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" fill={INK_600} />
          </marker>
        </defs>

        {/* ingest row */}
        <Node x={16} y={28} w={192} title="Document image" sub="invoices / receipts" />
        <Node x={248} y={28} w={192} title="PaddleOCR-VL" sub="RunPod serverless GPU" />
        <Node x={480} y={28} w={192} title="Typed extraction" sub="instructor + Pydantic" />
        <Node x={712} y={28} w={192} title="Postgres + pgvector" sub="fields · line items · chunks" />

        <line className="pipe-link" x1={208} y1={60} x2={246} y2={60} stroke={INK_600} strokeWidth={1.5} markerEnd="url(#arr)" />
        <line className="pipe-link" x1={440} y1={60} x2={478} y2={60} stroke={INK_600} strokeWidth={1.5} markerEnd="url(#arr)" />
        <line className="pipe-link" x1={672} y1={60} x2={710} y2={60} stroke={INK_600} strokeWidth={1.5} markerEnd="url(#arr)" />

        {/* db feeds the agent's tools */}
        <path className="pipe-link" d="M808,92 V146 H470 V196" fill="none" stroke={INK_600} strokeWidth={1.5} markerEnd="url(#arr)" />
        <Packet path="M808,92 V146 H470 V196" dur="2.6s" />

        {/* agent row */}
        <text x={20} y={224} fontSize={10.5} fill={MIST_500} fontFamily="var(--font-plex-mono), monospace">
          user
        </text>
        <text x={20} y={238} fontSize={10.5} fill={MIST_500} fontFamily="var(--font-plex-mono), monospace">
          question
        </text>
        <line className="pipe-link" x1={78} y1={232} x2={108} y2={232} stroke={INK_600} strokeWidth={1.5} markerEnd="url(#arr)" />

        <Node x={110} y={200} w={200} title="LangGraph agent" sub="ReAct loop" dot={EMERALD} />
        <Node x={370} y={200} w={200} title="3 tools" sub="SQL · search · consistency" />
        <Node x={630} y={200} w={200} title="Answer + sources" sub="served by FastAPI" dot={EMERALD} />

        <line className="pipe-link" x1={310} y1={232} x2={368} y2={232} stroke={INK_600} strokeWidth={1.5} markerEnd="url(#arr)" />
        <line className="pipe-link" x1={570} y1={232} x2={628} y2={232} stroke={INK_600} strokeWidth={1.5} markerEnd="url(#arr)" />
        <Packet path="M310,232 H368" dur="1.6s" />
        <Packet path="M570,232 H628" dur="1.6s" begin="0.8s" />

        {/* eval gate across everything */}
        <rect x={16} y={296} width={888} height={36} rx={9} fill="none" stroke={INK_600} strokeDasharray="5 4" />
        <circle className="node-pulse" cx={34} cy={314} r={3} fill={EMERALD} />
        <text
          x={460}
          y={318}
          textAnchor="middle"
          fontSize={11}
          fill={MIST_500}
          fontFamily="var(--font-plex-mono), monospace"
        >
          Ragas eval + judge-free retrieval metrics — frozen per version in evals/, gated in CI
        </text>
      </svg>
    </div>
  );
}

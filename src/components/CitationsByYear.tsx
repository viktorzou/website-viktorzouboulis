import { useEffect, useMemo, useState } from "react";

export type CitationPaperPoint = {
  year: number;
  citations: number;
  tags: string[];
};

type Props = {
  papers: CitationPaperPoint[];
};

function readFilters() {
  if (typeof window === "undefined")
    return { tag: null as string | null, year: null as string | null };
  const params = new URLSearchParams(window.location.search);
  return { tag: params.get("tag"), year: params.get("year") };
}

function yearFilterHref(nextYear: number | null, tag: string | null) {
  const params = new URLSearchParams();
  if (tag) params.set("tag", tag);
  if (nextYear != null) params.set("year", String(nextYear));
  const q = params.toString();
  return (q ? `/research/?${q}` : "/research/") + "#citations-by-year";
}

export default function CitationsByYear({ papers }: Props) {
  const [tag, setTag] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);

  useEffect(() => {
    function sync() {
      const f = readFilters();
      setTag(f.tag);
      setYear(f.year);
    }
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  // Bars show all years (tag filter only) so every year stays clickable
  const series = useMemo(() => {
    const filtered = papers.filter(
      (p) =>
        !tag ||
        p.tags.some((t) => t.toLowerCase() === tag.toLowerCase()),
    );

    const byYear = new Map<number, { citations: number; papers: number }>();
    for (const p of filtered) {
      const cur = byYear.get(p.year) ?? { citations: 0, papers: 0 };
      cur.citations += p.citations;
      cur.papers += 1;
      byYear.set(p.year, cur);
    }

    return [...byYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([y, v]) => ({ year: y, ...v }));
  }, [papers, tag]);

  const maxCites = Math.max(...series.map((s) => s.citations), 1);
  const visible = year
    ? series.filter((s) => String(s.year) === year)
    : series;
  const totalCites = visible.reduce((a, s) => a + s.citations, 0);
  const totalPapers = visible.reduce((a, s) => a + s.papers, 0);

  const W = 640;
  const H = 220;
  const padL = 36;
  const padR = 16;
  const padT = 20;
  const padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const gap = 8;
  const barW =
    series.length > 0
      ? Math.min(48, (plotW - gap * (series.length - 1)) / series.length)
      : 0;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden border border-ink/10 dark:border-paper/10">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full bg-paper/40 dark:bg-charcoal/40"
          role="img"
          aria-label="Citations by publication year — click a bar to filter by year"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = padT + plotH * (1 - t);
            const val = Math.round(maxCites * t);
            return (
              <g key={t}>
                <line
                  x1={padL}
                  y1={y}
                  x2={W - padR}
                  y2={y}
                  stroke="currentColor"
                  className="text-ink/10 dark:text-paper/10"
                  strokeWidth={1}
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-muted"
                  style={{ fontSize: 9 }}
                >
                  {val}
                </text>
              </g>
            );
          })}

          {series.map((s, i) => {
            const h = (s.citations / maxCites) * plotH;
            const x =
              padL +
              i * (barW + gap) +
              Math.max(
                0,
                (plotW - series.length * barW - (series.length - 1) * gap) / 2,
              );
            const y = padT + plotH - h;
            const active = year === String(s.year);
            const dimmed = Boolean(year) && !active;
            const href = yearFilterHref(active ? null : s.year, tag);
            return (
              <a
                key={s.year}
                href={href}
                className="cursor-pointer"
                aria-label={
                  active
                    ? `Clear year filter ${s.year}`
                    : `Filter papers to ${s.year}`
                }
              >
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(h, s.citations > 0 ? 2 : 0)}
                  fill="#0F766E"
                  fillOpacity={dimmed ? 0.2 : active ? 1 : 0.85}
                  stroke={active ? "#0F766E" : "transparent"}
                  strokeWidth={active ? 1.5 : 0}
                >
                  <title>
                    {active ? "click to clear · " : "click to filter · "}
                    {s.year}: {s.citations} citation
                    {s.citations === 1 ? "" : "s"} · {s.papers} paper
                    {s.papers === 1 ? "" : "s"}
                  </title>
                </rect>
                {/* hit area for short bars */}
                <rect
                  x={x}
                  y={padT}
                  width={barW}
                  height={plotH}
                  fill="transparent"
                />
                <text
                  x={x + barW / 2}
                  y={H - 14}
                  textAnchor="middle"
                  className={active ? "fill-accent" : "fill-muted"}
                  style={{ fontSize: 10, fontWeight: active ? 500 : 400 }}
                >
                  {s.year}
                </text>
                {s.citations > 0 && h > 16 && (
                  <text
                    x={x + barW / 2}
                    y={y - 4}
                    textAnchor="middle"
                    className="fill-current text-ink dark:text-paper"
                    style={{
                      fontSize: 9,
                      fontWeight: 500,
                      opacity: dimmed ? 0.35 : 1,
                    }}
                  >
                    {s.citations}
                  </text>
                )}
              </a>
            );
          })}

          {series.length === 0 && (
            <text
              x={W / 2}
              y={H / 2}
              textAnchor="middle"
              className="fill-muted"
              style={{ fontSize: 11 }}
            >
              no papers match this filter
            </text>
          )}
        </svg>
      </div>
      <p className="font-mono text-xs text-muted">
        <span className="text-accent">›</span> {totalCites} citation
        {totalCites === 1 ? "" : "s"} across {totalPapers} paper
        {totalPapers === 1 ? "" : "s"}
        {(tag || year) && (
          <span>
            {" "}
            · filtered
            {year ? ` year:${year}` : ""}
            {tag ? ` tag:${tag}` : ""}
          </span>
        )}
        {" · "}
        click a bar to filter by year
      </p>
    </div>
  );
}

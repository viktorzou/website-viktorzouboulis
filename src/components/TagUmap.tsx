import { useMemo, useState } from "react";

export type TagUmapPoint = {
  tag: string;
  count: number;
  href: string;
  x: number;
  y: number;
  cluster: number;
};

export type TagUmapIsland = {
  id: number;
  label: string;
  color: string;
  size: number;
  x: number;
  y: number;
};

export type TagUmapData = {
  generatedAt: string;
  model: string;
  islands: TagUmapIsland[];
  points: TagUmapPoint[];
};

type Props = {
  data: TagUmapData;
};

export default function TagUmap({ data }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const [activeIsland, setActiveIsland] = useState<number | null>(null);

  const maxCount = useMemo(
    () => Math.max(...data.points.map((p) => p.count), 1),
    [data.points],
  );

  const islandById = useMemo(() => {
    const m = new Map<number, TagUmapIsland>();
    for (const island of data.islands) m.set(island.id, island);
    return m;
  }, [data.islands]);

  const W = 720;
  const H = 480;
  const pad = 28;

  function sx(x: number) {
    return pad + x * (W - 2 * pad);
  }
  function sy(y: number) {
    // flip Y so "up" feels natural
    return pad + (1 - y) * (H - 2 * pad);
  }

  function radius(count: number) {
    const t = count / maxCount;
    return 4 + t * 10;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs text-muted">
        {data.islands.map((island) => {
          const active = activeIsland === island.id;
          return (
            <button
              key={island.id}
              type="button"
              onClick={() =>
                setActiveIsland(active ? null : island.id)
              }
              className={`border px-2 py-1 text-left transition-colors ${
                active
                  ? "border-accent text-accent"
                  : "border-ink/10 hover:border-accent hover:text-accent dark:border-paper/10"
              }`}
              style={{ borderColor: active ? undefined : `${island.color}55` }}
            >
              <span
                className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                style={{ backgroundColor: island.color }}
                aria-hidden
              />
              {island.label}
              <span className="ml-2 text-muted/70">{island.size}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto border border-ink/10 dark:border-paper/10">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[320px] bg-paper/40 dark:bg-charcoal/40"
          role="img"
          aria-label="UMAP projection of site tags"
        >
          {data.islands.map((island) => (
            <text
              key={`label-${island.id}`}
              x={sx(island.x)}
              y={sy(island.y) - 14}
              textAnchor="middle"
              className="fill-muted"
              style={{
                fontSize: 10,
                opacity:
                  activeIsland == null || activeIsland === island.id ? 0.9 : 0.25,
              }}
            >
              {island.label.length > 42
                ? `${island.label.slice(0, 40)}…`
                : island.label}
            </text>
          ))}

          {data.points.map((p) => {
            const island = islandById.get(p.cluster);
            const color = island?.color ?? "#64748B";
            const dim =
              activeIsland != null && activeIsland !== p.cluster;
            const isHover = hover === p.tag;
            const r = radius(p.count) * (isHover ? 1.25 : 1);
            return (
              <a key={p.tag} href={p.href}>
                <circle
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={r}
                  fill={color}
                  fillOpacity={dim ? 0.18 : isHover ? 0.95 : 0.72}
                  stroke={isHover ? color : "transparent"}
                  strokeWidth={isHover ? 2 : 0}
                  onMouseEnter={() => setHover(p.tag)}
                  onMouseLeave={() => setHover(null)}
                >
                  <title>
                    {`${p.tag} · ${p.count}× · ${island?.label ?? ""}`}
                  </title>
                </circle>
              </a>
            );
          })}

          {hover &&
            (() => {
              const p = data.points.find((x) => x.tag === hover);
              if (!p) return null;
              return (
                <text
                  x={sx(p.x)}
                  y={sy(p.y) + radius(p.count) + 14}
                  textAnchor="middle"
                  className="fill-current text-ink dark:text-paper"
                  style={{ fontSize: 11, fontWeight: 500 }}
                >
                  {p.tag}
                </text>
              );
            })()}
        </svg>
      </div>

      <p className="text-xs text-muted">
        Local {data.model} embeddings → UMAP → clustered islands (top tags as
        names). Dot size ∝ frequency. Click a point to filter; chip toggles an
        island.
      </p>
    </div>
  );
}

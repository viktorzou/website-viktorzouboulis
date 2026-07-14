import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";

export type CoauthorGraphNode = {
  id: string;
  kind: "hub" | "person" | "author" | "paper" | "journal";
  label: string;
  href: string;
  meta?: string;
  year?: number;
  /** OpenAlex citations — sizes paper nodes */
  citations?: number;
  /** Journal impact (OpenAlex 2yr mean citedness ≈ IF) — sizes journal nodes */
  impactFactor?: number;
  /** Paper tags — used with research page ?tag= / ?year= filters */
  tags?: string[];
};

export type CoauthorGraphEdge = {
  from: string;
  to: string;
  /** authorship · coauthor · journal · cites (paper→paper) */
  relation: "authorship" | "coauthor" | "journal" | "cites";
  weight?: number;
};

type Props = {
  nodes: CoauthorGraphNode[];
  edges: CoauthorGraphEdge[];
};

type SimNode = CoauthorGraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode> & {
  relation: CoauthorGraphEdge["relation"];
  weight: number;
};

function readResearchFilters() {
  if (typeof window === "undefined") {
    return { tag: null as string | null, year: null as string | null };
  }
  const params = new URLSearchParams(window.location.search);
  return { tag: params.get("tag"), year: params.get("year") };
}

function filterGraph(
  nodes: CoauthorGraphNode[],
  edges: CoauthorGraphEdge[],
  tag: string | null,
  year: string | null,
) {
  if (!tag && !year) return { nodes, edges };

  const paperIds = new Set(
    nodes
      .filter((n) => {
        if (n.kind !== "paper") return false;
        const tagOk =
          !tag ||
          (n.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase());
        const yearOk = !year || String(n.year) === year;
        return tagOk && yearOk;
      })
      .map((n) => n.id),
  );

  const keptIds = new Set<string>(paperIds);
  const keptEdges: CoauthorGraphEdge[] = [];

  for (const e of edges) {
    if (e.relation === "authorship" || e.relation === "journal") {
      if (paperIds.has(e.from) || paperIds.has(e.to)) {
        keptEdges.push(e);
        keptIds.add(e.from);
        keptIds.add(e.to);
      }
    }
  }

  for (const e of edges) {
    if (e.relation === "cites" && paperIds.has(e.from) && paperIds.has(e.to)) {
      keptEdges.push(e);
    }
  }

  for (const e of edges) {
    if (
      e.relation === "coauthor" &&
      keptIds.has(e.from) &&
      keptIds.has(e.to)
    ) {
      keptEdges.push(e);
    }
  }

  return {
    nodes: nodes.filter((n) => keptIds.has(n.id)),
    edges: keptEdges,
  };
}

const KIND_COLOR: Record<CoauthorGraphNode["kind"], string> = {
  hub: "#0F766E",
  person: "#475569",
  author: "#94A3B8",
  paper: "#B45309",
  journal: "#0E7490",
};

const RELATION_STROKE: Record<CoauthorGraphEdge["relation"], string> = {
  authorship: "#6B6B63",
  coauthor: "#7C3AED",
  journal: "#0E7490",
  cites: "#BE123C",
};

const W = 720;
const H = 560;
const VIEW_PAD = 36;
const TRANSITION = "opacity 180ms ease";

function radius(
  n: Pick<CoauthorGraphNode, "kind" | "citations" | "impactFactor">,
  linkWeight = 1,
) {
  if (n.kind === "hub") return 8;
  if (n.kind === "paper") {
    // Log scale so highly cited papers grow without dominating.
    const c = Math.max(n.citations ?? 0, 0);
    return 3.2 + Math.min(Math.log1p(c) * 1.45, 9);
  }
  if (n.kind === "journal") {
    const ifactor = Math.max(n.impactFactor ?? 0, 0);
    return 4 + Math.min(Math.log1p(ifactor) * 2.2, 8);
  }
  if (n.kind === "author") return 2.85;
  return 5;
}

function collidePad(kind: CoauthorGraphNode["kind"]) {
  // Other-author dots can pack tightly inside coauthor bubbles.
  if (kind === "author") return 0.8;
  return 6;
}

/** Approximate half-width of the rendered label for framing. */
function labelExtent(kind: CoauthorGraphNode["kind"]) {
  if (kind === "author") return { halfW: 0, below: 0 };
  if (kind === "paper") return { halfW: 48, below: 14 };
  if (kind === "journal") return { halfW: 44, below: 14 };
  if (kind === "hub") return { halfW: 42, below: 16 };
  return { halfW: 36, below: 14 };
}

/** Tight viewBox around nodes — max zoom that still shows labels. */
function fitViewBox(
  nodes: SimNode[],
  deg: Map<string, number>,
): string {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    if (n.x == null || n.y == null) continue;
    const r = radius(n, deg.get(n.id) ?? 1);
    const { halfW, below } = labelExtent(n.kind);
    minX = Math.min(minX, n.x - Math.max(r, halfW));
    maxX = Math.max(maxX, n.x + Math.max(r, halfW));
    minY = Math.min(minY, n.y - r);
    maxY = Math.max(maxY, n.y + r + below);
  }
  if (!Number.isFinite(minX)) return `0 0 ${W} ${H}`;
  const w = Math.max(maxX - minX, 40) + VIEW_PAD * 2;
  const h = Math.max(maxY - minY, 40) + VIEW_PAD * 2;
  return `${minX - VIEW_PAD} ${minY - VIEW_PAD} ${w} ${h}`;
}

export default function CoauthorGraph({ nodes, edges }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const [focusKind, setFocusKind] = useState<CoauthorGraphNode["kind"] | null>(
    null,
  );
  const [focusRelation, setFocusRelation] = useState<
    CoauthorGraphEdge["relation"] | null
  >(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);

  useEffect(() => {
    function sync() {
      const f = readResearchFilters();
      setFilterTag(f.tag);
      setFilterYear(f.year);
    }
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const filtered = useMemo(
    () => filterGraph(nodes, edges, filterTag, filterYear),
    [nodes, edges, filterTag, filterYear],
  );

  const degree = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of filtered.edges) {
      m.set(e.from, (m.get(e.from) ?? 0) + 1);
      m.set(e.to, (m.get(e.to) ?? 0) + 1);
    }
    return m;
  }, [filtered.edges]);

  useEffect(() => {
    const simNodes: SimNode[] = filtered.nodes.map((n, i) => {
      const angle = (i / Math.max(filtered.nodes.length, 1)) * Math.PI * 2;
      const r = 50 + (i % 5) * 16;
      return {
        ...n,
        x: W / 2 + Math.cos(angle) * r,
        y: H / 2 + Math.sin(angle) * r,
      };
    });

    const simLinks: SimLink[] = filtered.edges
      .filter(
        (e) =>
          filtered.nodes.some((n) => n.id === e.from) &&
          filtered.nodes.some((n) => n.id === e.to),
      )
      .map((e) => ({
        source: e.from,
        target: e.to,
        relation: e.relation,
        weight: e.weight ?? 1,
      }));

    nodesRef.current = simNodes;
    linksRef.current = simLinks;

    const simulation = forceSimulation(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => {
            if (d.relation === "coauthor") {
              const s = d.source as SimNode;
              const t = d.target as SimNode;
              // Pack other-author dots in shared-paper bubbles.
              if (s.kind === "author" || t.kind === "author") {
                return Math.max(10, 18 - (d.weight - 1) * 2);
              }
              return Math.max(18, 52 - (d.weight - 1) * 7);
            }
            if (d.relation === "journal") return 72;
            if (d.relation === "cites") return 90;
            // authorship to a faceless author: keep the ring tight
            const s = d.source as SimNode;
            const t = d.target as SimNode;
            if (s.kind === "author" || t.kind === "author") return 28;
            return 64;
          })
          .strength((d) => {
            if (d.relation === "coauthor") {
              return Math.min(1, 0.4 + d.weight * 0.14);
            }
            if (d.relation === "journal") return 0.3;
            if (d.relation === "cites") return 0.45;
            return 0.35;
          }),
      )
      .force(
        "charge",
        forceManyBody<SimNode>().strength((d) =>
          d.kind === "author" ? -32 : -140,
        ),
      )
      .force("center", forceCenter(W / 2, H / 2).strength(0.08))
      .force(
        "collide",
        forceCollide<SimNode>().radius((d) =>
          radius(d, degree.get(d.id) ?? 1) + collidePad(d.kind),
        ),
      )
      .alphaDecay(0.03);

    simulation.on("tick", () => {
      setTick((t) => t + 1);
    });
    return () => {
      simulation.stop();
    };
  }, [filtered.nodes, filtered.edges, degree]);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of filtered.edges) {
      if (!m.has(e.from)) m.set(e.from, new Set());
      if (!m.has(e.to)) m.set(e.to, new Set());
      m.get(e.from)!.add(e.to);
      m.get(e.to)!.add(e.from);
    }
    return m;
  }, [filtered.edges]);

  const hoverNode = hover
    ? filtered.nodes.find((n) => n.id === hover) ?? null
    : null;

  void tick;
  const simNodes = nodesRef.current;
  const simLinks = linksRef.current;
  const viewBox = fitViewBox(simNodes, degree);

  function dimNode(id: string, kind: CoauthorGraphNode["kind"]) {
    if (focusKind && kind !== focusKind) return true;
    if (focusRelation) {
      const linked = filtered.edges.some(
        (e) =>
          e.relation === focusRelation && (e.from === id || e.to === id),
      );
      if (!linked) return true;
    }
    if (!hover) return false;
    if (id === hover) return false;
    return !neighbors.get(hover)?.has(id);
  }

  function dimEdge(from: string, to: string, relation: string) {
    if (focusRelation && relation !== focusRelation) return true;
    if (focusKind) {
      const a = filtered.nodes.find((n) => n.id === from);
      const b = filtered.nodes.find((n) => n.id === to);
      if (a?.kind !== focusKind && b?.kind !== focusKind) return true;
    }
    if (!hover) return false;
    return hover !== from && hover !== to;
  }

  const kindOrder = ["hub", "person", "author", "paper", "journal"] as const;
  const relationOrder = ["authorship", "coauthor", "journal", "cites"] as const;

  const pageFiltered = Boolean(filterTag || filterYear);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs text-muted">
        <span className="mr-1 self-center section-label">level</span>
        {kindOrder.map((kind) => {
          const active = focusKind === kind;
          const count = filtered.nodes.filter((n) => n.kind === kind).length;
          if (count === 0) return null;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => setFocusKind(active ? null : kind)}
              className={`border px-2 py-1 transition-colors duration-200 ${
                active
                  ? "border-accent text-accent"
                  : "border-ink/10 hover:border-accent hover:text-accent dark:border-paper/10"
              }`}
            >
              <span
                className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                style={{ backgroundColor: KIND_COLOR[kind] }}
                aria-hidden
              />
              {kind === "hub"
                ? "you"
                : kind === "author"
                  ? "other authors"
                  : kind}
              <span className="ml-2 text-muted/70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-muted">
        <span className="mr-1 self-center section-label">link</span>
        {relationOrder.map((relation) => {
          const active = focusRelation === relation;
          const count = filtered.edges.filter((e) => e.relation === relation).length;
          if (count === 0) return null;
          return (
            <button
              key={relation}
              type="button"
              onClick={() => setFocusRelation(active ? null : relation)}
              className={`border px-2 py-1 transition-colors duration-200 ${
                active
                  ? "border-accent text-accent"
                  : "border-ink/10 hover:border-accent hover:text-accent dark:border-paper/10"
              }`}
            >
              <span
                className="mr-2 inline-block h-0.5 w-3 align-middle"
                style={{ backgroundColor: RELATION_STROKE[relation] }}
                aria-hidden
              />
              {relation === "cites" ? "cites" : relation}
              <span className="ml-2 text-muted/70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden border border-ink/10 dark:border-paper/10">
        {filtered.nodes.length === 0 ? (
          <p className="px-4 py-16 text-center font-mono text-sm text-muted">
            no publications match this filter
          </p>
        ) : (
        <svg
          viewBox={viewBox}
          className="h-auto w-full bg-paper/40 dark:bg-charcoal/40"
          role="img"
          aria-label="Coauthor, journal, and citation network"
        >
          <defs>
            <marker
              id="cite-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#BE123C" fillOpacity="0.7" />
            </marker>
          </defs>

          {simLinks.map((link, i) => {
            const s = link.source as SimNode;
            const t = link.target as SimNode;
            if (s.x == null || t.x == null) return null;
            const active = hover === s.id || hover === t.id;
            const dim = dimEdge(s.id, t.id, link.relation);
            const stroke = RELATION_STROKE[link.relation];
            const isCite = link.relation === "cites";
            return (
              <line
                key={`${s.id}-${t.id}-${i}`}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke={active ? "#0F766E" : stroke}
                strokeOpacity={
                  dim ? 0.04 : active ? 0.9 : link.relation === "coauthor" ? 0.35 : 0.28
                }
                strokeWidth={
                  active
                    ? 1.8
                    : link.relation === "coauthor"
                      ? 1 + Math.min(link.weight, 6) * 0.5
                      : isCite
                        ? 1.4
                        : 1
                }
                strokeDasharray={
                  isCite ? "5 3" : link.relation === "journal" ? "3 2" : undefined
                }
                style={{ transition: TRANSITION }}
                markerEnd={isCite ? "url(#cite-arrow)" : undefined}
              />
            );
          })}

          {simNodes.map((node) => {
            const dim = dimNode(node.id, node.kind);
            const hot = hover === node.id;
            const deg = degree.get(node.id) ?? 1;
            const r = radius(node, deg) * (hot ? 1.25 : 1);
            const showLabel = node.kind !== "author";
            const maxLen =
              node.kind === "paper" ? 20 : node.kind === "journal" ? 18 : 14;
            const label =
              node.label.length > maxLen
                ? `${node.label.slice(0, maxLen - 1)}…`
                : node.label;
            if (node.x == null || node.y == null) return null;
            return (
              <a
                key={node.id}
                href={node.href}
                onMouseEnter={() => setHover(node.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(node.id)}
                onBlur={() => setHover(null)}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r}
                  fill={KIND_COLOR[node.kind]}
                  fillOpacity={dim ? 0.12 : hot ? 0.95 : 0.85}
                  stroke={node.kind === "hub" ? KIND_COLOR.hub : "transparent"}
                  strokeWidth={node.kind === "hub" ? 2 : 0}
                  style={{ transition: TRANSITION }}
                >
                  <title>
                    {[
                      node.label,
                      node.meta,
                      node.year,
                      node.kind === "paper" && node.citations != null
                        ? `cited ${node.citations}`
                        : null,
                      node.kind === "journal" && node.impactFactor != null
                        ? `IF ~ ${node.impactFactor.toFixed(1)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </title>
                </circle>
                {showLabel && (
                  <text
                    x={node.x}
                    y={(node.y ?? 0) + r + 9}
                    textAnchor="middle"
                    className="fill-current text-ink dark:text-paper"
                    style={{
                      fontSize: node.kind === "paper" ? 7.5 : 8.5,
                      opacity: dim ? 0.15 : 0.9,
                      fontWeight: node.kind === "hub" ? 500 : 400,
                      transition: TRANSITION,
                      pointerEvents: "none",
                    }}
                  >
                    {label}
                  </text>
                )}
              </a>
            );
          })}
        </svg>
        )}
      </div>

      <div
        className="border border-ink/10 px-3 py-3 font-mono text-xs dark:border-paper/10"
        aria-live="polite"
      >
        {hoverNode ? (
          <div className="space-y-1 transition-opacity duration-200">
            <p className="text-ink dark:text-paper">
              <span className="text-accent">›</span> {hoverNode.label}
              <span className="text-muted">
                {" "}
                ·{" "}
                {hoverNode.kind === "author"
                  ? "other author"
                  : hoverNode.kind}
              </span>
              {hoverNode.year != null && (
                <span className="text-muted"> · {hoverNode.year}</span>
              )}
            </p>
            {hoverNode.meta && <p className="text-muted">{hoverNode.meta}</p>}
            <p className="text-muted/70">
              {hoverNode.kind === "paper" && hoverNode.citations != null
                ? `cited ${hoverNode.citations} · `
                : ""}
              {hoverNode.kind === "journal" && hoverNode.impactFactor != null
                ? `IF ~ ${hoverNode.impactFactor.toFixed(1)} · `
                : ""}
              {degree.get(hoverNode.id) ?? 0} link
              {(degree.get(hoverNode.id) ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
        ) : (
          <p className="text-muted">
            <span className="text-accent">›</span> paper size ∝ citations ·
            journal size ∝ IF · other authors = dots only · rose dashed = cites
            {pageFiltered && (
              <span>
                {" "}
                · filtered
                {filterYear ? ` year:${filterYear}` : ""}
                {filterTag ? ` tag:${filterTag}` : ""}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

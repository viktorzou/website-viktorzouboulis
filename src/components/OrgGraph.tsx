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

export type OrgGraphPaper = {
  title: string;
  year: number;
  href: string;
};

export type OrgGraphNode = {
  id: string;
  kind: "hub" | "institution" | "department" | "lab" | "person" | "company";
  label: string;
  href: string;
  meta?: string;
  role?: string;
  affiliation?: string;
  papers?: OrgGraphPaper[];
};

export type OrgGraphEdge = {
  from: string;
  to: string;
  /** org tree · hub · supervisor · cross · labmate · coauthor */
  relation?: "org" | "hub" | "supervisor" | "cross" | "labmate" | "coauthor";
  weight?: number;
};

type Props = {
  nodes: OrgGraphNode[];
  edges: OrgGraphEdge[];
};

type SimNode = OrgGraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode> & {
  relation: NonNullable<OrgGraphEdge["relation"]>;
  weight: number;
};

const KIND_COLOR: Record<OrgGraphNode["kind"], string> = {
  hub: "#0F766E",
  institution: "#0F766E",
  department: "#0E7490",
  lab: "#B45309",
  company: "#1D4ED8",
  person: "#475569",
};

const RELATION_STYLE: Record<
  NonNullable<OrgGraphEdge["relation"]>,
  { stroke: string; dash?: string; label: string }
> = {
  org: { stroke: "#6B6B63", label: "org" },
  hub: { stroke: "#0F766E", dash: "5 3", label: "hub" },
  supervisor: { stroke: "#BE123C", dash: "6 2", label: "supervisor" },
  cross: { stroke: "#6B6B63", dash: "2 3", label: "cross" },
  labmate: { stroke: "#B45309", dash: "4 2", label: "labmate" },
  coauthor: { stroke: "#7C3AED", label: "coauthor" },
};

const TRANSITION = "opacity 180ms ease";
const W = 720;
const H = 520;
const PAD = 28;

function radius(kind: OrgGraphNode["kind"]) {
  if (kind === "hub") return 8;
  if (kind === "institution") return 6;
  if (kind === "person") return 4.5;
  return 5.5;
}

function clampNode(n: SimNode) {
  const r = radius(n.kind);
  const labelPad = 14;
  n.x = Math.max(PAD + r, Math.min(W - PAD - r, n.x ?? W / 2));
  n.y = Math.max(PAD + r, Math.min(H - PAD - r - labelPad, n.y ?? H / 2));
}

export default function OrgGraph({ nodes, edges }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const [focusKind, setFocusKind] = useState<OrgGraphNode["kind"] | null>(null);
  const [focusRelation, setFocusRelation] = useState<
    NonNullable<OrgGraphEdge["relation"]> | null
  >(null);
  const [tick, setTick] = useState(0);
  const simRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(
    null,
  );
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);

  const linkData = useMemo(() => {
    return edges
      .filter((e) => nodes.some((n) => n.id === e.from) && nodes.some((n) => n.id === e.to))
      .map((e) => ({
        source: e.from,
        target: e.to,
        relation: e.relation ?? "org",
        weight: e.weight ?? 1,
      }));
  }, [nodes, edges]);

  useEffect(() => {
    const simNodes: SimNode[] = nodes.map((n, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
      const r = 40 + (i % 7) * 12;
      return {
        ...n,
        x: W / 2 + Math.cos(angle) * r,
        y: H / 2 + Math.sin(angle) * r,
      };
    });

    const simLinks: SimLink[] = linkData.map((l) => ({
      ...l,
      relation: l.relation as NonNullable<OrgGraphEdge["relation"]>,
      weight: l.weight,
    }));

    nodesRef.current = simNodes;
    linksRef.current = simLinks;

    const simulation = forceSimulation(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => {
            // More shared papers → shorter spring (count saturates at 6).
            if (d.relation === "coauthor") {
              return Math.max(20, 58 - (d.weight - 1) * 8);
            }
            if (d.relation === "labmate") return 44;
            if (d.relation === "supervisor") return 58;
            if (d.relation === "hub") return 90;
            if (d.relation === "org") return 70;
            return 100;
          })
          .strength((d) => {
            if (d.relation === "coauthor") {
              return Math.min(1, 0.42 + d.weight * 0.14);
            }
            if (d.relation === "labmate") return 0.4;
            if (d.relation === "supervisor") return 0.5;
            if (d.relation === "org") return 0.35;
            if (d.relation === "hub") return 0.25;
            return 0.12;
          }),
      )
      .force("charge", forceManyBody().strength(-160))
      .force("center", forceCenter(W / 2, H / 2).strength(0.08))
      .force(
        "collide",
        forceCollide<SimNode>().radius((d) => radius(d.kind) + 10),
      )
      .alpha(1)
      .alphaDecay(0.03);

    simRef.current = simulation;
    simulation.on("tick", () => {
      for (const n of simNodes) clampNode(n);
      setTick((t) => t + 1);
    });

    return () => {
      simulation.stop();
      simRef.current = null;
    };
  }, [nodes, linkData]);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!m.has(e.from)) m.set(e.from, new Set());
      if (!m.has(e.to)) m.set(e.to, new Set());
      m.get(e.from)!.add(e.to);
      m.get(e.to)!.add(e.from);
    }
    return m;
  }, [edges]);

  const hoverNode = hover ? nodes.find((n) => n.id === hover) ?? null : null;

  function nodeDimmed(id: string, kind: OrgGraphNode["kind"]) {
    if (focusKind && kind !== focusKind) return true;
    if (focusRelation) {
      const linked = edges.some(
        (e) =>
          (e.relation ?? "org") === focusRelation &&
          (e.from === id || e.to === id),
      );
      if (!linked && !(focusKind && kind === focusKind)) {
        // keep hub visible lightly when filtering relations
        if (kind !== "hub") return true;
      }
    }
    if (!hover) return false;
    if (id === hover) return false;
    return !neighbors.get(hover)?.has(id);
  }

  function edgeDimmed(from: string, to: string, relation: string) {
    if (focusRelation && relation !== focusRelation) return true;
    if (focusKind) {
      const a = nodes.find((n) => n.id === from);
      const b = nodes.find((n) => n.id === to);
      if (a?.kind !== focusKind && b?.kind !== focusKind) return true;
    }
    if (!hover) return false;
    return hover !== from && hover !== to;
  }

  const kinds = [
    "hub",
    "institution",
    "department",
    "lab",
    "company",
    "person",
  ] as const;

  const relations = [
    "org",
    "hub",
    "supervisor",
    "labmate",
    "coauthor",
    "cross",
  ] as const;

  // silence unused lint for tick — it drives re-renders
  void tick;

  const simNodes = nodesRef.current;
  const simLinks = linksRef.current;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs text-muted">
        <span className="mr-1 self-center section-label">level</span>
        {kinds.map((kind) => {
          const active = focusKind === kind;
          const count = nodes.filter((n) => n.kind === kind).length;
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
              {kind === "hub" ? "you" : kind}
              <span className="ml-2 text-muted/70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-muted">
        <span className="mr-1 self-center section-label">link</span>
        {relations.map((relation) => {
          const active = focusRelation === relation;
          const count = edges.filter((e) => (e.relation ?? "org") === relation)
            .length;
          if (count === 0) return null;
          const style = RELATION_STYLE[relation];
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
                style={{
                  backgroundColor: style.stroke,
                  borderTop: style.dash ? `1px dashed ${style.stroke}` : undefined,
                }}
                aria-hidden
              />
              {style.label}
              <span className="ml-2 text-muted/70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden border border-ink/10 dark:border-paper/10">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full bg-paper/40 dark:bg-charcoal/40"
          role="img"
          aria-label="Force-directed organisation and collaboration network"
        >
          {simLinks.map((link, i) => {
            const s = link.source as SimNode;
            const t = link.target as SimNode;
            if (s.x == null || t.x == null) return null;
            const relation = link.relation;
            const style = RELATION_STYLE[relation];
            const active = hover === s.id || hover === t.id;
            const dim = edgeDimmed(s.id, t.id, relation);
            return (
              <line
                key={`${s.id}-${t.id}-${relation}-${i}`}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke={active ? "#0F766E" : style.stroke}
                strokeOpacity={dim ? 0.04 : active ? 0.9 : relation === "coauthor" ? 0.45 : 0.28}
                strokeWidth={
                  active
                    ? 1.8
                    : relation === "coauthor"
                      ? 1 + Math.min(link.weight, 6) * 0.55
                      : 1
                }
                strokeDasharray={style.dash}
                style={{ transition: TRANSITION }}
              />
            );
          })}

          {simNodes.map((node) => {
            const dim = nodeDimmed(node.id, node.kind);
            const hot = hover === node.id;
            const r = radius(node.kind) * (hot ? 1.3 : 1);
            const maxLen = node.kind === "person" ? 14 : 12;
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
                  fillOpacity={dim ? 0.12 : hot ? 0.95 : 0.82}
                  stroke={node.kind === "hub" ? KIND_COLOR.hub : "transparent"}
                  strokeWidth={node.kind === "hub" ? 2 : 0}
                  style={{ transition: TRANSITION }}
                >
                  <title>
                    {[node.label, node.role, node.affiliation || node.meta]
                      .filter(Boolean)
                      .join(" · ")}
                  </title>
                </circle>
                <text
                  x={node.x}
                  y={(node.y ?? 0) + r + 10}
                  textAnchor="middle"
                  className="fill-current text-ink dark:text-paper"
                  style={{
                    fontSize: node.kind === "hub" ? 10 : 8.5,
                    opacity: dim ? 0.15 : 0.9,
                    fontWeight: node.kind === "hub" ? 500 : 400,
                    transition: TRANSITION,
                    pointerEvents: "none",
                  }}
                >
                  {label}
                </text>
              </a>
            );
          })}
        </svg>
      </div>

      <div
        className="border border-ink/10 px-3 py-3 font-mono text-xs dark:border-paper/10"
        aria-live="polite"
      >
        {hoverNode ? (
          <div className="space-y-1.5 transition-opacity duration-200">
            <p className="text-ink dark:text-paper">
              <span className="text-accent">›</span> {hoverNode.label}
              {hoverNode.role && (
                <span className="text-muted"> · {hoverNode.role}</span>
              )}
              <span className="text-muted"> · {hoverNode.kind}</span>
            </p>
            {(hoverNode.affiliation || hoverNode.meta) && (
              <p className="text-muted">
                {hoverNode.affiliation ?? hoverNode.meta}
              </p>
            )}
            {hoverNode.papers && hoverNode.papers.length > 0 ? (
              <ul className="space-y-1 pt-1 text-muted">
                {hoverNode.papers.slice(0, 2).map((paper) => (
                  <li key={paper.href}>
                    <a href={paper.href} className="hover:text-accent">
                      {paper.year} —{" "}
                      {paper.title.length > 72
                        ? `${paper.title.slice(0, 70)}…`
                        : paper.title}
                    </a>
                  </li>
                ))}
              </ul>
            ) : hoverNode.kind === "person" ? (
              <p className="pt-1 text-muted/70">no shared papers indexed yet</p>
            ) : (
              <p className="pt-1 text-muted/70">
                colour = level · springs pull collaborators together
              </p>
            )}
          </div>
        ) : (
          <p className="text-muted">
            <span className="text-accent">›</span> force layout — filter by colour
            (level) or link type; rose = supervisor · purple = coauthor (thicker /
            closer = more shared papers)
          </p>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";
import landTopo from "world-atlas/land-50m.json";

export type StationKind = "education" | "experience" | "conference";

export type Station = {
  id: string;
  label: string;
  place: string;
  period: string;
  /** Approximate WGS84 */
  lat: number;
  lon: number;
  kinds: StationKind[];
  /**
   * Months spent here — drives bubble size only; never shown in the UI.
   * Adjust freely; conference visits can be fractional.
   */
  months: number;
  /** Chronological sort key / filter start */
  startYear: number;
  /** Inclusive end year for CV year filters; omit for single-year events */
  endYear?: number;
  /** Still based here (e.g. 2018–); year filter keeps stations with startYear ≤ year */
  ongoing?: boolean;
  /** Tags for CV ?tag= filter */
  tags?: string[];
  /**
   * For experience (or conference) stations: draw a spur from this hub id
   * instead of chaining chronologically on that track.
   */
  relatesTo?: string;
  href?: string;
};

type Props = {
  stations: Station[];
};

const land = feature(
  landTopo as unknown as Topology,
  (landTopo as { objects: { land: Topology["objects"][string] } }).objects.land,
) as Feature<Polygon | MultiPolygon>;

const KIND_META: Record<StationKind, { label: string; color: string }> = {
  education: { label: "education", color: "#0F766E" },
  experience: { label: "experience", color: "#B45309" },
  conference: { label: "conferences", color: "#7C3AED" },
};

function readCvFilters() {
  if (typeof window === "undefined") {
    return { tag: null as string | null, year: null as string | null };
  }
  const params = new URLSearchParams(window.location.search);
  return { tag: params.get("tag"), year: params.get("year") };
}

function stationMatchesFilters(
  s: Station,
  tag: string | null,
  year: string | null,
) {
  if (tag) {
    const tags = s.tags ?? [];
    if (
      !tags.some((t) => t.toLowerCase() === tag.toLowerCase())
    ) {
      return false;
    }
  }
  if (year) {
    const y = Number(year);
    if (!Number.isFinite(y)) return false;
    const end = s.endYear ?? (s.ongoing ? Number.POSITIVE_INFINITY : s.startYear);
    if (y < s.startYear || y > end) return false;
  }
  return true;
}

/** Log scale keeps multi-year homes from dominating short visits. */
function radiusForMonths(months: number, hot: boolean) {
  const m = Math.max(months, 0.15);
  const t = Math.log1p(m) / Math.log1p(120);
  const base = 3.2 + t * 9;
  return hot ? base * 1.12 : base;
}

function pointFeature(lon: number, lat: number): Feature {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: [lon, lat] },
  };
}

/** Default Europe frame when nothing is visible. */
const EUROPE_POINTS: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    pointFeature(-10, 36),
    pointFeature(30, 36),
    pointFeature(30, 58),
    pointFeature(-10, 58),
  ],
};

/**
 * Fit frame from station coordinates (MultiPoint / points).
 * IMPORTANT: do not use a lon/lat Polygon — d3-geo is spherical and a small
 * rectangle can be interpreted as “the rest of the globe”.
 */
function stationsFrame(stations: Station[]): FeatureCollection {
  if (stations.length === 0) return EUROPE_POINTS;

  const lons = stations.map((s) => s.lon);
  const lats = stations.map((s) => s.lat);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);

  // Minimum span so a single city still shows regional coastline
  const minSpanLon = 6;
  const minSpanLat = 4;
  if (maxLon - minLon < minSpanLon) {
    const mid = (minLon + maxLon) / 2;
    minLon = mid - minSpanLon / 2;
    maxLon = mid + minSpanLon / 2;
  }
  if (maxLat - minLat < minSpanLat) {
    const mid = (minLat + maxLat) / 2;
    minLat = mid - minSpanLat / 2;
    maxLat = mid + minSpanLat / 2;
  }

  // Margin via corner points (not a Polygon)
  const padLon = (maxLon - minLon) * 0.22 + 0.8;
  const padLat = (maxLat - minLat) * 0.22 + 0.6;

  return {
    type: "FeatureCollection",
    features: [
      pointFeature(minLon - padLon, minLat - padLat),
      pointFeature(maxLon + padLon, minLat - padLat),
      pointFeature(maxLon + padLon, maxLat + padLat),
      pointFeature(minLon - padLon, maxLat + padLat),
      ...stations.map((s) => pointFeature(s.lon, s.lat)),
    ],
  };
}

export default function StationsPath({ stations }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const [kinds, setKinds] = useState<Set<StationKind>>(
    () => new Set(["education", "experience"]),
  );
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<string | null>(null);

  useEffect(() => {
    function sync() {
      const f = readCvFilters();
      setFilterTag(f.tag);
      setFilterYear(f.year);
    }
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("pageshow", sync);
    window.addEventListener("cv-filter-change", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("pageshow", sync);
      window.removeEventListener("cv-filter-change", sync);
    };
  }, []);

  const W = 720;
  const H = 440;
  const pad = 28;

  const visible = useMemo(() => {
    const matched = stations.filter(
      (s) =>
        s.kinds.some((k) => kinds.has(k)) &&
        stationMatchesFilters(s, filterTag, filterYear),
    );
    const ids = new Set(matched.map((s) => s.id));
    // Keep hub anchors for relatesTo spurs even if that hub's filters are off.
    for (const s of [...matched]) {
      if (s.relatesTo && !ids.has(s.relatesTo)) {
        const hub = stations.find((h) => h.id === s.relatesTo);
        if (
          hub &&
          stationMatchesFilters(hub, filterTag, filterYear)
        ) {
          matched.push(hub);
          ids.add(hub.id);
        } else if (hub) {
          // Still include hub so spurs can draw when hub fails tag but is anchor.
          matched.push(hub);
          ids.add(hub.id);
        }
      }
    }
    return matched.sort(
      (a, b) => a.startYear - b.startYear || a.place.localeCompare(b.place),
    );
  }, [stations, kinds, filterTag, filterYear]);

  const { points, coastD, viewKey } = useMemo(() => {
    const projection = geoMercator();
    projection.fitExtent(
      [
        [pad, pad],
        [W - pad, H - pad],
      ],
      stationsFrame(visible),
    );

    const path = geoPath(projection);
    const coast = path(land) ?? "";

    const pts = visible.map((s) => {
      const xy = projection([s.lon, s.lat]);
      return {
        ...s,
        x: xy?.[0] ?? W / 2,
        y: xy?.[1] ?? H / 2,
      };
    });

    return {
      points: pts,
      coastD: coast,
      viewKey: visible.map((s) => s.id).join("|") || "empty",
    };
  }, [visible]);

  function toggleKind(kind: StationKind) {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        if (next.size > 1) next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }

  type Pt = (typeof points)[number];
  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);

  /** Chronological chain among stations that carry this kind. */
  function chainFor(kind: StationKind): Pt[] {
    if (!kinds.has(kind)) return [];
    return points
      .filter((s) => {
        if (!s.kinds.includes(kind)) return false;
        // Experience/conference with relatesTo are drawn as spurs, not in chain.
        if (kind !== "education" && s.relatesTo) return false;
        return true;
      })
      .sort(
        (a, b) => a.startYear - b.startYear || a.place.localeCompare(b.place),
      );
  }

  function spurEdges(kind: StationKind): { a: Pt; b: Pt }[] {
    if (!kinds.has(kind)) return [];
    const edges: { a: Pt; b: Pt }[] = [];
    for (const s of points) {
      if (!s.kinds.includes(kind) || !s.relatesTo) continue;
      const hub = byId.get(s.relatesTo);
      if (!hub || hub.id === s.id) continue;
      // Skip zero-length spurs (e.g. clinical rotations in the home city).
      if (Math.hypot(hub.x - s.x, hub.y - s.y) < 1) continue;
      edges.push({ a: hub, b: s });
    }
    return edges;
  }

  /** Slight arc so overlapping tracks stay readable. */
  function arcPath(a: Pt, b: Pt, bend: number) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ox = (-dy / len) * bend;
    const oy = (dx / len) * bend;
    return `M ${a.x} ${a.y} Q ${mx + ox} ${my + oy} ${b.x} ${b.y}`;
  }

  function chainSegments(chain: Pt[], bend: number) {
    const segs: { key: string; d: string; a: Pt; b: Pt }[] = [];
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i];
      const b = chain[i + 1];
      segs.push({
        key: `${a.id}-${b.id}`,
        d: arcPath(a, b, bend),
        a,
        b,
      });
    }
    return segs;
  }

  const educationChain = chainFor("education");
  const conferenceChain = chainFor("conference");
  const experienceSpurs = spurEdges("experience");
  const conferenceSpurs = spurEdges("conference");

  const tracks: {
    key: string;
    color: string;
    segments: { key: string; d: string; a: Pt; b: Pt }[];
  }[] = [
    {
      key: "education",
      color: KIND_META.education.color,
      segments: chainSegments(educationChain, 0),
    },
    {
      key: "experience",
      color: KIND_META.experience.color,
      segments: experienceSpurs.map(({ a, b }) => ({
        key: `exp-${a.id}-${b.id}`,
        d: arcPath(a, b, 18),
        a,
        b,
      })),
    },
    {
      key: "conference",
      color: KIND_META.conference.color,
      segments: [
        ...chainSegments(conferenceChain, -14),
        ...conferenceSpurs.map(({ a, b }) => ({
          key: `conf-${a.id}-${b.id}`,
          d: arcPath(a, b, -18),
          a,
          b,
        })),
      ],
    },
  ];

  function nodeColor(s: Station) {
    if (s.kinds.includes("education") && kinds.has("education")) {
      return KIND_META.education.color;
    }
    if (s.kinds.includes("experience") && kinds.has("experience")) {
      return KIND_META.experience.color;
    }
    return KIND_META.conference.color;
  }

  /** One place/period label per colocated stack (e.g. Hamburg edu + clinical). */
  function isLabelPrimary(s: Pt) {
    const stack = points.filter(
      (p) =>
        p.place === s.place && Math.hypot(p.x - s.x, p.y - s.y) < 2,
    );
    if (stack.length <= 1) return true;
    const primary = [...stack].sort((a, b) => {
      const ae = a.kinds.includes("education") ? 1 : 0;
      const be = b.kinds.includes("education") ? 1 : 0;
      if (be !== ae) return be - ae;
      return b.months - a.months || a.startYear - b.startYear;
    })[0];
    return primary.id === s.id;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs text-muted">
        <span className="mr-1 self-center section-label">show</span>
        {(Object.keys(KIND_META) as StationKind[]).map((kind) => {
          const active = kinds.has(kind);
          const count = stations.filter((s) => s.kinds.includes(kind)).length;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggleKind(kind)}
              className={`border px-2 py-1 transition-colors ${
                active
                  ? "border-accent text-accent"
                  : "border-ink/10 hover:border-accent hover:text-accent dark:border-paper/10"
              }`}
            >
              <span
                className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                style={{ backgroundColor: KIND_META[kind].color }}
                aria-hidden
              />
              {KIND_META[kind].label}
              <span className="ml-2 text-muted/70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden border border-ink/10 dark:border-paper/10">
        <svg
          key={viewKey}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full bg-paper/40 dark:bg-charcoal/40"
          role="img"
          aria-label="Places along the CV with Natural Earth coastlines"
        >
          {coastD && (
            <path
              d={coastD}
              fill="none"
              stroke="currentColor"
              className="text-ink/40 dark:text-paper/35"
              strokeWidth={0.85}
              strokeLinejoin="round"
            />
          )}

          {tracks.map((track) =>
            track.segments.map((seg) => {
              const active =
                hover === seg.a.id || hover === seg.b.id || hover == null;
              return (
                <path
                  key={`${track.key}-${seg.key}`}
                  d={seg.d}
                  fill="none"
                  stroke={track.color}
                  strokeOpacity={active && hover ? 0.9 : hover ? 0.12 : 0.4}
                  strokeWidth={track.key === "education" ? 1.4 : 1.2}
                  strokeDasharray={
                    track.key === "education"
                      ? undefined
                      : track.key === "experience"
                        ? "5 3"
                        : "3 3"
                  }
                />
              );
            }),
          )}

          {points.map((s) => {
            const hot = hover === s.id;
            const dim = hover != null && !hot;
            const r = radiusForMonths(s.months, hot);
            const color = nodeColor(s);
            const isClinical = s.period === "clinical rotation";
            const hoveredClinical = points.find(
              (p) =>
                p.id === hover &&
                p.period === "clinical rotation" &&
                p.place === s.place &&
                Math.hypot(p.x - s.x, p.y - s.y) < 2,
            );
            const showText = isClinical
              ? hot
              : isLabelPrimary(s) && !hoveredClinical;
            const Node = s.href ? "a" : "g";
            const nodeProps = s.href
              ? { href: s.href }
              : ({} as Record<string, string>);
            return (
              <Node
                key={s.id}
                {...nodeProps}
                onMouseEnter={() => setHover(s.id)}
                onMouseLeave={() => setHover(null)}
              >
                <circle
                  cx={s.x}
                  cy={s.y}
                  r={r}
                  fill={color}
                  fillOpacity={dim ? 0.18 : 0.88}
                  stroke={color}
                  strokeWidth={hot ? 1.5 : 0}
                  strokeOpacity={0.5}
                >
                  <title>{`${s.label} — ${s.place} (${s.period})`}</title>
                </circle>
                {showText && (
                  <>
                    <text
                      x={s.x}
                      y={s.y - r - 6}
                      textAnchor="middle"
                      className="fill-current text-ink dark:text-paper"
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        opacity: dim ? 0.25 : 1,
                      }}
                    >
                      {s.place}
                    </text>
                    <text
                      x={s.x}
                      y={s.y + r + 12}
                      textAnchor="middle"
                      className="fill-muted"
                      style={{ fontSize: 9, opacity: dim ? 0.2 : 0.85 }}
                    >
                      {s.period}
                    </text>
                  </>
                )}
              </Node>
            );
          })}

          {points.length === 0 && (
            <text
              x={W / 2}
              y={H / 2}
              textAnchor="middle"
              className="fill-muted"
              style={{ fontSize: 12 }}
            >
              no places for this filter
            </text>
          )}
        </svg>
      </div>

      <ol className="grid gap-2 text-sm sm:grid-cols-2">
        {visible.map((s, i) => (
          <li key={s.id} className="flex gap-2 text-muted">
            <span className="text-accent">{String(i + 1).padStart(2, "0")}</span>
            <span>
              {s.href ? (
                <a
                  href={s.href}
                  className="text-ink hover:text-accent dark:text-paper"
                >
                  {s.label}
                </a>
              ) : (
                <span className="text-ink dark:text-paper">{s.label}</span>
              )}
              <span className="text-muted"> — {s.place}</span>
              <span className="ml-2 text-xs text-muted/70">
                {s.kinds.join(" · ")}
                {s.relatesTo ? ` · via ${s.relatesTo}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className="font-mono text-xs text-muted">
        <span className="text-accent">›</span> teal = education · amber =
        experience · purple = conferences · bubble size log∝ time
        {(filterTag || filterYear) && (
          <span>
            {" "}
            · filtered
            {filterYear ? ` year:${filterYear}` : ""}
            {filterTag ? ` tag:${filterTag}` : ""}
          </span>
        )}
      </p>
    </div>
  );
}

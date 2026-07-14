import authorFallback from "../data/metrics.json";
import paperFallback from "../data/paper-metrics.json";
import journalFallback from "../data/journal-metrics.json";

const UA =
  "website-viktorzouboulis (mailto:viktor.zouboulis@well.ox.ac.uk)";

export type PubMetrics = {
  citations: number;
  hIndex: number;
  i10Index: number;
  updated: string;
  openAlexId: string;
  orcid: string;
  source: "openalex" | "cache";
};

export type PaperMetric = {
  citations: number;
  openAlexId?: string;
  /** OpenAlex source (journal) id when known */
  sourceId?: string;
  /** OpenAlex work IDs this paper references (for internal cite graph). */
  referencedWorks?: string[];
  source: "openalex" | "cache";
};

export type JournalMetric = {
  /** OpenAlex 2-year mean citedness (IF proxy), or curated fallback */
  impactFactor: number;
  hIndex?: number;
  openAlexId?: string;
  displayName?: string;
  source: "openalex" | "cache";
};

type JournalCacheEntry = {
  impactFactor?: number | null;
  hIndex?: number | null;
  openAlexId?: string;
  displayName?: string;
  issn?: string;
};

/** Pull a DOI from a doi.org (or similar) URL. */
export function extractDoi(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/10\.\d{4,9}\/[^\s?#]+/i);
  if (!match) return null;
  return match[0].replace(/\/$/, "");
}

function normalizeVenue(venue: string) {
  return venue.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Publication metrics from OpenAlex at build time.
 * Falls back to src/data/metrics.json if the request fails (offline CI, etc.).
 */
export async function getPubMetrics(): Promise<PubMetrics> {
  const base = {
    citations: authorFallback.citations,
    hIndex: authorFallback.hIndex,
    i10Index: authorFallback.i10Index,
    updated: authorFallback.updated,
    openAlexId: authorFallback.openAlexId,
    orcid: authorFallback.orcid,
  };

  try {
    const res = await fetch(
      `https://api.openalex.org/authors/${authorFallback.orcid}`,
      {
        headers: { "User-Agent": UA, Accept: "application/json" },
      },
    );
    if (!res.ok) throw new Error(`OpenAlex ${res.status}`);

    const data = (await res.json()) as {
      cited_by_count?: number;
      summary_stats?: { h_index?: number; i10_index?: number };
      id?: string;
    };

    return {
      citations: data.cited_by_count ?? base.citations,
      hIndex: data.summary_stats?.h_index ?? base.hIndex,
      i10Index: data.summary_stats?.i10_index ?? base.i10Index,
      updated: new Date().toISOString().slice(0, 10),
      openAlexId: data.id ?? base.openAlexId,
      orcid: base.orcid,
      source: "openalex",
    };
  } catch {
    return { ...base, source: "cache" };
  }
}

async function fetchWorkByDoi(doi: string): Promise<PaperMetric | null> {
  const cached = (paperFallback as Record<
    string,
    {
      citations: number;
      openAlexId?: string;
      sourceId?: string;
      referencedWorks?: string[];
    }
  >)[doi];

  try {
    const res = await fetch(
      `https://api.openalex.org/works/https://doi.org/${encodeURI(doi)}?select=id,cited_by_count,referenced_works,primary_location`,
      {
        headers: { "User-Agent": UA, Accept: "application/json" },
      },
    );
    if (!res.ok) throw new Error(`OpenAlex ${res.status}`);

    const data = (await res.json()) as {
      cited_by_count?: number;
      id?: string;
      referenced_works?: string[];
      primary_location?: { source?: { id?: string } };
    };

    return {
      citations: data.cited_by_count ?? 0,
      openAlexId: data.id,
      sourceId: data.primary_location?.source?.id,
      referencedWorks: data.referenced_works ?? [],
      source: "openalex",
    };
  } catch {
    if (!cached) return null;
    return {
      citations: cached.citations,
      openAlexId: cached.openAlexId,
      sourceId: cached.sourceId,
      referencedWorks: cached.referencedWorks ?? [],
      source: "cache",
    };
  }
}

/**
 * Per-paper citation counts keyed by DOI.
 * Live OpenAlex lookup at build time; falls back to paper-metrics.json.
 */
export async function getPaperMetricsByDois(
  dois: string[],
): Promise<Map<string, PaperMetric>> {
  const unique = [...new Set(dois.filter(Boolean))];
  const results = await Promise.all(
    unique.map(async (doi) => [doi, await fetchWorkByDoi(doi)] as const),
  );

  const map = new Map<string, PaperMetric>();
  for (const [doi, metric] of results) {
    if (metric) map.set(doi, metric);
  }
  return map;
}

async function fetchSourceByIssn(issn: string): Promise<JournalMetric | null> {
  try {
    const res = await fetch(
      `https://api.openalex.org/sources?filter=issn:${encodeURIComponent(issn)}&per_page=1&select=id,display_name,summary_stats`,
      { headers: { "User-Agent": UA, Accept: "application/json" } },
    );
    if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
    const data = (await res.json()) as {
      results?: Array<{
        id?: string;
        display_name?: string;
        summary_stats?: {
          "2yr_mean_citedness"?: number;
          h_index?: number;
        };
      }>;
    };
    const hit = data.results?.[0];
    const ifactor = hit?.summary_stats?.["2yr_mean_citedness"];
    if (ifactor == null) return null;
    return {
      impactFactor: ifactor,
      hIndex: hit?.summary_stats?.h_index,
      openAlexId: hit?.id,
      displayName: hit?.display_name,
      source: "openalex",
    };
  } catch {
    return null;
  }
}

async function fetchSourceBySearch(name: string): Promise<JournalMetric | null> {
  try {
    const res = await fetch(
      `https://api.openalex.org/sources?search=${encodeURIComponent(name)}&per_page=5&select=id,display_name,summary_stats,type`,
      { headers: { "User-Agent": UA, Accept: "application/json" } },
    );
    if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
    const data = (await res.json()) as {
      results?: Array<{
        id?: string;
        display_name?: string;
        type?: string;
        summary_stats?: {
          "2yr_mean_citedness"?: number;
          h_index?: number;
        };
      }>;
    };
    const needle = normalizeVenue(name);
    const hit =
      data.results?.find((s) => normalizeVenue(s.display_name ?? "") === needle) ??
      data.results?.find((s) =>
        normalizeVenue(s.display_name ?? "").includes(needle),
      ) ??
      data.results?.[0];
    const ifactor = hit?.summary_stats?.["2yr_mean_citedness"];
    if (ifactor == null) return null;
    return {
      impactFactor: ifactor,
      hIndex: hit?.summary_stats?.h_index,
      openAlexId: hit?.id,
      displayName: hit?.display_name,
      source: "openalex",
    };
  } catch {
    return null;
  }
}

async function fetchSourceById(openAlexId: string): Promise<JournalMetric | null> {
  const id = openAlexId.replace("https://openalex.org/", "");
  try {
    const res = await fetch(
      `https://api.openalex.org/sources/${id}?select=id,display_name,summary_stats`,
      { headers: { "User-Agent": UA, Accept: "application/json" } },
    );
    if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
    const data = (await res.json()) as {
      id?: string;
      display_name?: string;
      summary_stats?: {
        "2yr_mean_citedness"?: number;
        h_index?: number;
      };
    };
    const ifactor = data.summary_stats?.["2yr_mean_citedness"];
    if (ifactor == null) return null;
    return {
      impactFactor: ifactor,
      hIndex: data.summary_stats?.h_index,
      openAlexId: data.id,
      displayName: data.display_name,
      source: "openalex",
    };
  } catch {
    return null;
  }
}

/**
 * Journal impact (OpenAlex 2yr mean citedness ≈ IF) keyed by venue display name.
 * Tries live OpenAlex (ISSN / search / source id); falls back to journal-metrics.json.
 */
export async function getJournalMetricsByVenues(
  venues: string[],
  opts?: { sourceIdsByVenue?: Map<string, string> },
): Promise<Map<string, JournalMetric>> {
  const cache = journalFallback as Record<string, JournalCacheEntry>;
  const unique = [...new Set(venues.map((v) => v.trim()).filter(Boolean))];
  const map = new Map<string, JournalMetric>();

  await Promise.all(
    unique.map(async (venue) => {
      const cached = cache[venue];
      const sourceId =
        opts?.sourceIdsByVenue?.get(venue) ?? cached?.openAlexId;

      let live: JournalMetric | null = null;
      if (cached?.issn) live = await fetchSourceByIssn(cached.issn);
      if (!live && sourceId) live = await fetchSourceById(sourceId);
      if (!live) live = await fetchSourceBySearch(venue);

      if (live) {
        map.set(venue, live);
        return;
      }

      if (cached?.impactFactor != null) {
        map.set(venue, {
          impactFactor: cached.impactFactor,
          hIndex: cached.hIndex ?? undefined,
          openAlexId: cached.openAlexId,
          displayName: cached.displayName,
          source: "cache",
        });
      }
    }),
  );

  return map;
}

/** Edges where one of your papers cites another (by OpenAlex referenced_works). */
export function internalCitationEdges(
  papers: { id: string; doi: string | null }[],
  metricsByDoi: Map<string, PaperMetric>,
): { from: string; to: string }[] {
  const openAlexToPaper = new Map<string, string>();
  for (const paper of papers) {
    if (!paper.doi) continue;
    const m = metricsByDoi.get(paper.doi);
    if (m?.openAlexId) openAlexToPaper.set(m.openAlexId, paper.id);
  }

  const edges: { from: string; to: string }[] = [];
  const seen = new Set<string>();
  for (const paper of papers) {
    if (!paper.doi) continue;
    const refs = metricsByDoi.get(paper.doi)?.referencedWorks ?? [];
    for (const ref of refs) {
      const toId = openAlexToPaper.get(ref);
      if (!toId || toId === paper.id) continue;
      const key = `${paper.id}->${toId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: paper.id, to: toId });
    }
  }
  return edges;
}

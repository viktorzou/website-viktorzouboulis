import authorFallback from "../data/metrics.json";
import paperFallback from "../data/paper-metrics.json";

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
  source: "openalex" | "cache";
};

/** Pull a DOI from a doi.org (or similar) URL. */
export function extractDoi(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/10\.\d{4,9}\/[^\s?#]+/i);
  if (!match) return null;
  return match[0].replace(/\/$/, "");
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
  const cached = (paperFallback as Record<string, { citations: number; openAlexId?: string }>)[
    doi
  ];

  try {
    const res = await fetch(
      `https://api.openalex.org/works/https://doi.org/${encodeURI(doi)}`,
      {
        headers: { "User-Agent": UA, Accept: "application/json" },
      },
    );
    if (!res.ok) throw new Error(`OpenAlex ${res.status}`);

    const data = (await res.json()) as {
      cited_by_count?: number;
      id?: string;
    };

    return {
      citations: data.cited_by_count ?? 0,
      openAlexId: data.id,
      source: "openalex",
    };
  } catch {
    if (!cached) return null;
    return {
      citations: cached.citations,
      openAlexId: cached.openAlexId,
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

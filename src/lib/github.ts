import githubFallback from "../data/github-metrics.json";

const UA =
  "website-viktorzouboulis (mailto:viktor.zouboulis@well.ox.ac.uk)";

export type GithubRepoStats = {
  stars: number;
  forks: number;
  source: "github" | "cache";
};

/** Parse owner/repo from a github.com URL, or null if not a repo link. */
export function parseGithubRepo(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/^(www\.)?github\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repo] = parts;
    if (!owner || !repo || owner === "orgs" || owner === "users") return null;
    return `${owner}/${repo.replace(/\.git$/i, "")}`;
  } catch {
    return null;
  }
}

async function fetchRepoStats(slug: string): Promise<GithubRepoStats | null> {
  const cached = (
    githubFallback as Record<string, { stars: number; forks: number }>
  )[slug];

  try {
    const headers: Record<string, string> = {
      "User-Agent": UA,
      Accept: "application/vnd.github+json",
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`https://api.github.com/repos/${slug}`, {
      headers,
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);

    const data = (await res.json()) as {
      stargazers_count?: number;
      forks_count?: number;
    };

    return {
      stars: data.stargazers_count ?? 0,
      forks: data.forks_count ?? 0,
      source: "github",
    };
  } catch {
    if (!cached) return null;
    return { stars: cached.stars, forks: cached.forks, source: "cache" };
  }
}

/**
 * Stars/forks for GitHub repo URLs, keyed by full URL (as stored on projects).
 * Live GitHub lookup at build time; falls back to github-metrics.json.
 */
export async function getGithubStatsByUrls(
  urls: string[],
): Promise<Map<string, GithubRepoStats>> {
  const map = new Map<string, GithubRepoStats>();
  const unique = [...new Set(urls.filter(Boolean))];

  await Promise.all(
    unique.map(async (url) => {
      const slug = parseGithubRepo(url);
      if (!slug) return;
      const stats = await fetchRepoStats(slug);
      if (stats) map.set(url, stats);
    }),
  );

  return map;
}

import { getCollection } from "astro:content";

export type TagSource = {
  kind: string;
  title: string;
  href: string;
};

export type TagEntry = {
  tag: string;
  count: number;
  sources: TagSource[];
};

function push(
  map: Map<string, TagSource[]>,
  tags: string[],
  source: TagSource,
) {
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag) continue;
    const list = map.get(tag) ?? [];
    list.push(source);
    map.set(tag, list);
  }
}

/** Aggregate every content-collection tag with counts and deep links. */
export async function getAllTags(): Promise<TagEntry[]> {
  const map = new Map<string, TagSource[]>();

  const [
    papers,
    projects,
    posters,
    interesting,
    collaborators,
    conferences,
    prizes,
  ] = await Promise.all([
    getCollection("papers"),
    getCollection("projects"),
    getCollection("posters"),
    getCollection("interestingPapers"),
    getCollection("collaborators"),
    getCollection("conferences"),
    getCollection("prizes"),
  ]);

  for (const p of papers) {
    push(map, p.data.tags, {
      kind: "paper",
      title: p.data.title,
      href: `/research/#papers`,
    });
  }
  for (const p of projects) {
    push(map, p.data.tags, {
      kind: "project",
      title: p.data.title,
      href: `/projects/${p.id}/`,
    });
  }
  for (const p of posters) {
    push(map, p.data.tags, {
      kind: "poster",
      title: p.data.title,
      href: `/research/#poster-${p.id}`,
    });
  }
  for (const p of interesting) {
    push(map, p.data.tags, {
      kind: "interesting",
      title: p.data.title,
      href: `/research/#interesting`,
    });
  }
  for (const p of collaborators) {
    push(map, p.data.tags, {
      kind: "person",
      title: p.data.name,
      href: `/collaborators/#${p.id}`,
    });
  }
  for (const p of conferences) {
    push(map, p.data.tags, {
      kind: "conference",
      title: p.data.title,
      href: `/cv/#conference-${p.id}`,
    });
  }
  for (const p of prizes) {
    push(map, p.data.tags, {
      kind: "prize",
      title: p.data.title,
      href: `/cv/#prize-${p.id}`,
    });
  }

  return [...map.entries()]
    .map(([tag, sources]) => ({
      tag,
      count: sources.length,
      sources,
    }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Best landing page when clicking a tag in the word map. */
export function tagLandingHref(entry: TagEntry): string {
  const kinds = new Set(entry.sources.map((s) => s.kind));
  const q = encodeURIComponent(entry.tag);
  if (
    kinds.has("paper") ||
    kinds.has("poster") ||
    kinds.has("project") ||
    kinds.has("interesting")
  ) {
    return `/research/?tag=${q}`;
  }
  if (kinds.has("person")) return `/collaborators/?tag=${q}`;
  if (kinds.has("conference") || kinds.has("prize")) return `/cv/?tag=${q}`;
  return `/research/?tag=${q}`;
}

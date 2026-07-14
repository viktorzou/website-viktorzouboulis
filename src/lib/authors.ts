import type { CollectionEntry } from "astro:content";

export type Collaborator = CollectionEntry<"collaborators">;
export type Paper = CollectionEntry<"papers">;
export type InterestingPaper = CollectionEntry<"interestingPapers">;

/** Escape text for safe HTML interpolation. */
export function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Build citation aliases for a collaborator.
 * Explicit `aliases` win; otherwise derive from "Given Family" → "Family G."
 */
export function collaboratorAliases(person: Collaborator): string[] {
  if (person.data.aliases.length > 0) return person.data.aliases;

  const parts = person.data.name.trim().split(/\s+/);
  if (parts.length < 2) return [person.data.name];

  const family = parts[parts.length - 1];
  const given = parts.slice(0, -1);
  const initial = given.map((g) => g[0]).join(".");
  return [
    `${family} ${initial}.`,
    `${family} ${initial}`,
    person.data.name,
  ];
}

export function paperMatchesCollaborator(paper: Paper, person: Collaborator) {
  const authors = paper.data.authors;
  return collaboratorAliases(person).some((alias) =>
    authors.toLowerCase().includes(alias.toLowerCase()),
  );
}

export function sharedPapers(papers: Paper[], person: Collaborator) {
  return papers
    .filter((paper) => paperMatchesCollaborator(paper, person))
    .sort((a, b) => b.data.year - a.data.year);
}

/** Interesting papers linked via `people` ids or author-line aliases. */
export function sharedInterestingPapers(
  papers: InterestingPaper[],
  person: Collaborator,
) {
  return papers
    .filter((paper) => {
      if (paper.data.people.includes(person.id)) return true;
      return collaboratorAliases(person).some((alias) =>
        paper.data.authors.toLowerCase().includes(alias.toLowerCase()),
      );
    })
    .sort((a, b) => b.data.year - a.data.year);
}

/** True when Viktor appears anywhere on the author line. */
export function paperIncludesOwn(authors: string) {
  return /Zouboulis\s+V(?:\.?\s*A\.?|\.(?!A)|(?=[,\s]|$))/i.test(authors);
}

/** Collaborators whose aliases match a paper's author line. */
export function peopleOnPaper(paper: Paper, collaborators: Collaborator[]) {
  return collaborators.filter((person) =>
    paperMatchesCollaborator(paper, person),
  );
}

/** Split a comma-separated citation author line into tokens. */
export function splitAuthorLine(authors: string): string[] {
  return authors
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeAuthorToken(token: string) {
  return token
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a single author token is Viktor (not C.C. / K.C.). */
export function isOwnAuthorToken(token: string) {
  return /^zouboulis v(?:\s*a)?$/i.test(normalizeAuthorToken(token));
}

function authorSlug(token: string) {
  return normalizeAuthorToken(token).replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export type ResolvedPaperAuthor = {
  /** Stable graph node id */
  id: string;
  kind: "hub" | "person" | "author";
  label: string;
  href: string;
  meta?: string;
};

/**
 * Map every author on a paper byline to a graph node:
 * hub (you), recognised collaborator, or external author.
 */
export function resolvePaperAuthors(
  authorsLine: string,
  collaborators: Collaborator[],
  opts: { hubId: string; hubHref?: string },
): ResolvedPaperAuthor[] {
  const tokens = splitAuthorLine(authorsLine);
  const out: ResolvedPaperAuthor[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    if (isOwnAuthorToken(token)) {
      if (seen.has(opts.hubId)) continue;
      seen.add(opts.hubId);
      out.push({
        id: opts.hubId,
        kind: "hub",
        label: "V. Zouboulis",
        href: opts.hubHref ?? "/about/",
        meta: "you",
      });
      continue;
    }

    const norm = normalizeAuthorToken(token);
    let matched: Collaborator | undefined;
    let bestLen = 0;
    for (const person of collaborators) {
      for (const alias of collaboratorAliases(person)) {
        const a = normalizeAuthorToken(alias);
        if (!a) continue;
        if (norm === a || norm.startsWith(a + " ") || a.startsWith(norm)) {
          if (a.length >= bestLen) {
            matched = person;
            bestLen = a.length;
          }
        }
      }
    }

    if (matched) {
      const id = `person:${matched.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        kind: "person",
        label: shortPersonLabel(matched.data.name),
        href: `/collaborators/#${matched.id}`,
        meta: matched.data.role,
      });
      continue;
    }

    const slug = authorSlug(token) || "unknown";
    const id = `author:${slug}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      kind: "author",
      label: token,
      href: `#paper-authors`,
      meta: "coauthor",
    });
  }

  return out;
}

function shortPersonLabel(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const first = parts[0].replace(/\.$/, "");
  return `${first[0]}. ${last}`;
}

export type CoauthorLink = {
  a: string;
  b: string;
  count: number;
  papers: { id: string; title: string; year: number; url?: string }[];
};

/**
 * Person–person coauthorship among recognized collaborators
 * (and optionally a hub id for Viktor when he coauthors with them).
 */
export function buildCoauthorLinks(
  papers: Paper[],
  collaborators: Collaborator[],
  opts?: { hubId?: string },
): CoauthorLink[] {
  const map = new Map<string, CoauthorLink>();

  function pairKey(a: string, b: string) {
    return a < b ? `${a}::${b}` : `${b}::${a}`;
  }

  function addPair(
    a: string,
    b: string,
    paper: { id: string; title: string; year: number; url?: string },
  ) {
    if (a === b) return;
    const key = pairKey(a, b);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.papers.some((p) => p.id === paper.id)) {
        existing.papers.push(paper);
      }
      return;
    }
    map.set(key, {
      a: a < b ? a : b,
      b: a < b ? b : a,
      count: 1,
      papers: [paper],
    });
  }

  for (const paper of papers) {
    const meta = {
      id: paper.id,
      title: paper.data.title,
      year: paper.data.year,
      url: paper.data.url,
    };
    const people = peopleOnPaper(paper, collaborators);
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        addPair(people[i].id, people[j].id, meta);
      }
      if (opts?.hubId && paperIncludesOwn(paper.data.authors)) {
        addPair(opts.hubId, people[i].id, meta);
      }
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count);
}

/**
 * Coauthor pairs over *all* byline authors (recognised + external + hub).
 */
export function buildFullCoauthorLinks(
  papers: Paper[],
  collaborators: Collaborator[],
  opts: { hubId: string },
): CoauthorLink[] {
  const map = new Map<string, CoauthorLink>();

  function pairKey(a: string, b: string) {
    return a < b ? `${a}::${b}` : `${b}::${a}`;
  }

  function addPair(
    a: string,
    b: string,
    paper: { id: string; title: string; year: number; url?: string },
  ) {
    if (a === b) return;
    const key = pairKey(a, b);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.papers.some((p) => p.id === paper.id)) {
        existing.papers.push(paper);
      }
      return;
    }
    map.set(key, {
      a: a < b ? a : b,
      b: a < b ? b : a,
      count: 1,
      papers: [paper],
    });
  }

  for (const paper of papers) {
    const meta = {
      id: paper.id,
      title: paper.data.title,
      year: paper.data.year,
      url: paper.data.url,
    };
    const authors = resolvePaperAuthors(paper.data.authors, collaborators, {
      hubId: opts.hubId,
    });
    for (let i = 0; i < authors.length; i++) {
      for (let j = i + 1; j < authors.length; j++) {
        addPair(authors[i].id, authors[j].id, meta);
      }
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** True when Viktor is listed as first author (not C.C. Zouboulis). */
export function isOwnFirstAuthor(authors: string) {
  const first = authors.split(",")[0]?.trim() ?? "";
  return /^Zouboulis\s+V(?:\.|\s|$)/i.test(first);
}

/**
 * Author line HTML: link collaborator aliases → /collaborators/#id,
 * underline own-name variants.
 */
export function formatAuthorsHtml(authors: string, collaborators: Collaborator[]) {
  type Span = { start: number; end: number; html: string };
  const spans: Span[] = [];

  const ownRe = /Zouboulis\s+V(?:\.?\s*A\.?|\.(?!A)|(?=[,\s]|$))/gi;
  for (const match of authors.matchAll(ownRe)) {
    if (match.index === undefined) continue;
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      html: `<span class="underline decoration-ink/40 underline-offset-2 dark:decoration-paper/40">${escapeHtml(match[0])}</span>`,
    });
  }

  for (const person of collaborators) {
    for (const alias of collaboratorAliases(person)) {
      const re = new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      for (const match of authors.matchAll(re)) {
        if (match.index === undefined) continue;
        spans.push({
          start: match.index,
          end: match.index + match[0].length,
          html: `<a href="/collaborators/#${person.id}" class="underline decoration-accent/50 underline-offset-2 hover:text-accent">${escapeHtml(match[0])}</a>`,
        });
      }
    }
  }

  // Prefer earlier, then longer spans; drop overlaps
  spans.sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
  );
  const kept: Span[] = [];
  for (const span of spans) {
    if (kept.some((k) => !(span.end <= k.start || span.start >= k.end))) continue;
    kept.push(span);
  }
  kept.sort((a, b) => a.start - b.start);

  let out = "";
  let cursor = 0;
  for (const span of kept) {
    out += escapeHtml(authors.slice(cursor, span.start));
    out += span.html;
    cursor = span.end;
  }
  out += escapeHtml(authors.slice(cursor));
  return out;
}

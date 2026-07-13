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

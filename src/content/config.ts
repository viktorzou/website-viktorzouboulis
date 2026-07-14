import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    draft: z.boolean().optional().default(false),
    pinned: z.boolean().optional().default(false),
  }),
});

const papers = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/papers" }),
  schema: z.object({
    title: z.string(),
    year: z.number(),
    authors: z.string(),
    venue: z.string(),
    tags: z.array(z.string()).default([]),
    url: z.string().url().optional(),
    pdf: z.string().optional(),
    abstract: z.string().optional(),
    /** Optional blog post id, e.g. "ibd-single-cell-modelling" → /blog/ibd-single-cell-modelling/ */
    blog: z.string().optional(),
    pinned: z.boolean().optional().default(false),
    /** Lab ids under src/content/labs/ */
    labs: z.array(z.string()).default([]),
    /** Department ids under src/content/departments/ */
    departments: z.array(z.string()).default([]),
    /** Institution ids under src/content/institutions/ */
    institutions: z.array(z.string()).default([]),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    /** Omit for planned work that has not started yet */
    year: z.number().optional(),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    /** External link (repo, demo, etc.) — project page is always /projects/{id}/ */
    link: z.string().url().optional(),
    status: z.enum(["planned", "active", "completed", "archived"]).optional().default("active"),
    /** research = Research tab; commercial = Work tab */
    track: z.enum(["research", "commercial"]).optional().default("research"),
    /** True when the project is not yet fully public */
    stealth: z.boolean().optional().default(false),
    /** Review / opinion rather than primary research */
    review: z.boolean().optional().default(false),
    /** Optional blog post id explaining the project */
    blog: z.string().optional(),
    /** Related own paper ids under src/content/papers/ */
    papers: z.array(z.string()).default([]),
    /** Related curated paper ids under src/content/interesting-papers/ */
    interestingPapers: z.array(z.string()).default([]),
    /** Collaborator ids linked to this project */
    people: z.array(z.string()).default([]),
    /** Related prize ids under src/content/prizes/ */
    prizes: z.array(z.string()).default([]),
    /** Lab ids under src/content/labs/ */
    labs: z.array(z.string()).default([]),
    /** Department ids under src/content/departments/ */
    departments: z.array(z.string()).default([]),
    /** Institution ids under src/content/institutions/ */
    institutions: z.array(z.string()).default([]),
    /** Company ids under src/content/companies/ */
    companies: z.array(z.string()).default([]),
    pinned: z.boolean().optional().default(false),
  }),
});

const collaborators = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/collaborators" }),
  schema: z.object({
    name: z.string(),
    role: z.string(),
    affiliation: z.string(),
    /** Institution id under src/content/institutions/ */
    institution: z.string().optional(),
    /** Primary department id under src/content/departments/ */
    department: z.string().optional(),
    /** Additional department ids (multi-affiliation). Merged with `department`. */
    departments: z.array(z.string()).default([]),
    /** Lab id under src/content/labs/ */
    lab: z.string().optional(),
    /** Company id under src/content/companies/ */
    company: z.string().optional(),
    /** supervisor / former supervisor / collaborator — used for page sections */
    kind: z
      .enum([
        "collaborator",
        "supervisor",
        "co-supervisor",
        "former-supervisor",
        "student",
      ])
      .optional()
      .default("collaborator"),
    summary: z.string(),
    url: z.string().url(),
    order: z.number().optional().default(100),
    pinned: z.boolean().optional().default(false),
    tags: z.array(z.string()).default([]),
    /** Citation forms as they appear in paper author lists, e.g. "Adlung L." */
    aliases: z.array(z.string()).default([]),
    /** Explicit person ids this collaborator works with (org-graph labmate springs). */
    network: z.array(z.string()).default([]),
    links: z
      .array(
        z.object({
          label: z.string(),
          href: z.string().url(),
        }),
      )
      .default([]),
  }),
});

const institutions = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/institutions" }),
  schema: z.object({
    name: z.string(),
    /** Short label for chips / filters, e.g. "Oxford" */
    short: z.string(),
    summary: z.string().optional(),
    url: z.string().url().optional(),
    /** Parent institution id (e.g. UKE → Universität Hamburg) */
    parent: z.string().optional(),
    order: z.number().optional().default(100),
  }),
});

/** Institution → department → lab */
const departments = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/departments" }),
  schema: z.object({
    name: z.string(),
    /** Short label for chips, e.g. "CHG" */
    short: z.string(),
    /** Institution id under src/content/institutions/ */
    institution: z.string(),
    summary: z.string().optional(),
    url: z.string().url().optional(),
    order: z.number().optional().default(100),
  }),
});

const labs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/labs" }),
  schema: z.object({
    name: z.string(),
    /** Department id under src/content/departments/ */
    department: z.string(),
    summary: z.string().optional(),
    url: z.string().url().optional(),
    order: z.number().optional().default(100),
  }),
});

const companies = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/companies" }),
  schema: z.object({
    name: z.string(),
    /** Short label for chips, e.g. "Parqet" */
    short: z.string(),
    summary: z.string().optional(),
    url: z.string().url().optional(),
    order: z.number().optional().default(100),
  }),
});

const conferences = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/conferences" }),
  schema: z.object({
    title: z.string(),
    year: z.number(),
    location: z.string().optional(),
    role: z
      .enum(["attendee", "speaker", "poster", "organizer"])
      .optional()
      .default("attendee"),
    tags: z.array(z.string()).default([]),
    url: z.string().url().optional(),
    summary: z.string().optional(),
    /** Optional linked poster id under src/content/posters/ */
    poster: z.string().optional(),
  }),
});

const posters = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posters" }),
  schema: z.object({
    title: z.string(),
    year: z.number(),
    authors: z.string().optional(),
    venue: z.string().optional(),
    summary: z.string().optional(),
    tags: z.array(z.string()).default([]),
    url: z.string().url().optional(),
    pdf: z.string().optional(),
    /** Optional linked conference id under src/content/conferences/ */
    conference: z.string().optional(),
    pinned: z.boolean().optional().default(false),
    blog: z.string().optional(),
  }),
});

const prizes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/prizes" }),
  schema: z.object({
    title: z.string(),
    year: z.number(),
    kind: z.enum(["prize", "scholarship", "award"]).optional().default("award"),
    issuer: z.string().optional(),
    summary: z.string().optional(),
    tags: z.array(z.string()).default([]),
    url: z.string().url().optional(),
    /** Optional linked project id under src/content/projects/ */
    project: z.string().optional(),
  }),
});

/** CV roles / positions that can have a dedicated detail page. */
const experience = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/experience" }),
  schema: z.object({
    title: z.string(),
    period: z.string(),
    year: z.number(),
    org: z.string(),
    institution: z.string().optional(),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    papers: z.array(z.string()).default([]),
    posters: z.array(z.string()).default([]),
    people: z.array(z.string()).default([]),
    projects: z.array(z.string()).default([]),
    /** Company id under src/content/companies/ */
    company: z.string().optional(),
    order: z.number().optional().default(100),
  }),
});

/** Curated papers by others that are worth reading — not own publications. */
const interestingPapers = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/interesting-papers" }),
  schema: z.object({
    title: z.string(),
    year: z.number(),
    authors: z.string(),
    venue: z.string().optional(),
    /** Short note on why this paper is interesting */
    note: z.string().optional(),
    tags: z.array(z.string()).default([]),
    url: z.string().url().optional(),
    preprint: z.boolean().optional().default(false),
    /** Collaborator ids to surface this paper under their profile */
    people: z.array(z.string()).default([]),
    /** Lab ids under src/content/labs/ */
    labs: z.array(z.string()).default([]),
    /** Department ids under src/content/departments/ */
    departments: z.array(z.string()).default([]),
    /** Institution ids under src/content/institutions/ */
    institutions: z.array(z.string()).default([]),
  }),
});

export const collections = {
  blog,
  papers,
  projects,
  collaborators,
  institutions,
  departments,
  labs,
  companies,
  conferences,
  posters,
  prizes,
  experience,
  interestingPapers,
};

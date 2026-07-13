import type { CollectionEntry } from "astro:content";

export type Institution = CollectionEntry<"institutions">;
export type Department = CollectionEntry<"departments">;
export type Lab = CollectionEntry<"labs">;
export type Company = CollectionEntry<"companies">;

export function institutionLabel(
  id: string | undefined,
  institutions: Institution[],
): string {
  if (!id) return "";
  return institutions.find((i) => i.id === id)?.data.short ?? id;
}

export function departmentLabel(
  id: string | undefined,
  departments: Department[],
): string {
  if (!id) return "";
  return departments.find((d) => d.id === id)?.data.short ?? id;
}

export function labLabel(id: string | undefined, labs: Lab[]): string {
  if (!id) return "";
  return labs.find((l) => l.id === id)?.data.name ?? id;
}

export function companyLabel(
  id: string | undefined,
  companies: Company[],
): string {
  if (!id) return "";
  return companies.find((c) => c.id === id)?.data.short ?? id;
}

/** Resolve institution id for a lab via its department. */
export function institutionForLab(
  labId: string | undefined,
  labs: Lab[],
  departments: Department[],
): string | undefined {
  if (!labId) return undefined;
  const lab = labs.find((l) => l.id === labId);
  if (!lab) return undefined;
  return departments.find((d) => d.id === lab.data.department)?.data.institution;
}

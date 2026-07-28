import { getJsonObject, putJsonObject } from "./object-storage";

export type VisitUploadEntry = {
  country: string;
  id: string;
};

export type VisitSnapshot = {
  keys: string[];
  sourceName: string;
  sourceRows: number;
  uniqueVisits: number;
  countryCounts: Record<string, number>;
  stateCounts: Record<string, number>;
  waveCounts: Record<string, number>;
  uploadedAt: number;
};

const VISITS_KEY = "active-visits/informes.json";

export const normalizeVisitCountry = (entry: unknown) => String(entry ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ")
  .toUpperCase();

export const normalizeVisitId = (entry: unknown) => String(entry ?? "")
  .trim()
  .replace(/^["']|["']$/g, "")
  .replace(/\.0+$/, "")
  .toUpperCase();

export const visitKey = (country: unknown, id: unknown) => {
  const normalizedCountry = normalizeVisitCountry(country);
  const normalizedId = normalizeVisitId(id);
  return normalizedCountry && normalizedId ? `${normalizedCountry}|${normalizedId}` : "";
};

export async function getVisitSnapshot(): Promise<VisitSnapshot | null> {
  return getJsonObject<VisitSnapshot>(VISITS_KEY);
}

export async function putVisitSnapshot(snapshot: VisitSnapshot) {
  await putJsonObject(VISITS_KEY, snapshot);
}

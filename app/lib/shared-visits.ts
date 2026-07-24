import { env } from "cloudflare:workers";

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

type StoredObject = {
  json<T>(): Promise<T>;
};

type R2BucketLike = {
  get(key: string): Promise<StoredObject | null>;
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
};

type StorageEnvironment = {
  UPLOADS?: R2BucketLike;
};

const VISITS_KEY = "active-visits/informes.json";
const storage = () => {
  const bucket = (env as unknown as StorageEnvironment).UPLOADS;
  if (!bucket) throw new Error("El almacenamiento compartido no está configurado.");
  return bucket;
};

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
  const object = await storage().get(VISITS_KEY);
  return object ? object.json<VisitSnapshot>() : null;
}

export async function putVisitSnapshot(snapshot: VisitSnapshot) {
  await storage().put(VISITS_KEY, JSON.stringify(snapshot), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

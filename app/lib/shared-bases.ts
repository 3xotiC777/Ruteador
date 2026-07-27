export const COUNTRY_IDS = ["rd", "gt-embocen", "gt-abvo", "cr"] as const;
export type CountryId = typeof COUNTRY_IDS[number];
export type SharedRow = Record<string, string | number | null | undefined>;
export type SharedBase = {
  rows: SharedRow[];
  sourceName: string;
  auditorLimits: Record<string, number>;
  defaultDay: number;
  updatedAt: number;
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

const getEnv = (): StorageEnvironment => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cf = require("cloudflare:workers");
    return (cf?.env ?? process.env) as StorageEnvironment;
  } catch {
    return (process.env as unknown as StorageEnvironment) ?? {};
  }
};

const storage = () => {
  const bucket = getEnv().UPLOADS;
  if (!bucket) throw new Error("El almacenamiento compartido no está configurado.");
  return bucket;
};

const keyFor = (country: CountryId) => `active-bases/${country}.json`;

export const isCountryId = (value: string): value is CountryId =>
  (COUNTRY_IDS as readonly string[]).includes(value);

export async function getSharedBase(country: CountryId): Promise<SharedBase | null> {
  const object = await storage().get(keyFor(country));
  if (!object) return null;
  return object.json<SharedBase>();
}

export async function putSharedBase(country: CountryId, base: SharedBase) {
  await storage().put(keyFor(country), JSON.stringify(base), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

import { CountryId } from "./shared-bases";

export type ForecastEntry = {
  date: string;
  country: CountryId;
  study: string;
  forecast: number | null;
  day: number;
};

export type ForecastSnapshot = {
  entries: ForecastEntry[];
  sourceName: string;
  uploadedAt: number;
};

type StoredObject = { json<T>(): Promise<T> };
type R2BucketLike = {
  get(key: string): Promise<StoredObject | null>;
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
};
type StorageEnvironment = { UPLOADS?: R2BucketLike };

const getEnv = (): StorageEnvironment => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cf = require("cloudflare:workers");
    return (cf?.env ?? process.env) as StorageEnvironment;
  } catch {
    return (process.env as unknown as StorageEnvironment) ?? {};
  }
};

const FORECAST_KEY = "active-forecast/current.json";
const storage = () => {
  const bucket = getEnv().UPLOADS;
  if (!bucket) throw new Error("El almacenamiento compartido no está configurado.");
  return bucket;
};

export async function getForecastSnapshot(): Promise<ForecastSnapshot | null> {
  const object = await storage().get(FORECAST_KEY);
  return object ? object.json<ForecastSnapshot>() : null;
}

export async function putForecastSnapshot(snapshot: ForecastSnapshot) {
  await storage().put(FORECAST_KEY, JSON.stringify(snapshot), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

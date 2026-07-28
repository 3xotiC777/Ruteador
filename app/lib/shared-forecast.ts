import { CountryId } from "./shared-bases";
import { getJsonObject, putJsonObject } from "./object-storage";

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

const FORECAST_KEY = "active-forecast/current.json";

export async function getForecastSnapshot(): Promise<ForecastSnapshot | null> {
  return getJsonObject<ForecastSnapshot>(FORECAST_KEY);
}

export async function putForecastSnapshot(snapshot: ForecastSnapshot) {
  await putJsonObject(FORECAST_KEY, snapshot);
}

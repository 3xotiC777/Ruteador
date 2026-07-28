import { getJsonObject, putJsonObject } from "./object-storage";

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

const keyFor = (country: CountryId) => `active-bases/${country}.json`;

export const isCountryId = (value: string): value is CountryId =>
  (COUNTRY_IDS as readonly string[]).includes(value);

export async function getSharedBase(country: CountryId): Promise<SharedBase | null> {
  return getJsonObject<SharedBase>(keyFor(country));
}

export async function putSharedBase(country: CountryId, base: SharedBase) {
  await putJsonObject(keyFor(country), base);
}

import { CountryId } from "./shared-bases";
import { getJsonObject, putJsonObject } from "./object-storage";

export type SpecialRequestEntry = {
  country: CountryId;
  study: string;
  day: number;
  pointId: string;
  auditor: string;
  originalAuditor: string;
  assignedAt: number;
  assignedBy: string;
};

export type SpecialRequestSnapshot = {
  entries: SpecialRequestEntry[];
  updatedAt: number;
};

const SPECIAL_REQUESTS_KEY = "active-special-requests/assignments.json";

export async function getSpecialRequestSnapshot(): Promise<SpecialRequestSnapshot | null> {
  return getJsonObject<SpecialRequestSnapshot>(SPECIAL_REQUESTS_KEY);
}

export async function putSpecialRequestSnapshot(snapshot: SpecialRequestSnapshot) {
  await putJsonObject(SPECIAL_REQUESTS_KEY, snapshot);
}

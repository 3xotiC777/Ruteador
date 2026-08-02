export type RouterPoint = {
  key: string;
  id: string;
  name: string;
  address: string;
  channel: string;
  route: string;
  fixed: boolean;
  selection: string;
  lat: number | null;
  lng: number | null;
};

export type RouterPlan = {
  auditor: string;
  country: string;
  study?: string;
  createdAt: number;
  points: RouterPoint[];
};

export const ROUTER_STORAGE_PREFIX = "dn-auditor-route:";

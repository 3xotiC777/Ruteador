import { readSession } from "../../lib/auth";
import { getSharedBase } from "../../lib/shared-bases";
import {
  getVisitSnapshot,
  putVisitSnapshot,
  VisitSnapshot,
  VisitUploadEntry,
  visitKey,
} from "../../lib/shared-visits";

const noStore = { "Cache-Control": "no-store" };
const sameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};
const cleanCounts = (entry: unknown) => {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return {};
  return Object.fromEntries(Object.entries(entry).flatMap(([key, count]) => {
    const cleanKey = String(key).trim().slice(0, 150);
    const cleanCount = typeof count === "number" && Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
    return cleanKey && cleanCount ? [[cleanKey, cleanCount]] : [];
  }));
};
const normalizeHeader = (entry: unknown) => String(entry ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]/g, "")
  .toUpperCase();
const idAliases = ["ID cliente/PDV", "Codigo DN", "CODIGO D&N", "Código DN", "Codigo", "CÓDIGO", "RefID"];
const idFromRow = (row: Record<string, unknown>) => {
  const header = Object.keys(row).find((candidate) => idAliases.some((alias) => normalizeHeader(candidate) === normalizeHeader(alias)));
  return header ? String(row[header] ?? "").trim().replace(/\.0+$/, "").toUpperCase() : "";
};

export async function GET(request: Request) {
  const user = await readSession(request);
  if (!user) return Response.json({ error: "Sesión no válida." }, { status: 401, headers: noStore });
  const snapshot = await getVisitSnapshot();
  if (!snapshot) return Response.json({ error: "Todavía no hay un export de visitas cargado." }, { status: 404, headers: noStore });
  if (user.role === "Campo" && user.country) {
    const base = await getSharedBase(user.country);
    const allowedIds = new Set((base?.rows ?? []).map((row) => idFromRow(row)).filter(Boolean));
    const keys = snapshot.keys.filter((key) => allowedIds.has(key.slice(key.lastIndexOf("|") + 1)));
    return Response.json({
      ...snapshot,
      keys,
      uniqueVisits: keys.length,
      countryCounts: {},
      stateCounts: {},
      waveCounts: {},
    }, { headers: noStore });
  }
  return Response.json(snapshot, { headers: noStore });
}

export async function PUT(request: Request) {
  const user = await readSession(request);
  if (!user) return Response.json({ error: "Sesión no válida." }, { status: 401, headers: noStore });
  if (user.role !== "Administrador") return Response.json({ error: "Solo Administrador puede cargar el export de visitas." }, { status: 403, headers: noStore });
  if (!sameOrigin(request)) return Response.json({ error: "Origen no permitido." }, { status: 403, headers: noStore });

  try {
    const body = await request.json() as {
      entries?: VisitUploadEntry[];
      sourceName?: unknown;
      sourceRows?: unknown;
      stateCounts?: unknown;
      waveCounts?: unknown;
    };
    if (!Array.isArray(body.entries) || !body.entries.length || body.entries.length > 250_000) {
      return Response.json({ error: "El export debe contener entre 1 y 250.000 visitas únicas." }, { status: 400, headers: noStore });
    }
    if (typeof body.sourceName !== "string" || !body.sourceName.trim() || body.sourceName.length > 255) {
      return Response.json({ error: "El nombre del export no es válido." }, { status: 400, headers: noStore });
    }

    const keys = new Set<string>();
    for (const entry of body.entries) {
      if (!entry || typeof entry !== "object") continue;
      const key = visitKey(entry.country, entry.id);
      if (key) keys.add(key);
    }
    if (!keys.size) return Response.json({ error: "No se encontraron combinaciones válidas de País + ID PDV." }, { status: 400, headers: noStore });

    const countryCounts: Record<string, number> = {};
    for (const key of keys) {
      const country = key.slice(0, key.lastIndexOf("|"));
      countryCounts[country] = (countryCounts[country] ?? 0) + 1;
    }
    const sourceRows = typeof body.sourceRows === "number" && Number.isFinite(body.sourceRows)
      ? Math.max(keys.size, Math.min(500_000, Math.trunc(body.sourceRows)))
      : keys.size;
    const snapshot: VisitSnapshot = {
      keys: [...keys],
      sourceName: body.sourceName.trim(),
      sourceRows,
      uniqueVisits: keys.size,
      countryCounts,
      stateCounts: cleanCounts(body.stateCounts),
      waveCounts: cleanCounts(body.waveCounts),
      uploadedAt: Date.now(),
    };

    await putVisitSnapshot(snapshot);
    return Response.json(snapshot, { headers: noStore });
  } catch {
    return Response.json({ error: "No fue posible guardar el export compartido." }, { status: 400, headers: noStore });
  }
}

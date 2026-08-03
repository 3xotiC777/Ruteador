import { readSession } from "../../lib/auth";
import { getSharedBase, isCountryId, type CountryId, type SharedRow } from "../../lib/shared-bases";
import {
  getSpecialRequestSnapshot,
  putSpecialRequestSnapshot,
  type SpecialRequestEntry,
  type SpecialRequestSnapshot,
} from "../../lib/shared-special-requests";

const noStore = { "Cache-Control": "no-store" };
const sameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};
const normalize = (entry: unknown) => String(entry ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]/g, "")
  .toUpperCase();
const value = (row: SharedRow, aliases: string[]) => {
  const key = Object.keys(row).find((header) => aliases.some((alias) => normalize(header) === normalize(alias)));
  return key ? String(row[key] ?? "").trim().replace(/\.0+$/, "") : "";
};
const idOf = (row: SharedRow) => value(row, ["Código DN", "Codigo DN", "ID cliente/PDV", "CODIGO D&N", "RefID", "Codigo", "CÓDIGO"]);
const auditorOf = (row: SharedRow) => value(row, ["Auditor", "Tabla11.auditor", "Responsable", "MT FINAL", "MT"]);
const studyOf = (row: SharedRow) => value(row, ["Estudio", "ESTUDIO"]) || "Sin estudio";
const scopeMatches = (entry: SpecialRequestEntry, country: CountryId, study: string, day: number) =>
  entry.country === country && normalize(entry.study) === normalize(study) && entry.day === day;

const parseScope = (request: Request) => {
  const url = new URL(request.url);
  const rawCountry = url.searchParams.get("country") ?? "";
  const study = (url.searchParams.get("study") ?? "").trim().slice(0, 150);
  const day = Number(url.searchParams.get("day"));
  if (!isCountryId(rawCountry) || !study || !Number.isInteger(day) || day < 1 || day > 31) return null;
  return { country: rawCountry, study, day };
};

export async function GET(request: Request) {
  const user = await readSession(request);
  if (!user) return Response.json({ error: "Sesión no válida." }, { status: 401, headers: noStore });
  const scope = parseScope(request);
  if (!scope) return Response.json({ error: "País, estudio o día no válido." }, { status: 400, headers: noStore });
  if (user.role === "Campo" && user.country !== scope.country) {
    return Response.json({ error: "Este usuario no tiene acceso a la operación solicitada." }, { status: 403, headers: noStore });
  }

  const snapshot = await getSpecialRequestSnapshot();
  const entries = (snapshot?.entries ?? []).filter((entry) => scopeMatches(entry, scope.country, scope.study, scope.day));
  return Response.json({
    assignments: Object.fromEntries(entries.map((entry) => [entry.pointId, entry.auditor])),
    entries,
    updatedAt: snapshot?.updatedAt ?? 0,
  }, { headers: noStore });
}

export async function PUT(request: Request) {
  const user = await readSession(request);
  if (!user) return Response.json({ error: "Sesión no válida." }, { status: 401, headers: noStore });
  if (user.role !== "Administrador") return Response.json({ error: "Solo Administrador puede asignar solicitudes especiales." }, { status: 403, headers: noStore });
  if (!sameOrigin(request)) return Response.json({ error: "Origen no permitido." }, { status: 403, headers: noStore });

  try {
    const body = await request.json() as {
      country?: unknown;
      study?: unknown;
      day?: unknown;
      assignments?: unknown;
      originalAuditors?: unknown;
    };
    const countryValue = String(body.country ?? "");
    const study = String(body.study ?? "").trim().slice(0, 150);
    const day = Number(body.day);
    if (!isCountryId(countryValue) || !study || !Number.isInteger(day) || day < 1 || day > 31) {
      return Response.json({ error: "País, estudio o día no válido." }, { status: 400, headers: noStore });
    }
    if (!body.assignments || typeof body.assignments !== "object" || Array.isArray(body.assignments)) {
      return Response.json({ error: "Las asignaciones no son válidas." }, { status: 400, headers: noStore });
    }

    const base = await getSharedBase(countryValue);
    if (!base) return Response.json({ error: "No hay una base compartida para esta operación." }, { status: 404, headers: noStore });
    const scopedRows = base.rows.filter((row) => normalize(studyOf(row)) === normalize(study));
    const pointsById = new Map(scopedRows.map((row) => [idOf(row), row]).filter(([id]) => Boolean(id)));
    const validAuditors = new Set(scopedRows.map(auditorOf).filter(Boolean));
    const rawAssignments = Object.entries(body.assignments as Record<string, unknown>);
    if (rawAssignments.length > 5_000) return Response.json({ error: "Hay demasiadas solicitudes especiales." }, { status: 400, headers: noStore });
    const originalAuditors = body.originalAuditors && typeof body.originalAuditors === "object" && !Array.isArray(body.originalAuditors)
      ? body.originalAuditors as Record<string, unknown>
      : {};
    const assignedAt = Date.now();
    const replacement: SpecialRequestEntry[] = [];
    for (const [rawId, rawAuditor] of rawAssignments) {
      const pointId = String(rawId).trim().replace(/\.0+$/, "");
      const auditor = String(rawAuditor ?? "").trim();
      const row = pointsById.get(pointId);
      if (!row || !validAuditors.has(auditor)) continue;
      replacement.push({
        country: countryValue,
        study,
        day,
        pointId,
        auditor,
        originalAuditor: String(originalAuditors[pointId] ?? auditorOf(row)).trim().slice(0, 200),
        assignedAt,
        assignedBy: user.username,
      });
    }

    const current = await getSpecialRequestSnapshot();
    const entries = (current?.entries ?? []).filter((entry) => !scopeMatches(entry, countryValue, study, day));
    entries.push(...replacement);
    const snapshot: SpecialRequestSnapshot = { entries, updatedAt: assignedAt };
    await putSpecialRequestSnapshot(snapshot);
    return Response.json({
      assignments: Object.fromEntries(replacement.map((entry) => [entry.pointId, entry.auditor])),
      entries: replacement,
      updatedAt: snapshot.updatedAt,
    }, { headers: noStore });
  } catch {
    return Response.json({ error: "No fue posible guardar las solicitudes especiales." }, { status: 400, headers: noStore });
  }
}

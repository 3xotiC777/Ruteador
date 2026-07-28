import { readSession } from "../../lib/auth";
import { isCountryId } from "../../lib/shared-bases";
import { ForecastEntry, ForecastSnapshot, getForecastSnapshot, putForecastSnapshot } from "../../lib/shared-forecast";

const noStore = { "Cache-Control": "no-store" };
const sameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const user = await readSession(request);
  if (!user) return Response.json({ error: "Sesión no válida." }, { status: 401, headers: noStore });
  const snapshot = await getForecastSnapshot();
  if (!snapshot) return Response.json({ error: "Todavía no hay un forecast mensual cargado." }, { status: 404, headers: noStore });
  if (user.role === "Campo" && user.country) {
    return Response.json({ ...snapshot, entries: snapshot.entries.filter((entry) => entry.country === user.country) }, { headers: noStore });
  }
  return Response.json(snapshot, { headers: noStore });
}

export async function PUT(request: Request) {
  const user = await readSession(request);
  if (!user) return Response.json({ error: "Sesión no válida." }, { status: 401, headers: noStore });
  if (user.role !== "Administrador") return Response.json({ error: "Solo Administrador puede cargar el forecast mensual." }, { status: 403, headers: noStore });
  if (!sameOrigin(request)) return Response.json({ error: "Origen no permitido." }, { status: 403, headers: noStore });

  try {
    const body = await request.json() as Partial<ForecastSnapshot>;
    if (!Array.isArray(body.entries) || !body.entries.length || body.entries.length > 10_000) {
      return Response.json({ error: "El forecast debe contener entre 1 y 10.000 filas válidas." }, { status: 400, headers: noStore });
    }
    if (typeof body.sourceName !== "string" || !body.sourceName.trim() || body.sourceName.length > 255) {
      return Response.json({ error: "El nombre del forecast no es válido." }, { status: 400, headers: noStore });
    }

    const entries: ForecastEntry[] = [];
    for (const raw of body.entries) {
      if (!raw || typeof raw !== "object" || !isoDate.test(String(raw.date)) || !isCountryId(String(raw.country))) continue;
      const day = Number(raw.day);
      const rawForecast = raw.forecast as unknown;
      const forecast = rawForecast === null || rawForecast === undefined || rawForecast === ""
        ? null
        : Number(rawForecast);
      if (!Number.isInteger(day) || day < 1 || day > 31 || (forecast !== null && !Number.isFinite(forecast))) continue;
      entries.push({
        date: String(raw.date),
        country: raw.country,
        study: String(raw.study ?? "").trim().slice(0, 150),
        forecast,
        day,
      });
    }
    if (!entries.length) return Response.json({ error: "No se encontraron fechas, países y días válidos." }, { status: 400, headers: noStore });

    entries.sort((left, right) => left.date.localeCompare(right.date) || left.country.localeCompare(right.country));
    const snapshot: ForecastSnapshot = { entries, sourceName: body.sourceName.trim(), uploadedAt: Date.now() };
    await putForecastSnapshot(snapshot);
    return Response.json(snapshot, { headers: noStore });
  } catch {
    return Response.json({ error: "No fue posible guardar el forecast mensual." }, { status: 400, headers: noStore });
  }
}

import { readSession } from "../../../lib/auth";
import { getSharedBase, isCountryId, putSharedBase, SharedBase } from "../../../lib/shared-bases";

type RouteContext = { params: Promise<{ country: string }> };
const noStore = { "Cache-Control": "no-store" };

const sameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await readSession(request);
  if (!user) return Response.json({ error: "Sesión no válida." }, { status: 401, headers: noStore });

  const { country } = await context.params;
  if (!isCountryId(country)) return Response.json({ error: "País no válido." }, { status: 404, headers: noStore });
  if (user.role === "Campo" && user.country !== country) {
    return Response.json({ error: "Este usuario no tiene acceso a la operación solicitada." }, { status: 403, headers: noStore });
  }

  const base = await getSharedBase(country);
  if (!base) return Response.json({ error: "Todavía no hay una base cargada para este país." }, { status: 404, headers: noStore });
  return Response.json(base, { headers: noStore });
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await readSession(request);
  if (!user) return Response.json({ error: "Sesión no válida." }, { status: 401, headers: noStore });
  if (user.role !== "Administrador") return Response.json({ error: "Solo Administrador puede reemplazar las bases." }, { status: 403, headers: noStore });
  if (!sameOrigin(request)) return Response.json({ error: "Origen no permitido." }, { status: 403, headers: noStore });

  const { country } = await context.params;
  if (!isCountryId(country)) return Response.json({ error: "País no válido." }, { status: 404, headers: noStore });

  try {
    const body = await request.json() as Partial<SharedBase>;
    if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 100_000) {
      return Response.json({ error: "La base debe contener entre 1 y 100.000 puntos." }, { status: 400, headers: noStore });
    }
    if (typeof body.sourceName !== "string" || !body.sourceName.trim() || body.sourceName.length > 255) {
      return Response.json({ error: "El nombre del archivo no es válido." }, { status: 400, headers: noStore });
    }

    const auditorLimits = body.auditorLimits && typeof body.auditorLimits === "object" && !Array.isArray(body.auditorLimits)
      ? Object.fromEntries(Object.entries(body.auditorLimits).filter(([auditor, cutoff]) =>
        auditor.length <= 200 && typeof cutoff === "number" && Number.isFinite(cutoff) && cutoff >= 1 && cutoff <= 31))
      : {};
    const defaultDay = typeof body.defaultDay === "number" && Number.isFinite(body.defaultDay)
      ? Math.min(31, Math.max(1, Math.trunc(body.defaultDay)))
      : 1;
    const base: SharedBase = {
      rows: body.rows,
      sourceName: body.sourceName.trim(),
      auditorLimits,
      defaultDay,
      updatedAt: Date.now(),
    };

    await putSharedBase(country, base);
    return Response.json(base, { headers: noStore });
  } catch {
    return Response.json({ error: "No fue posible guardar la base compartida." }, { status: 400, headers: noStore });
  }
}

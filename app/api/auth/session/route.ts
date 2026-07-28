import { readSession } from "../../../lib/auth";

export async function GET(request: Request) {
  const user = await readSession(request);
  if (!user) return Response.json({ error: "Sesión no válida." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return Response.json(
    { username: user.username, role: user.role, country: user.country },
    { headers: { "Cache-Control": "no-store" } },
  );
}

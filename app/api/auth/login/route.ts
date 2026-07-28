import { authenticate, createSessionToken, sessionCookie } from "../../../lib/auth";

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });

export async function POST(request: Request) {
  try {
    const body = await request.json() as { username?: unknown; password?: unknown };
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const user = authenticate(username, password);
    if (!user) return json({ error: "Usuario o contraseña incorrectos." }, 401);

    const token = await createSessionToken(user);
    return json(
      { username: user.username, role: user.role, country: user.country },
      200,
      { "Set-Cookie": sessionCookie(token, request) },
    );
  } catch {
    return json({ error: "No fue posible iniciar sesión." }, 400);
  }
}

export const dynamic = "force-dynamic";

import { clearSessionCookie } from "../../../lib/auth";

export async function POST(request: Request) {
  return Response.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": clearSessionCookie(request),
      },
    },
  );
}

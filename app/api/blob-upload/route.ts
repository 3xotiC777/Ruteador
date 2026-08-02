import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { readSession } from "../../lib/auth";

const noStore = { "Cache-Control": "no-store" };
const allowedPathnames = new Set([
  "active-bases/rd.json",
  "active-bases/gt-embocen.json",
  "active-bases/gt-abvo.json",
  "active-bases/cr.json",
  "active-bases/cl.json",
  "active-bases/ec.json",
  "active-bases/pa.json",
  "active-bases/sv.json",
  "active-bases/ni.json",
  "active-bases/hn.json",
  "active-visits/informes.json",
  "active-forecast/current.json",
]);
const sameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as HandleUploadPresignedBody;

    if (body.type === "blob.generate-presigned-url") {
      const user = await readSession(request);
      if (!user) return Response.json({ error: "Sesión no válida." }, { status: 401, headers: noStore });
      if (user.role !== "Administrador") {
        return Response.json({ error: "Solo Administrador puede reemplazar los datos compartidos." }, { status: 403, headers: noStore });
      }
      if (!sameOrigin(request)) return Response.json({ error: "Origen no permitido." }, { status: 403, headers: noStore });
    }

    const result = await handleUploadPresigned({
      request,
      body,
      getSignedToken: async (pathname) => {
        if (!allowedPathnames.has(pathname)) throw new Error("Ruta de almacenamiento no permitida.");
        const validUntil = Date.now() + 15 * 60 * 1000;
        return {
          token: await issueSignedToken({
            pathname,
            operations: ["put"],
            allowedContentTypes: ["application/json"],
            maximumSizeInBytes: 50 * 1024 * 1024,
            validUntil,
          }),
          urlOptions: {
            allowedContentTypes: ["application/json"],
            maximumSizeInBytes: 50 * 1024 * 1024,
            validUntil,
            addRandomSuffix: false,
            allowOverwrite: true,
            cacheControlMaxAge: 60,
          },
        };
      },
    });
    return Response.json(result, { headers: noStore });
  } catch {
    return Response.json({ error: "No fue posible autorizar la carga al almacenamiento privado." }, { status: 400, headers: noStore });
  }
}

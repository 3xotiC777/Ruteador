type StoredObject = { json<T>(): Promise<T> };
type R2BucketLike = {
  get(key: string): Promise<StoredObject | null>;
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
};
type StorageEnvironment = {
  UPLOADS?: R2BucketLike;
  VERCEL?: string;
  BLOB_STORE_ID?: string;
  BLOB_READ_WRITE_TOKEN?: string;
};

const getEnv = (): StorageEnvironment => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cf = require("cloudflare:workers");
    return (cf?.env ?? process.env) as StorageEnvironment;
  } catch {
    return (process.env as unknown as StorageEnvironment) ?? {};
  }
};

const r2Bucket = () => {
  const bucket = getEnv().UPLOADS;
  return bucket && typeof bucket.get === "function" && typeof bucket.put === "function" ? bucket : null;
};

const canUseVercelBlob = () => {
  const environment = getEnv();
  return Boolean(environment.VERCEL || environment.BLOB_STORE_ID || environment.BLOB_READ_WRITE_TOKEN);
};

export async function getJsonObject<T>(key: string): Promise<T | null> {
  const bucket = r2Bucket();
  if (bucket) {
    const object = await bucket.get(key);
    return object ? object.json<T>() : null;
  }
  if (canUseVercelBlob()) {
    const { get } = await import("@vercel/blob");
    const object = await get(key, { access: "private", useCache: false });
    if (!object || object.statusCode !== 200 || !object.stream) return null;
    return new Response(object.stream).json() as Promise<T>;
  }
  throw new Error("El almacenamiento compartido no está configurado.");
}

export async function putJsonObject(key: string, value: unknown) {
  const serialized = JSON.stringify(value);
  const bucket = r2Bucket();
  if (bucket) {
    await bucket.put(key, serialized, { httpMetadata: { contentType: "application/json; charset=utf-8" } });
    return;
  }
  if (canUseVercelBlob()) {
    const { put } = await import("@vercel/blob");
    await put(key, serialized, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "application/json; charset=utf-8",
    });
    return;
  }
  throw new Error("El almacenamiento compartido no está configurado.");
}

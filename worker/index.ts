/** Cloudflare Worker entry point for Ruteador planeación. */
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  UPLOADS: R2Bucket;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  FIELD_USERNAME: string;
  FIELD_PASSWORD: string;
  SESSION_SECRET: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handler.fetch(request, env, ctx);
  },
};

export default worker;

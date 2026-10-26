import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { InsufficientCreditsError } from "@postline/core";

export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly extra?: Record<string, unknown>) {
    super(message);
  }
}

export const badRequest = (msg: string, extra?: Record<string, unknown>) => new HttpError(400, msg, extra);
export const unauthorized = () => new HttpError(401, "Not signed in");
export const forbidden = (msg = "You don't have permission to do that") => new HttpError(403, msg);
export const notFound = (msg = "Not found") => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Invalid JSON body");
  }
  return schema.parse(raw);
}

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<Response | unknown>;

/**
 * Wrap a route handler: returns JSON for plain values, maps HttpError / ZodError /
 * InsufficientCreditsError to proper status codes.
 *   export const GET = route(async (req, { params }) => ({ ok: true }));
 */
export function route<Ctx = { params: Promise<Record<string, string>> }>(handler: Handler<Ctx>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      const out = await handler(req, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status });
      if (err instanceof ZodError)
        return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input", issues: err.issues }, { status: 400 });
      if (err instanceof InsufficientCreditsError)
        return NextResponse.json(
          { error: "You've run out of credits. Upgrade to get more.", needed: err.needed, remaining: err.remaining },
          { status: 402 },
        );
      // @postline/ai errors, matched by name to keep this module free of server-only imports.
      if (err instanceof Error) {
        if (err.message.startsWith("AI is not configured"))
          return NextResponse.json({ error: "AI isn't configured on this server yet." }, { status: 503 });
        if (err.name === "AiRefusalError")
          return NextResponse.json({ error: "The AI declined this request. Try rephrasing it." }, { status: 422 });
        if (err.name === "AiOutputError")
          return NextResponse.json({ error: "The AI returned an unusable result. Please try again." }, { status: 502 });
        if (err.name === "UnsafeUrlError")
          return NextResponse.json({ error: "That URL can't be fetched." }, { status: 400 });
      }
      console.error(err);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

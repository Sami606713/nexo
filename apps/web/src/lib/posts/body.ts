import type { z } from "zod";
import { parseBody } from "@/lib/http";

/** parseBody with the schema's *output* type (defaults applied). */
export function readBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.output<S>> {
  return parseBody(req, schema) as Promise<z.output<S>>;
}

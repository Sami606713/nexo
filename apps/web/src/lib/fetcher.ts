export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly body?: unknown) {
    super(message);
  }
}

async function parse(res: Response) {
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body?.error ?? res.statusText, body);
  return body;
}

export const fetcher = (url: string) => fetch(url).then(parse);

export async function api<T = unknown>(url: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse(res) as Promise<T>;
}

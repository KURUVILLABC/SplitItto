import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "The request is invalid.", details: error.issues.map((issue) => issue.message) },
      { status: 400 },
    );
  }
  console.error("API request failed", error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol ?? new URL(request.url).protocol.replace(/:$/, "");
  try {
    if (!host || new URL(origin).origin !== `${protocol}://${host}`) {
      throw new HttpError("Cross-origin requests are not allowed.", 403);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError("Cross-origin requests are not allowed.", 403);
  }
}

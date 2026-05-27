import { NextResponse } from "next/server";

export function jsonError(error: unknown) {
  if (error instanceof Response) {
    return new NextResponse(error.body, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status: 500 });
}

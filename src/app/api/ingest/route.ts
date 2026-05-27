import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireAdminOrAdvisor } from "@/lib/auth";
import { jsonError } from "@/lib/http";

const execFileAsync = promisify(execFile);

export async function POST() {
  try {
    await requireAdminOrAdvisor();
    const result = await execFileAsync("npm", ["run", "ingest"], { cwd: process.cwd(), timeout: 120000 });
    return NextResponse.json({ ok: true, output: result.stdout, errors: result.stderr });
  } catch (error) {
    return jsonError(error);
  }
}

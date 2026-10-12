import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { worldLabsKey } from "@/lib/env";
import { mockOperation } from "@/lib/mock-world";
import { assetUrl, fetchOperation, WorldLabsError } from "@/lib/worldlabs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ operationId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { operationId } = await context.params;
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(operationId)) {
    return Response.json({ error: "Unknown operation." }, { status: 404 });
  }

  const url = new URL(request.url);
  const asset = url.searchParams.get("asset") || "splat";
  const variant = url.searchParams.get("variant");

  if (operationId.startsWith("mock_")) {
    const operation = mockOperation(operationId);
    if (!operation?.done) return Response.json({ error: "The mock world is not ready yet." }, { status: 409 });
    if (asset === "splat") {
      const bytes = await readFile(path.join(process.cwd(), "public/mock/courtyard.splat"));
      return new Response(bytes, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": "attachment; filename=\"courtyard.splat\"",
        },
      });
    }
    const target = assetUrl(operation, asset, variant);
    if (!target?.startsWith("/")) return Response.json({ error: "That file is not part of the mock world." }, { status: 404 });
    return NextResponse.redirect(new URL(target, request.url));
  }

  const apiKey = worldLabsKey();
  if (!apiKey) {
    return Response.json({ error: "WORLDLABS_API_KEY is not set." }, { status: 503 });
  }

  try {
    const operation = await fetchOperation(apiKey, operationId);
    const target = assetUrl(operation, asset, variant);
    if (!target) return Response.json({ error: "That asset is not available yet." }, { status: 404 });
    return NextResponse.redirect(target);
  } catch (error) {
    if (error instanceof WorldLabsError) {
      return Response.json({ error: error.message }, { status: error.status === 404 ? 404 : 502 });
    }
    return Response.json({ error: "Could not resolve the download." }, { status: 502 });
  }
}

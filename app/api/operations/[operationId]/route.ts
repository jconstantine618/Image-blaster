import { worldLabsKey } from "@/lib/env";
import { mockOperation } from "@/lib/mock-world";
import { fetchOperation, WorldLabsError } from "@/lib/worldlabs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ operationId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { operationId } = await context.params;
  if (!isSafeId(operationId)) {
    return Response.json({ error: "Unknown operation." }, { status: 404 });
  }

  if (operationId.startsWith("mock_")) {
    const operation = mockOperation(operationId);
    if (!operation) return Response.json({ error: "Unknown mock operation." }, { status: 404 });
    return Response.json(operation);
  }

  const apiKey = worldLabsKey();
  if (!apiKey) {
    return Response.json({ error: "WORLDLABS_API_KEY is not set, so this operation cannot be polled." }, { status: 503 });
  }

  try {
    const operation = await fetchOperation(apiKey, operationId);
    return Response.json(operation);
  } catch (error) {
    if (error instanceof WorldLabsError) {
      const status = error.status === 404 ? 404 : error.status >= 400 && error.status < 600 ? error.status : 502;
      return Response.json({ error: error.message }, { status });
    }
    return Response.json({ error: "Could not poll the World Labs operation." }, { status: 502 });
  }
}

function isSafeId(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,160}$/.test(value);
}

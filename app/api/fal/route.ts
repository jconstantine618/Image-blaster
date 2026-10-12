import { falKey } from "@/lib/env";
import { isFalTask, pollFalJob, submitFalJob, type FalTask } from "@/lib/fal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const apiKey = falKey();
  if (!apiKey) {
    return Response.json({ error: "Objects and sound are off until FAL_KEY is set." }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const task = typeof body?.task === "string" ? body.task : "";
  if (!isFalTask(task)) {
    return Response.json({ error: "Unknown FAL task." }, { status: 400 });
  }

  try {
    const requestId = await submitFalJob(apiKey, {
      task,
      prompt: typeof body?.prompt === "string" ? body.prompt : undefined,
      imageUrl: typeof body?.imageUrl === "string" ? body.imageUrl : undefined,
      loop: body?.loop === true,
      durationSeconds: typeof body?.durationSeconds === "number" ? body.durationSeconds : undefined,
    });
    return Response.json({ requestId, task: task satisfies FalTask });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FAL request failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const apiKey = falKey();
  if (!apiKey) {
    return Response.json({ error: "Objects and sound are off until FAL_KEY is set." }, { status: 409 });
  }
  const url = new URL(request.url);
  const task = url.searchParams.get("task") || "";
  const requestId = url.searchParams.get("requestId") || "";
  if (!isFalTask(task)) return Response.json({ error: "Unknown FAL task." }, { status: 400 });

  try {
    const job = await pollFalJob(apiKey, task, requestId);
    return Response.json(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : "FAL status failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}

// GET /api/topic-regeneration/status?job_id=N -- polling do frontend
// enquanto o job roda em background (docs/14: "sem travar esperando
// síncrono").
import { getCurrentUser, unauthorized } from "../../_lib/auth";
import { Env } from "../../_lib/types";

interface JobRow {
  id: number;
  content_topic_id: number;
  status: string;
  requested_at: string;
  completed_at: string | null;
  error: string | null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const idParam = new URL(request.url).searchParams.get("job_id");
  const jobId = idParam ? Number(idParam) : NaN;
  if (!Number.isInteger(jobId)) {
    return Response.json({ error: "job_id inválido" }, { status: 400 });
  }

  const job = await env.DB.prepare(
    `SELECT id, content_topic_id, status, requested_at, completed_at, error
     FROM topic_regeneration_jobs WHERE id = ? AND user_id = ?`
  )
    .bind(jobId, user.id)
    .first<JobRow>();

  if (!job) return Response.json({ error: "job não encontrado" }, { status: 404 });
  return Response.json({ job });
};

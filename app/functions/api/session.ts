// GET /api/session?limit=10 -- Fase 9 (CLAUDE.md): sessao intercalada,
// vencidos FSRS primeiro, depois novos. Le SEMPRE de servable_exercises
// (nunca exercises direto) -- ponto estrutural unico de leitura, CLAUDE.md.
//
// "Home por categoria" (docs/12) -- ?scope=grammar|phonetics&categoria=...
// escopa a mesma composicao a uma categoria de content_topics/
// phonetic_points em vez do pool inteiro; ?template=... (opcional) restringe
// ainda mais a um unico formato dentro do grupo -- e' o filtro de formato
// do grid de categorias. Sem `scope`, comportamento identico a sempre
// (usado pelo card "Revisao de hoje").
import { getCurrentUser, unauthorized } from "../_lib/auth";
import { composeSession, formatExerciseForClient, SessionScope } from "../_lib/session";
import { Env, GRAMMAR_TEMPLATES, PHONETICS_TEMPLATES } from "../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 30);
  const scopeParam = url.searchParams.get("scope");
  const categoria = url.searchParams.get("categoria");
  const templateParam = url.searchParams.get("template");

  let scope: SessionScope | undefined;
  if (scopeParam) {
    if (!categoria) return Response.json({ error: "categoria obrigatória junto de scope" }, { status: 400 });

    const base =
      scopeParam === "grammar"
        ? { kind: "content_topic" as const, templates: GRAMMAR_TEMPLATES as readonly string[] }
        : scopeParam === "phonetics"
          ? { kind: "phonetic_point" as const, templates: PHONETICS_TEMPLATES as readonly string[] }
          : null;
    if (!base) return Response.json({ error: "scope inválido (use grammar ou phonetics)" }, { status: 400 });

    let templates = base.templates;
    if (templateParam) {
      if (!base.templates.includes(templateParam)) {
        return Response.json({ error: "template não pertence a esse scope" }, { status: 400 });
      }
      templates = [templateParam];
    }
    scope = { kind: base.kind, categoria, templates };
  }

  const exercises = await composeSession(env.DB, user.id, limit, scope);

  return Response.json({ exercises: exercises.map(formatExerciseForClient) });
};

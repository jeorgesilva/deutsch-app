// GET /api/categories?group=grammar|phonetics -- "home por categoria"
// (docs/12): grid de categorias reais da KB curada, cada uma com contagem
// de topicos, pendentes FSRS e indicador de dominio.
import { getCurrentUser, unauthorized } from "../_lib/auth";
import { listCategories } from "../_lib/categories";
import { Env } from "../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const group = new URL(request.url).searchParams.get("group");
  if (group !== "grammar" && group !== "phonetics") {
    return Response.json({ error: "group inválido (use grammar ou phonetics)" }, { status: 400 });
  }

  const categories = await listCategories(env.DB, user.id, group);
  return Response.json({ categories });
};

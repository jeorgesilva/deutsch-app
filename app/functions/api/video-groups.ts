// GET /api/video-groups -- lista (hub de Vídeo). GET /api/video-groups?url=
// -- detalhe de um grupo (sequência ordenada de tarefas daquele vídeo).
// Querystring em vez de segmento dinâmico porque a URL do YouTube tem
// caracteres que complicariam um path param -- mesmo espírito do achado já
// registrado no CLAUDE.md sobre nunca deixar caractere especial virar
// identificador de rota/chave.
import { getCurrentUser, unauthorized } from "../_lib/auth";
import { getVideoGroupDetail, listVideoGroups } from "../_lib/videoGroups";
import { Env } from "../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser({ request, env });
  if (!user) return unauthorized();

  const url = new URL(request.url).searchParams.get("url");
  if (url) {
    const group = await getVideoGroupDetail(env.DB, user.id, url);
    if (!group) return Response.json({ error: "grupo de vídeo não encontrado" }, { status: 404 });
    return Response.json(group);
  }

  const groups = await listVideoGroups(env.DB, user.id);
  return Response.json({ groups });
};

// GET /media/<qualquer-caminho> -- serve objetos do bucket R2 (audio de TTS
// gerado nas Fases 7/8). Rota catch-all (`[[path]]`, convencao do Pages
// Functions) porque audio_ref tem subpastas (ex. "dictation/1_1_....wav").
import { Env } from "../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const path = Array.isArray(params.path) ? params.path.join("/") : (params.path ?? "");
  if (!path) return new Response("not found", { status: 404 });

  const object = await env.MEDIA.get(path);
  if (!object) return new Response("not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
};

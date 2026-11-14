"""Ingestão de vídeo em lote, rodada à mão do IP residencial (decisão do
usuário, 14/11/2026). O YouTube devolve 429 no download de legenda
(`timedtext`) para o IP de datacenter do container, então o vídeo saiu do
batch diário na nuvem (`DailyBatchWorkflow`, só leitura) e passou a ser
este script. Semanal basta: já existem ~1.000 clipes.

Não duplica lógica: chama `video.daily_batch.ingest_next_new_video` (escolhe
o próximo vídeo não ingerido da playlist curada, baixa a legenda, grava
clip/segmentos e gera exercícios + compreensão) até `--count` vezes. Cada
chamada consulta o D1, então o loop não guarda estado.

Grava no D1 de PRODUÇÃO via `wrangler d1 execute --remote` (sessão OAuth
local do `wrangler login`), pelo caminho normal de `ingest/write_exercises.py`.
Não usa `D1_HTTP_API_TOKEN`: ele existe só porque o container não tem
wrangler.

Fica fora de `pipeline/src/` de propósito: mudança em
`pipeline/src/deutsch_pipeline/**` dispara o redeploy dos dois containers, e
este script nunca roda num container.

Uso, a partir da raiz do repo:
    PYTHONPATH=pipeline/src .venv/bin/python pipeline/scripts/ingest_videos_local.py --remote --count 10
"""
import argparse
import os
import subprocess
import sys

DEFAULT_MODEL = "hf:deepseek-ai/DeepSeek-V3"


def _error_text(err: Exception) -> str:
    # CalledProcessError do wrangler: o motivo real vem no stderr, não no str().
    if isinstance(err, subprocess.CalledProcessError) and err.stderr:
        return f"{err} -- {err.stderr.strip()[-500:]}"
    return str(err)


def run(count: int, model: str, ingest) -> dict:
    """Chama `ingest(model)` até `count` vezes. Para no `skipped` (acabaram os
    candidatos) e no primeiro 429 (nem o IP residencial resolve hoje); outro
    erro é impresso e o loop segue pro próximo vídeo."""
    ok, errors = [], []
    stopped = None
    for i in range(1, count + 1):
        try:
            result = ingest(model)
        except Exception as err:  # um vídeo ruim não derruba o lote
            msg = _error_text(err)
            errors.append(msg)
            print(f"[{i}/{count}] erro: {msg}", file=sys.stderr)
            if "429" in msg:
                stopped = "429"
                print("  YouTube devolveu 429 também do IP local -- parando o lote.", file=sys.stderr)
                break
            continue
        if result.get("skipped"):
            stopped = "skipped"
            print(f"[{i}/{count}] skip: {result.get('reason')}")
            break
        ok.append(result)
        print(f"[{i}/{count}] video_clip_id={result['video_clip_id']} ('{result.get('titulo')}', "
              f"legenda {result.get('caption_quality')}) exercicios={result.get('exercicios')} "
              f"compreensao={result.get('compreensao')}")
    summary = {"ok": len(ok), "errors": len(errors), "stopped": stopped}
    print(f"resumo: {summary}")
    return summary


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--remote", action="store_true",
                        help="obrigatório: grava no D1 de produção (wrangler --remote)")
    parser.add_argument("--count", type=int, default=10, help="máximo de vídeos neste lote (padrão 10)")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args(argv)

    if not args.remote:
        print("recusado: passe --remote (este script só grava no D1 de produção).", file=sys.stderr)
        return 2
    if os.environ.get("D1_HTTP_API_TOKEN"):
        print("recusado: D1_HTTP_API_TOKEN está definido -- esse é o caminho do container; "
              "aqui a gravação é pelo wrangler --remote.", file=sys.stderr)
        return 2
    # O pipeline grava clipe, segmentos e os exercícios sem LLM ANTES de chamar
    # o LLM: sem a chave, a 1ª rodada real (14/11/2026) deixou 2 vídeos pela
    # metade no D1. Checar antes de gravar qualquer coisa. `chat()` com `hf:`
    # lê exatamente `hugging_face_api_key` (HF_TOKEN não basta, ver .env.example).
    from deutsch_pipeline.generation import llm_client

    llm_client._ensure_env_loaded()
    if args.model.startswith("hf:") and not os.environ.get("hugging_face_api_key"):
        print("recusado: hugging_face_api_key ausente no ambiente/.env -- o modelo hf: precisa dela "
              "(nada foi gravado).", file=sys.stderr)
        return 2
    os.environ["D1_REMOTE"] = "1"
    # list_playlist chama o executável `yt-dlp` por subprocess; com
    # `.venv/bin/python` direto (sem ativar o venv) ele não está no PATH.
    # A pasta do Python em uso vem primeiro, para achar o yt-dlp do mesmo venv.
    os.environ["PATH"] = os.path.dirname(sys.executable) + os.pathsep + os.environ.get("PATH", "")

    from deutsch_pipeline.video.daily_batch import ingest_next_new_video

    summary = run(args.count, args.model, ingest_next_new_video)
    return 1 if summary["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())

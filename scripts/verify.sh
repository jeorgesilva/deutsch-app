#!/usr/bin/env bash
# Gate local: tsc, vitest, ruff (só regras F) e pytest do pipeline.
# Roda todos os passos mesmo se um falhar; exit 1 se qualquer um falhou.
set -uo pipefail
cd "$(dirname "$0")/.."

PY=.venv/bin/python
falhas=()

passo() {
  local nome="$1"; shift
  echo "== $nome"
  if "$@"; then echo "-- $nome: ok"; else echo "-- $nome: FALHOU"; falhas+=("$nome"); fi
}

passo tsc    bash -c 'cd app && npx tsc --noEmit'
passo vitest bash -c 'cd app && npx vitest run --passWithNoTests'
passo ruff   "$PY" -m ruff check --select F --output-format concise pipeline/
passo pytest "$PY" -m pytest pipeline -q

if ((${#falhas[@]})); then
  echo "FALHOU: ${falhas[*]}"; exit 1
fi
echo "verify: tudo ok"

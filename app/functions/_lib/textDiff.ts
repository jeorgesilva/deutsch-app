// Fatia C (redesenho de Vídeo) -- generaliza pro Worker o mesmo padrão de
// diff já usado na correção fonética (pipeline/.../phonetics/recognize.py
// ::phone_diff, blocos equal/replace/delete/insert via difflib.
// SequenceMatcher), pra dar feedback granular em respostas de texto longo
// (DictationEngine/VideoTaskEngine) em vez de só um booleano certo/errado.
// Não existia nenhuma implementação de diff no lado TS antes disso -- o
// diff fonético roda inteiramente em Python/serviço externo.

export interface DiffBlock {
  op: "equal" | "replace" | "delete" | "insert";
  target: string[];
  recognized: string[];
}

function tokenize(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

function normalizeToken(t: string): string {
  return t.toLowerCase();
}

type TokenOp = { op: "equal" | "delete" | "insert"; a?: string; b?: string };

// Alinha duas sequências de token via LCS -- equivalente prático ao
// difflib.SequenceMatcher pra sentenças curtas de exercício (O(n*m)
// irrelevante nesse tamanho de entrada).
function alignTokens(target: string[], recognized: string[]): TokenOp[] {
  const n = target.length;
  const m = recognized.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        normalizeToken(target[i]) === normalizeToken(recognized[j])
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: TokenOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (normalizeToken(target[i]) === normalizeToken(recognized[j])) {
      ops.push({ op: "equal", a: target[i], b: recognized[j] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ op: "delete", a: target[i] });
      i++;
    } else {
      ops.push({ op: "insert", b: recognized[j] });
      j++;
    }
  }
  while (i < n) ops.push({ op: "delete", a: target[i++] });
  while (j < m) ops.push({ op: "insert", b: recognized[j++] });
  return ops;
}

// Agrupa tokens em blocos, fundindo corridas delete+insert adjacentes (sem
// "equal" no meio) num único bloco "replace" -- mesmo formato de
// get_opcodes() do difflib usado no diff fonético (phone_diff).
export function wordDiff(target: string, recognized: string): DiffBlock[] {
  const ops = alignTokens(tokenize(target), tokenize(recognized));
  const blocks: DiffBlock[] = [];
  let idx = 0;
  while (idx < ops.length) {
    if (ops[idx].op === "equal") {
      const run: string[] = [];
      while (idx < ops.length && ops[idx].op === "equal") {
        run.push(ops[idx].a!);
        idx++;
      }
      blocks.push({ op: "equal", target: run, recognized: run });
      continue;
    }
    const deleted: string[] = [];
    const inserted: string[] = [];
    while (idx < ops.length && ops[idx].op !== "equal") {
      if (ops[idx].op === "delete") deleted.push(ops[idx].a!);
      else inserted.push(ops[idx].b!);
      idx++;
    }
    if (deleted.length && inserted.length) {
      blocks.push({ op: "replace", target: deleted, recognized: inserted });
    } else if (deleted.length) {
      blocks.push({ op: "delete", target: deleted, recognized: [] });
    } else {
      blocks.push({ op: "insert", target: [], recognized: inserted });
    }
  }
  return blocks;
}

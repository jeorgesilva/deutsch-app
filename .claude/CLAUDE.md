# .claude/ — agentes e skills de projeto

Ferramenta de desenvolvimento, não parte do produto (não conflita com "não usar framework multiagente no roleplay", que é sobre o app).

## Guardrail permanente (vale para todo agente e skill daqui)

- Nenhum agente decide regra gramatical, regência (Dativo, `Funktionsverbgefüge`) ou qualidade de conteúdo curado. Isso exige revisão humana (`CLAUDE.md` raiz).
- Se a tarefa tocar `data/raw/` ou as regras/exemplos few-shot da geração (`pipeline/src/deutsch_pipeline/generation/prompts_*.py`), **parar e avisar** em vez de aplicar.
- As "Decisões fechadas" do `CLAUDE.md` raiz valem acima das recomendações genéricas dos agentes (D1 e não Postgres, Cloudflare e não AWS/Kubernetes, sem bundler no frontend, etc.). Os agentes abaixo foram escritos para stacks genéricas e tendem a sugerir microsserviços, ORMs e nuvens que não se aplicam aqui.
- `services/phonetic-container/service.py` é mock e editá-lo dispara redeploy; não mexer.

## Origem

Copiados à mão de `github.com/wshobson/agents`, commit `9c61ab243def98f72da12abd41cfcf5bcd91af9d` (08/11/2026), licença MIT (`LICENSE-wshobson-agents`). Cada agente foi lido antes de entrar (14/11/2026); a única alteração foi a seção "Guardrail do deutsch-app" no fim de cada arquivo.

| Plugin de origem | Agentes |
|---|---|
| comprehensive-review | `comprehensive-review-architect-review`, `comprehensive-review-code-reviewer`, `comprehensive-review-security-auditor` |
| python-development | `python-pro` (`django-pro` e `fastapi-pro` ficaram de fora: o pipeline usa Flask) |
| javascript-typescript | `javascript-pro`, `typescript-pro` |
| database-cloud-optimization | `database-cloud-optimization-{backend-architect,cloud-architect,database-architect,database-optimizer}` |
| unit-testing | `unit-testing-debugger`, `unit-testing-test-automator` |
| agent-teams | `team-lead`, `team-implementer`, `team-reviewer`, `team-debugger` (exigem o recurso experimental Agent Teams do Claude Code) |
| security-scanning | skill `sast-configuration` (só a skill, sem o plugin) |
| comprehensive-review | comando `/full-review` (saída em `.full-review/`, no `.gitignore`) |
| python-development | skills `python-testing-patterns`, `python-resilience`, `python-observability`, `python-background-jobs`, `python-performance-optimization` |
| javascript-typescript | skills `javascript-testing-patterns`, `modern-javascript-patterns` |

Leitura (14/11/2026): comandos e `SKILL.md` lidos inteiros; os `references/` (só exemplos de código) passaram por varredura de instrução ao modelo, URL, shell e segredo, sem achado.

Ressalvas ao usar:

- `/full-review` dispara ~8 subagentes (3 em `opus`) em 5 fases, com pausa para aprovação depois da fase 2 — caro; usar em mudança grande, não em todo diff.
- `javascript-testing-patterns` assume Node/Jest/React. O Worker roda em V8 isolate: para teste de Worker, a referência é `@cloudflare/vitest-pool-workers` (skills `cloudflare:*`), não `global.fetch = vi.fn()` em Node.
- `python-testing-patterns`: aqui vale `pipeline/tests/conftest.py` (rede, subprocess e env bloqueados); teste novo mocka a função de alto nível, nunca afrouxa a guarda.
- `python-resilience` sugere `tenacity`/`httpx`, que não são dependência. Os clientes `openai`/`anthropic` já têm retry próprio (`max_retries`): não empilhar retry por cima sem olhar.
- `python-background-jobs` e `python-observability` são centrados em Celery/Redis e structlog/Prometheus. Aqui o job diário é o `scheduled()` do Worker TS e o log do container vai por stdout para Workers Logs; aproveitar idempotência, estado de job e níveis de log, não a stack.

Ficaram de fora depois de lidos: `test-generate` (gera teste raso — `assert result is not None`, `pytest.raises(Exception)` — e em Jest, não Vitest) e `python-resource-management` (context managers e pool de conexão; não trata memória de modelo carregado no container). Demais comandos e skills dos plugins: não lidos, não copiados.

Skills da Cloudflare: plugin oficial `cloudflare@cloudflare` (marketplace `cloudflare/skills`), instalado no escopo de usuário, não neste diretório.

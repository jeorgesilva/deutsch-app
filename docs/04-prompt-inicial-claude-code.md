# Prompt inicial para o Claude Code

Abra este repositório no Claude Code (`cd deutsch-app && claude`) e cole o texto abaixo como primeira mensagem. Ele já vai ler o `CLAUDE.md` automaticamente, mas o prompt reforça o ponto mais importante: trabalhar em fatias pequenas, com parada obrigatória pra revisão.

---

Este repositório tem um `CLAUDE.md` com as decisões de arquitetura já fechadas e a ordem das fases — leia antes de escrever qualquer código. Os documentos completos de raciocínio estão em `docs/01` a `docs/08` (`docs/05` é a planilha de especificação de engines, `docs/06` é o bloco de leitura/notícia usado na Fase 5, `docs/07` é o sourcing de vídeo/transcrição usado na Fase 6, `docs/08` é fonética/fala usado na Fase 8).

Quero começar pela Fase 0: o piloto de decisão do motor de geração de exercícios. Preciso que você faça isso NESSA ORDEM, parando pra eu revisar depois de cada item — não continue pro próximo item sem eu confirmar explicitamente:

**1.** Monte um script em `pipeline/src/deutsch_pipeline/generation/` que gera de 15 a 20 exercícios do template "Completar lacunas com a regência correta" (Grupo A) em cima de 3-4 tópicos reais de `data/raw/Planilha_Gramatica_Alema_B2C1.xlsx` — as categorias "Präpositionen" ou "Verben, Adjektive, Nomen und ihre Ergänzungen" são bons candidatos, por causa da regência de caso. Use a regra e o exemplo que já existem na planilha como few-shot no prompt de geração — o modelo não deve inventar a regra gramatical, só variar vocabulário e contexto em cima da regra e do exemplo certos.

**2.** Decidimos rodar tudo local via Ollama — nada de API externa nesse comparativo. Rode o script contra dois motores, os dois via Ollama: (a) Mistral Small, (b) DeepSeek-R1-Distill multilíngue (`lightblue/DeepSeek-R1-Distill-Qwen-7B-Multilingual` ou o tamanho que couber na minha máquina — não a variante padrão, que não é multilíngue de fábrica). Se eu não tiver Ollama instalado ainda, pare e me dê o comando de instalação antes de continuar. Reporte taxa de erro por TEMPLATE, não só agregada — quero ver se o DeepSeek-R1 compensa em exercícios de transformação estrutural (usa mais raciocínio) mesmo que perca em fluência geral pra Mistral.

**3.** Rode os dois lotes de saída pelo LanguageTool (`language-tool-python`, já está no `pyproject.toml`) e me mostre lado a lado: quantos itens cada motor gerou sem flag, quais foram flagados e por quê.

**4.** Não decida o motor sozinho. Me mostre o comparativo, espere eu escolher, e só depois disso registre a decisão no `CLAUDE.md`.

Formato de output que preciso pra conseguir revisar de verdade: um JSON por exercício (schema descrito em `docs/02-mapeamento-planilhas.md`, seção "Exemplo concreto", e refletido na tabela `exercises` de `app/migrations/0001_init.sql`), salvo em `pipeline/output/piloto/`, legível — não um resumo em texto corrido.

Depois que eu aprovar o motor, seguimos pra Fase 1 (ingestão das planilhas pro D1). Não adianta o trabalho da Fase 1 antes de eu confirmar a Fase 0.

## Sobre o ritmo de aprovação, pra todas as fases seguintes

Sempre que terminar uma sub-tarefa: rode algo que eu possa ver (comando de CLI com output legível, `wrangler dev` pra UI, ou os dois), descreva em 3-5 linhas o que fez e o que decidiu, e espere minha resposta antes de seguir. Se precisar tomar uma decisão de design que não está no `CLAUDE.md`, pare e pergunte em vez de assumir — principalmente qualquer coisa envolvendo o Grupo C (fora de escopo por padrão), a separação entre validação de exposição e feedback de idioma, ou mudança de banco/hosting.

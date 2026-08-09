# 11 — Análise de UX/UI: auditoria do app ao vivo

*Sequência de `docs/09-analise-ux-ui.md`, não substituição. Onde a teoria não mudou, este documento aponta de volta para lá em vez de repetir. Onde a realidade ao vivo mudou algo — confirmou, refutou ou revelou algo que a especificação não podia mostrar — este documento atualiza, com evidência nova.*

## Nota metodológica

**O que mudou desde `docs/09`**: naquele momento não existia UI construída — a auditoria mirava a especificação (schema, docs/01–08, catálogo de 118 engines). Hoje existe um app real, publicado em `https://deutsch-app-45r.pages.dev/`, com login obrigatório (sistema de autenticação novo, ver achado de processo abaixo), 20 templates do "mínimo" do frontend com código funcionando, e uso real já registrado (dados reais do usuário visíveis no Planejador durante esta auditoria — descritos aqui só como padrão de interface, não citados literalmente). Isso muda o que uma auditoria de UX consegue e deve fazer: em vez de inferir onde a experiência sofreria *se* implementada, dá para observar onde ela sofre *de fato*, com passos de reprodução.

**Método**: sessão completa de 10 itens via fila FSRS real (login com a conta do usuário, navegador controlado por automação), cobrindo 8 famílias de engine distintas na prática (`MatchingEngine`, `PredictThenVerifyEngine`, `VideoTaskEngine`/legendar, `LetterAnagramEngine`, `ParagraphOrderEngine`, `DictationEngine` em duas variantes — vídeo autêntico e TTS —, `ComprehensionQAEngine`, `VowelInsertEngine`), mais a tela de conclusão de sessão, o Planejador (Grupo B, 8 cartões), a escada de exposição do Grupo D (Contestação Hostil) com início real de uma conversa de roleplay e teste do botão de saída, e a tela de Trocar Senha. Verificação de acessibilidade via árvore de acessibilidade (`read_page`), navegação por teclado (Tab) num formulário, e inspeção direta do código-fonte servido (`app.js`, `style.css`, `index.html`, a Function de mídia) para confirmar causa raiz em vez de só sintoma — sempre que um achado permitia essa checagem, ela foi feita, porque "o botão parece quebrado" e "o botão está quebrado por X, na linha Y" têm valor de ação muito diferente.

**O que não foi testado nesta rodada** (limite honesto, não descoberta): `OpinionEssayEngine`, `RecordedOpinionEngine` (upload Google Drive), `VideoMiningEngine`, `ReadAloudEngine`/`SpokenGapFillEngine` (exigem microfone real — o ambiente de automação não tem um), `StructuredSpeechEngine` (persona moderador, não hostil), as telas de Login/Registro (a sessão já estava autenticada), o fechamento/avaliação de uma conversa de roleplay até o fim, e o ciclo completo de voz do Grupo D (STT→LLM→TTS) além do primeiro turno. Nenhum destes é declarado "ok" nem "quebrado" aqui — são desconhecidos, não confirmações.

**Achado de processo, à parte da UX em si**: o código já tem um sistema de autenticação completo (`app/functions/api/auth/*`, `0011_users.sql`) e um serviço de fonética containerizado (`services/phonetic-container/`) — ambos funcionando ao vivo — mas nenhum dos dois aparece no `CLAUDE.md` como decisão registrada (o arquivo pula de "Fase 12, segunda fatia" direto para as seções de referência, sem uma "Fase 13"). O próprio código já documenta isso em comentário (`functions/media/[[path]].ts`: *"Fase 13: login obrigatorio em todo o app"*) — ou seja, a fase existe e tem nome, só não chegou ainda ao resumo executivo. Não é um achado de UX; é só um heads-up, porque esta auditoria depende do `CLAUDE.md` como fonte de verdade e encontrou uma divergência pontual entre ele e o que está de fato no ar.

---

## 1. Resumo executivo

A notícia boa vem primeiro porque é verdadeira e não é pequena: **a implementação seguiu `docs/09` com uma fidelidade incomum**. Não é retórica — dá para apontar linha de código. `app.js:1957-1967` tem um comentário que cita literalmente "Fase 12 (docs/09, achado de UX — 'ShowedUpBadge')" antes de implementar exatamente o componente que a Seção 5 daquele documento propôs, com a mesma justificativa (separação espacial real, não só separação de campo). O token de cor `--caution` (`style.css:19-20`, `#92400e`/`#fdf1e0`, âmbar) existe exatamente como o Achado #18 pediu, e não sobrou nenhum `--bad`/vermelho no CSS. A escada de exposição do Grupo D (`ExposureLadder`) está implementada quase ponto a ponto como a Seção 12 descreveu: degraus por intensidade (pontos, não números), nunca travados, com contador de "praticado Nx", paleta calma, e uma frase de abertura que já antecipa a pergunta de ansiedade do usuário ("ordem sugerida... nunca travada"). Isso muda o tom desta auditoria em relação à de `docs/09`: lá, o risco era teórico (o que pode dar errado se X for construído sem cuidado); aqui, boa parte do que mais importava *foi* construído com cuidado, e a auditoria tem menos alavancagem em repetir recomendações já atendidas do que em achar o que passou despercebido mesmo com esse nível de atenção.

E há algo que passou despercebido — um bug funcional real, não estético, que a auditoria anterior não podia prever porque exige um navegador de verdade rodando contra um servidor de verdade: **o áudio dos exercícios de Ditado (`DictationEngine`, variante TTS) não toca**. Confirmado em dois itens independentes da mesma sessão (`11_3_por-que-falantes...wav` e `18_3_fallende-intonation...wav`): o elemento `<audio>` fica preso em `readyState 0` / `networkState 2` (carregando, para sempre) mesmo que o arquivo exista e responda `200` a um `HEAD` simples. A causa raiz é rastreável até uma linha específica: `functions/media/[[path]].ts` lê o objeto do R2 inteiro e devolve `object.body` sem tratar o cabeçalho `Range` que `<audio preload="auto">` manda por padrão — sem suporte a `206 Partial Content`, o pipeline de mídia do navegador trava esperando algo que o servidor nunca envia. Isso é P0 pela definição mais simples possível: um dos 20 templates do "mínimo" não funciona, silenciosamente, sem mensagem de erro nenhuma para o usuário — que só vê um player travado em "0:00 / 0:00" e não tem como saber se é o app, a rede, ou ele mesmo.

O segundo achado de peso é um padrão, não um item isolado: **respostas compostas (pares, sequências) são reveladas como um bloco de texto plano, sem diff por item** — confirmado em `MatchingEngine` e `ParagraphOrderEngine`, rastreável até uma única função compartilhada (`formatAnswerForDisplay`, `app.js:1921-1932`) que trata qualquer `accepted_answers` que não seja o caso especial de `MatchingEngine` como `String(a[0])`. Para uma resposta atômica (uma palavra, um número) isso é perfeitamente adequado — e de fato funciona bem nos itens de `ComprehensionQAEngine`/`VowelInsertEngine` testados. Para uma resposta de 5 pares ou 9 frases reordenadas, o usuário recebe um parágrafo inteiro para comparar manualmente contra o que ele mesmo escreveu, exatamente o tipo de carga cognitiva desnecessária que `docs/09` (Seção 6, tokens de feedback) pediu para evitar — só que o pedido original não previu que o *mecanismo* de feedback, não só a cor, precisaria variar por formato de resposta.

O restante deste documento: reconciliação item a item contra o roteiro de prioridades P0 de `docs/09` (Seção 2), os achados novos completos com evidência e recomendação (Seção 3), confirmações positivas específicas (Seção 4), atualizações pontuais de hierarquia visual e acessibilidade só onde há evidência nova (Seções 5–6), e um roadmap consolidado (Seção 7).

---

## 2. Reconciliação contra o roadmap P0 de `docs/09`

`docs/09` (Seção 14) priorizou 8 itens como P0 ("implementar imediatamente"). Status real, verificado ao vivo onde possível:

| Item P0 de `docs/09` | Status | Evidência |
|---|---|---|
| Design tokens + `ExerciseShell` compartilhado | ✅ Implementado e confirmado | As 8 famílias de engine testadas nesta sessão renderizam dentro da mesma casca de 3 zonas (prompt/resposta/feedback); `style.css` tem tokens centralizados (`--good`, `--caution`, spacing) |
| `CompletionSignal` | ⚠️ Parcial | Existe um link "Continuar →" consistente após cada item, mas é texto sublinhado, não um sinal visual distinto (check mark, cor) separado do próprio bloco de feedback — funciona, mas é mais sutil do que a Seção 5 de `docs/09` descreveu |
| `ShowedUpBadge` separado da correção | ✅ Implementado e confirmado no código | `app.js:459,999,1300` — 3 pontos de uso, com comentário citando `docs/09` diretamente. Não testado visualmente ao vivo nesta rodada (exige `OpinionEssayEngine`/roleplay fechado/`QuickOpinion`, fora do escopo desta sessão), mas a implementação em código é inequívoca |
| `ReviewQueueSoftCount` | ✅ Implementado e confirmado | A sessão nunca expôs um total bruto de pendências — `functions/api/session.ts:13`, `limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 30)`: padrão de 10 itens, capado em 30 mesmo se o cliente pedir mais, nunca "342 pendentes" |
| Casca de gravação com replay ilimitado + gabarito tardio | ⚠️ Não verificado ao vivo | Nenhum item de fala apareceu nesta sessão (FSRS não sorteou); código (`setupRecorder`, `ReadAloudEngine`/`SpokenGapFillEngine`) existe e está descrito em detalhe no `CLAUDE.md`, mas não foi exercitado com microfone real nesta auditoria |
| `ImplementationIntentionCapture` + canal de lembrete | ✅ Parcialmente implementado, decisão de canal já tomada | Planejador com 6 cartões quando/onde/data confirmado ao vivo; canal escolhido foi banner in-app (não Web Push), decisão registrada no `CLAUDE.md` — resolve o Achado #3 de `docs/09` com uma escolha explícita, ainda que diferente da recomendação original (push) |
| Tokens de feedback tri-state globais (verde/âmbar, nunca vermelho) | ✅ Implementado e confirmado | `style.css:12-20`; confirmado visualmente em 6+ itens da sessão — nenhum vermelho em lugar nenhum |
| `ExposureLadder` + `TextVoiceToggle` + `ExitConversationAffordance` | ✅ Implementado e confirmado, com qualidade acima da média | Ver Seção 4 — os três componentes existem e foram testados interativamente com sucesso |

Seis de oito confirmados via evidência direta (código ou comportamento ao vivo), dois parciais/não verificados por limite de escopo desta sessão (não por ausência aparente). Isso é uma taxa de execução real muito acima do que `docs/09` poderia ter previsto — vale dizer isso claramente antes de entrar nos problemas, porque uma auditoria que só lista o que está errado, quando a maior parte está certa, distorce a leitura de prioridade de quem for agir sobre ela.

---

## 3. Achados novos (confirmados ao vivo)

Cada achado: localização exata, evidência de reprodução, impacto, severidade, recomendação.

### 3.1 — Áudio do Ditado (TTS) não carrega no navegador

**Localização**: `app/functions/media/[[path]].ts` (linhas 17-24 — o corpo do handler que lê o objeto do R2 e devolve `object.body` direto); afeta qualquer `DictationEngine` com `source_type='tts'` (o `CLAUDE.md` registra 71+ itens nessa categoria).

**Evidência**: dois itens distintos da mesma sessão real (chaves R2 `dictation/11_3_por-que-falantes-de-portugues-tendem-a-nao-produzir.wav` e `dictation/18_3_fallende-intonation--afirmacoes-e-perguntas-wh.wav`). Em ambos: `audio.readyState` permanece `0` (`HAVE_NOTHING`) e `audio.networkState` permanece `2` (`NETWORK_LOADING`) indefinidamente após `play()`, sem nunca disparar `error` nem `canplaythrough`. Uma requisição `HEAD` direta ao mesmo caminho devolve `200` — o objeto existe e é servido. A função que serve `/media/*` lê o objeto inteiro do R2 (`env.MEDIA.get(path)`) e devolve `object.body` sem inspecionar o cabeçalho `Range` da requisição nem devolver `206 Partial Content`/`Accept-Ranges`/`Content-Range`. O elemento `<audio>` do frontend usa `preload="auto"` (confirmado via inspeção do DOM), que faz o Chrome emitir uma requisição `Range: bytes=0-` para iniciar o buffer — sem uma resposta `206` correspondente, o pipeline de mídia do navegador fica esperando indefinidamente.

**Impacto**: total, para o template afetado — o usuário não ouve nada, não sabe por quê, e não há nenhuma mensagem de erro. O app se comporta como se estivesse tudo bem (o player aparece normal, o campo de resposta está habilitado, "Verificar" funciona e revela o gabarito normalmente) — ou seja, o app aceita silenciosamente que o usuário responda um exercício de compreensão auditiva sem ter ouvido nada, o que é pior do que travar visivelmente, porque não dá nenhum sinal de que algo está errado. Para o perfil deste usuário especificamente, isso é o pior tipo de falha: ambígua o bastante para gerar a dúvida que `docs/03` já identificou como custosa ("travou? Erro meu? Minha conexão?").

**Severidade**: Alta / P0. Não é uma questão de polimento — é um template inteiro não funcional em produção agora.

**Recomendação**: implementar suporte a `Range` na função de mídia (o binding R2 do Workers aceita `env.MEDIA.get(path, { range: {...} })` — a mudança é localizada, não estrutural) devolvendo `206`, `Content-Range` e `Accept-Ranges: bytes` quando o cabeçalho `Range` estiver presente. Verificação depois do fix: não basta confirmar `200` via `fetch`/`HEAD` (isso já passava, e escondia o bug) — confirmar especificamente que um `<audio>` real, no navegador, chega a `readyState >= 2` e tem `duration` numérica. Vale revisitar a alegação do `CLAUDE.md` de que os "73 chaves confirmadas servindo 200" cobriam esse caso — o teste que gerou esse número provavelmente usava `fetch`/CLI, que não expõe esse problema.

### 3.2 — Respostas compostas mostradas como bloco de texto, sem diff por item

**Localização**: `app/public/app.js`, função `formatAnswerForDisplay` (linhas 1921-1932), usada por `showFeedback` (linha 1934+) para todo template fora do caminho especial de `source_sentence`.

**Evidência**: 
- `MatchingEngine` (item 1 da sessão, 5 pares termo→definição): submetido com uma mistura deliberada de pares certos e errados; o feedback devolvido foi a lista inteira de pares corretos concatenada por vírgula (`termo → definição, termo → definição, ...`), sem indicar quais dos 5 pares que o usuário formou estavam certos e quais não.
- `ParagraphOrderEngine` (item 5, 9 frases): submetido em ordem deliberadamente diferente da correta; o feedback foi a frase completa reconstruída como um parágrafo único, sem indicar em que posição(ões) a ordem do usuário divergiu.
- Por contraste, `ComprehensionQAEngine` e `VowelInsertEngine` (itens 8 e 10, respostas atômicas) mostraram feedback limpo de uma linha ("Certo!") — o problema é específico a `accepted_answers` compostos, não ao mecanismo de feedback em geral.

O código confirma a causa: `formatAnswerForDisplay` só tem tratamento especial para `result.source_sentence` (usado por `DictationEngine`/`VideoTaskEngine`, explicando por que aqueles mostraram uma frase limpa) e para arrays de objetos `{termo, definicao}` (`MatchingEngine`, mas só junta tudo com vírgula, sem separar por acerto/erro). Todo o resto cai em `String(a[0])` — um `join` implícito, não um diff.

**Impacto**: médio-alto nos formatos afetados (`Matching`, `Unscramble`, `ParagraphOrder`, `StructuralTransform` provavelmente têm o mesmo padrão, ainda que não testados individualmente nesta sessão — todos usam `accepted_answers` como array de string única ou pares). Força o usuário a fazer manualmente o trabalho de comparação que o app deveria fazer — exatamente o tipo de carga cognitiva extra que a Seção 6/10 de `docs/09` já identificou como algo a evitar, só que aplicado a um lugar que a análise anterior não previu porque exigia ver o dado composto renderizado de verdade.

**Severidade**: Média-alta / P1.

**Recomendação**: estender `formatAnswerForDisplay`/`showFeedback` para dois casos adicionais com diff real: (a) pares (`Matching`) — marcar visualmente cada par formado pelo usuário como certo/errado individualmente, não só mostrar a lista completa de pares corretos; (b) sequência (`Unscramble`/`ParagraphOrder`) — destacar especificamente os itens fora de posição (ex. comparação posição a posição entre a ordem do usuário e a correta), não reconstruir o parágrafo inteiro como prosa neutra. Isso é a mesma ideia de `PhonemeDiffDisplay` que `docs/09` já propôs para fonética (Seção 5) — aplicada ao domínio de texto/sequência, que também precisa de um diff, não só um resultado.

### 3.3 — Texto de instrução reaproveitado entre engines de chip, nem sempre correto

**Localização**: telas de `MatchingEngine`, `LetterAnagramEngine`, `ParagraphOrderEngine`.

**Evidência**: os três usam variações do texto "clique nas palavras/letras abaixo, na ordem certa" como instrução. Para `LetterAnagramEngine` (montar uma palavra a partir de letras soltas) e `ParagraphOrderEngine` (reconstruir a ordem de frases), essa instrução é precisa. Para `MatchingEngine` (formar pares termo↔definição clicando em duas colunas — não há "ordem" nenhuma envolvida, é associação, não sequência), a mesma frase aparece e está descritivamente errada: não existe uma "ordem certa" a seguir em pareamento.

**Impacto**: baixo-médio — não impede o uso (o layout de duas colunas já comunica "isso é pareamento" visualmente, então o usuário provavelmente entende apesar do texto), mas é uma fonte de confusão momentânea desnecessária, e para um usuário com atenção variável é exatamente o tipo de pequena fricção que se acumula.

**Severidade**: Baixa-média / P2.

**Recomendação**: a família "Reordenar" (chips em sequência) e a família "Seleção/reconhecimento" (pares, binário) já são tratadas como categorias visuais diferentes na Seção 10 de `docs/09` — vale que o texto de instrução siga a mesma divisão em vez de ser copiado de um template para o outro. Correção pontual e barata.

### 3.4 — Cópia da tela de Grupo D diz "voz em breve", mas voz já funciona

**Localização**: tela "Contestação Hostil" (escada de exposição), frase de abertura: *"Sempre em texto; voz é upgrade opcional (em breve)."*

**Evidência**: apesar do "(em breve)", o alternador Texto/Falar de cada cartão é clicável e funcional agora — selecionar "Falar" e clicar "Iniciar" no cenário "Jornalista" abriu a conversa normalmente, com a primeira fala do jornalista sintetizada e um botão real de "● Gravar resposta" renderizado (não desabilitado, não um placeholder). Não foi possível testar o turno completo (STT→LLM→TTS) por falta de microfone real neste ambiente de teste, mas a etapa de abertura — que depende da mesma cadeia de síntese de voz — funcionou sem erro.

**Impacto**: baixo em termos de funcionalidade (nada quebra), mas é uma inconsistência entre o que o produto diz de si mesmo e o que ele faz — o tipo de coisa que mina a confiança de um usuário com ansiedade/intolerância à incerteza já documentada, que pode literalmente decidir não tentar voz porque o próprio app disse que "ainda não". Vale notar que isso também sugere (sem confirmar 100%, já que o ciclo completo não foi testado) que o serviço de fonética containerizado (`services/phonetic-container/`) já está acessível a partir do site público — o que, se verdade, tornaria obsoleta a limitação permanente registrada no `CLAUDE.md` ("modo de voz só funciona com o serviço Python local rodando na mesma máquina").

**Severidade**: Baixa / P2 (ajuste de texto) — mas com uma nota P1 anexa: vale re-verificar e, se confirmado que o serviço remoto está de fato no ar, atualizar essa constraint permanente no `CLAUDE.md`, porque ela hoje orienta decisões futuras com uma premissa que pode estar desatualizada.

**Recomendação**: se voz já funciona ponta a ponta, atualizar a cópia para remover "(em breve)". Se não funciona ponta a ponta (só a abertura), a cópia atual está tecnicamente mais correta do que parece à primeira vista, mas o alternador não deveria estar clicável/habilitado antes de estar pronto — um desses dois lados precisa mudar para bater com o outro.

### 3.5 — `lang="de"` no documento inteiro, mas a maior parte da interface é português

**Localização**: `app/public/index.html`, linha 2 (`<html lang="de">`); nenhuma outra ocorrência de `lang=` em todo o `app/public/`.

**Evidência**: busca direta no código-fonte confirma um único atributo `lang`, no elemento raiz, declarando o documento inteiro como alemão. Praticamente todo o *chrome* da interface é português ("Certo!", "Quase — a resposta certa era:", "Trocar senha", "Sessão concluída", todos os rótulos de formulário) — só o conteúdo pedagógico em si (prompts, frases-alvo, texto do roleplay) é de fato alemão.

**Impacto**: baixo-médio, específico a leitores de tela — um leitor de tela usa `lang` para escolher a voz/pronúncia correta; com `lang="de"` global, texto português seria lido com fonética alemã (e vice-versa para os trechos que deveriam soar como alemão dentro de um documento cujo idioma-base fosse português). Não é hipotético: é o comportamento padrão documentado de qualquer leitor de tela moderno diante do atributo `lang`.

**Severidade**: Baixa-média / P2. Não bloqueia ninguém hoje (o usuário não depende de leitor de tela, até onde esta auditoria sabe), mas é uma correção de uma linha com benefício real caso isso mude, e é exatamente o tipo de achado que `docs/09` (Seção 13) sinalizou como ausente por padrão — agora com um exemplo concreto.

**Recomendação**: `lang="pt-BR"` (ou `pt`) no elemento raiz, com `lang="de"` aplicado localmente aos elementos que de fato contêm texto alemão (o prompt do exercício, a frase-alvo, as mensagens do roleplay) — não o inverso.

### 3.6 — Conteúdo dinâmico principal não está em região `aria-live`

**Localização**: `app/public/index.html`; `#progress` (linha 12) tem `aria-live="polite"`, mas `#main` (linha 22, onde o exercício e o feedback são renderizados via `innerHTML`) não tem nenhum atributo `aria-live`.

**Evidência**: inspeção direta do HTML servido. Confirma parcialmente o Achado #19 de `docs/09` (nenhuma menção a leitor de tela nos documentos de especificação) — só que agora com granularidade: a equipe (ou o próprio Claude Code numa sessão anterior) já pensou em `aria-live` o bastante para aplicá-lo ao contador de posição, mas não ao conteúdo que de fato muda a cada interação (o prompt novo, o resultado certo/errado).

**Impacto**: médio para uso não-visual — sem `aria-live` no container principal, um leitor de tela não anuncia automaticamente "próximo exercício carregado" nem "Certo!"/"Quase" quando o DOM é trocado; o usuário precisaria navegar manualmente para descobrir que algo mudou.

**Severidade**: Média / P1-P2 (a mesma prioridade que `docs/09` já deu à linha de base de acessibilidade, agora com o ponto de implementação exato).

**Recomendação**: `aria-live="polite"` no container `#main`, ou — mais preciso — uma região `aria-live` dedicada só para o bloco de feedback (para não forçar reanúncio do exercício inteiro a cada render).

### 3.7 — Rótulo do vídeo embutido é genérico, não descritivo

**Localização**: `app/public/app.js`, linhas 1657 e 1700-1701 — `<iframe ... title="vídeo">`.

**Evidência**: o `<iframe>` do YouTube já tem um atributo `title`, o que é a prática correta básica (dá nome acessível ao iframe) — porém o valor é sempre a palavra genérica "vídeo", igual em todo exercício de vídeo, nunca o nome do vídeo ou o clipe específico. A checagem inicial desta auditoria via árvore de acessibilidade automatizada não conseguiu enxergar o conteúdo do iframe (limite da ferramenta de teste, não necessariamente do app), então este achado foi corrigido para refletir o que o código realmente faz, não o que a primeira leitura sugeriu.

**Impacto**: baixo — existe rótulo, só não é específico. Um usuário de leitor de tela sabe que há "um vídeo" na tela, mas não qual, sem abrir o player.

**Severidade**: Baixa / P3.

**Recomendação**: `title` dinâmico incluindo o nome/fonte do clipe (ex. `Vídeo: Die Baustelle von morgen — DW Video-Thema`), já disponível nos dados que a tela usa para o link "Watch on YouTube".

### 3.8 — Cartões do Planejador (Grupo B) são visualmente idênticos entre si

**Localização**: tela "Planejador", os 6 cartões que capturam quando/onde/data (Shadowing, Mineração de Vídeo, Parágrafo de Opinião, Áudio de Opinião, Sessão com Tutor, Speech/Debate).

**Evidência**: os 6 compartilham exatamente a mesma estrutura visual (rótulo pequeno em versalete, três campos, botão "Salvar") diferenciados só pelo texto do rótulo — sem ícone, cor de acento ou qualquer pista visual não-textual. Por contraste, os 2 cartões sem plano necessário (Contestação Hostil, Speech Rápido) já são visualmente diferentes (sem os campos de formulário, com descrição em itálico) — ou seja, a diferenciação existe onde a estrutura de dado já obriga, mas não onde ela não obriga.

**Impacto**: baixo — a tela é usada raramente (semanal, por design) e o rótulo já basta para diferenciar ao ler. Mas numa tela com rolagem de 8 cartões parecidos, escaneamento rápido (relevante para o perfil de atenção do usuário, `docs/09` Seção 11) depende inteiramente de leitura sequencial de texto pequeno, não de reconhecimento visual.

**Severidade**: Baixa / P3.

**Recomendação**: um ícone ou faixa de cor sutil por tipo de atividade (não precisa ser elaborado — mesmo uma letra/glifo simples já ajudaria o escaneamento), consistente com o princípio de Gestalt (reconhecimento visual antes de leitura) já usado como justificativa em outras partes de `docs/09`.

### 3.9 — Hierarquia tipográfica inconsistente: "Trocar senha" é a única tela com título grande

**Localização**: tela "Trocar senha" (`<h1>Trocar senha</h1>` de fato renderizado como título grande e em negrito) vs. todas as outras telas testadas, que usam apenas um rótulo pequeno em versalete (ex. "VÍDEO", "DITADO", "PERGUNTA SOBRE O TEXTO") como único elemento de cabeçalho, com o prompt do exercício em peso normal de texto.

**Impacto**: baixo — é uma tela de configurações usada raramente, mas é uma quebra de padrão perceptível assim que se navega para fora do fluxo de exercício, e é exatamente o tipo de pequena divergência que `docs/09` (Achado #18, Heurística de Nielsen #4) já apontou como risco estrutural quando decisões de UI são tomadas em momentos/fases diferentes sem um sistema central de referência.

**Severidade**: Baixa / P3.

**Recomendação**: alinhar ao mesmo padrão de rótulo pequeno usado no resto do app, ou — se um estilo de título maior for de fato desejado para telas de configuração/conta — declarar isso como um padrão consciente de "tela de sistema" vs. "tela de exercício", aplicado consistentemente às duas (Login/Registro provavelmente já seguem esse mesmo estilo maior, não verificado nesta sessão).

### 3.10 — Foco de teclado: verificado presente numa tela simples, não verificado nos componentes de chip

**Localização**: tela "Trocar senha" (formulário simples) vs. componentes de chip clicável (`LetterAnagramEngine`, `UnscrambleEngine`, `ParagraphOrderEngine`, `MatchingEngine`).

**Evidência**: `Tab` num formulário simples produziu um anel de foco visível e de contraste razoável (o `outline` padrão do navegador, não estilizado, mas presente) — o requisito básico do WCAG 2.4.7 está satisfeito ali. Os componentes de chip/clique (letras, palavras, colunas de pareamento) não foram testados via teclado nesta sessão — não há evidência nem a favor nem contra se são operáveis sem mouse.

**Impacto**: desconhecido para os componentes de chip — potencialmente alto se eles só responderem a clique de mouse/toque, já que são a interação central de pelo menos 4 famílias de engine inteiras.

**Severidade**: Não determinada / recomenda-se P1 para *verificação* (não necessariamente para retrabalho — pode já estar correto).

**Recomendação**: teste dedicado de navegação por teclado nos componentes de chip antes de considerar a linha de base de acessibilidade (`docs/09`, Seção 13) resolvida.

---

## 4. Confirmações positivas (o que está genuinamente bem feito)

Vale nomear com o mesmo nível de detalhe usado para os problemas — a Etapa 3 do pedido original pede auditoria crítica, não só uma lista de defeitos, e uma auditoria que ignora o que funciona bem distorce a leitura de prioridade tanto quanto uma que ignora problemas.

**A escada de exposição do Grupo D é o melhor componente do app testado nesta sessão.** Cinco cartões (Jornalista, Concorrente, Interrogador técnico, Tribunal, Posição atribuída), cada um com um indicador de intensidade de 1 a 4 pontos (com `aria-label="intensidade N de 4"` — acessível, não só decorativo, achado durante a inspeção de código), contador "Praticado 1×" nos cenários já tentados, alternador Texto/Falar sempre iniciando em Texto, e uma frase de abertura que desarma a ansiedade de escolha antes mesmo de qualquer interação ("ordem sugerida por intensidade, nunca travada"). O botão "← Sair da conversa" funcionou exatamente como esperado durante um roleplay real já em andamento — clique único, sem modal de confirmação, sem linguagem de desistência, retorno imediato e limpo à lista de cenários. Isso é a Seção 12 de `docs/09` implementada com precisão, incluindo o detalhe mais fácil de esquecer (rótulo acessível no indicador de intensidade) que nem a análise original havia especificado em nível de implementação.

**A separação de canais de feedback (`showed_up` vs. correção) está presente em código com atribuição direta a esta análise anterior.** Isso não é apenas "implementado" — o comentário em `app.js:1957-1964` mostra que a razão foi entendida, não só copiada: explica por que separação só no JSON não bastaria, e por que a separação precisa ser espacial.

**A tela de conclusão de sessão é apropriadamente minimalista.** Uma linha de texto, sem tela de estatísticas forçada, sem celebração, sem exigir mais uma decisão do usuário depois do décimo item — exatamente o que a Seção 11 de `docs/09` (Mecanismos de conclusão) pediu, mesmo sem um componente `CompletionSignal` dedicado e nomeado.

**Feedback para respostas atômicas é limpo e calmo.** `ComprehensionQAEngine` e `VowelInsertEngine` mostraram "Certo!" numa linha, sem ruído — o problema identificado na Seção 3.2 é específico a respostas compostas, não ao sistema de feedback como um todo, o que é uma distinção importante: o padrão certo já existe no código, só não foi estendido a todos os formatos de dado.

**Formulários usam `<label>` de verdade, não só `placeholder`.** Checado em autenticação, troca de senha, planejador, mineração de vídeo e respostas de roleplay — associação label↔campo correta é a base de qualquer formulário acessível, e está presente de forma consistente onde checado.

---

## 5. Hierarquia visual — atualização pontual

A Seção 7 de `docs/09` continua válida como framework (padrão F/Z, Lei de Fitts, Lei de Hick, Gestalt aplicados por tela) e não é repetida aqui. Dois ajustes específicos, só onde há evidência nova:

Primeiro, o **par prompt/resposta/feedback realmente se comporta como três zonas visualmente distintas** na prática, como a Seção 5 de `docs/09` propôs para `ExerciseShell` — confirmado nas 8 famílias de engine testadas. A recomendação original se sustenta sem alteração.

Segundo, a **tela "Trocar senha"** (Achado 3.9) é o único ponto onde a hierarquia tipográfica diverge do padrão do resto do app — um título grande onde todo o resto usa rótulo pequeno em versalete. Como é a única tela "de sistema" observada nesta sessão (Login/Registro não testados), não dá para saber se isso é um padrão consciente ("telas de conta são diferentes de telas de exercício") ou uma divergência não-intencional — vale essa checagem antes de decidir se corrigir.

---

## 6. Acessibilidade — atualização com achados de código

A Seção 13 de `docs/09` estabeleceu a linha de base a adotar (nenhum dos oito eixos existia em nenhum documento até então) — continua sendo a referência correta de *o que fazer*. Esta seção só atualiza *o que já existe*, com evidência de código, nos mesmos oito eixos:

- **Contraste**: não medido numericamente nesta sessão (exigiria extrair as cores computadas e calcular a razão) — permanece não verificado.
- **Tamanho de texto**: não testado redimensionamento a 200%.
- **Foco**: presente e visível numa tela simples (Achado 3.10); não verificado em componentes de chip.
- **Navegação por teclado**: mesmo status do item anterior — parcial.
- **Leitores de tela**: `aria-live="polite"` presente no contador de posição, ausente no conteúdo principal e no feedback (Achado 3.6) — parcialmente implementado, não ausente por completo como `docs/09` presumia (correção para melhor, mas incompleto).
- **Feedback multimodal**: os estados verde/âmbar sempre vêm com texto ("Certo!"/"Quase — ..."), nunca só cor — confirmado, satisfaz WCAG 1.4.1 no que foi testado.
- **Tamanho de alvo de toque**: não medido em pixels nesta sessão.
- **Idioma do documento**: novo eixo, não estava na lista original de `docs/09` — `lang="de"` global quando a maior parte da interface é português (Achado 3.5).

Resumo: de "zero cobertura" (a leitura correta quando `docs/09` foi escrita, porque nenhuma UI existia) para "cobertura parcial e desigual" — alguns pontos corretos (labels, algum aria-live, foco básico), outros ausentes (aria-live no conteúdo principal, idioma correto), a maioria não verificável sem ferramenta dedicada de auditoria (contraste, tamanho de alvo). Isso não é uma reversão do Achado #19 de `docs/09` — é a mesma prioridade (P1, linha de base ainda incompleta), com detalhe novo sobre exatamente que parte da linha de base falta.

---

## 7. Roadmap consolidado

Reaproveitando a escala P0–P3 de `docs/09`. Itens novos desta auditoria, mais os P0 originais que ainda não foram confirmados.

| Item | Origem | Prioridade |
|---|---|---|
| Corrigir suporte a `Range`/`206` em `functions/media/[[path]].ts` | Achado 3.1 (novo) | **P0** |
| Diff por item em respostas compostas (`Matching`, `Unscramble`, `ParagraphOrder`) — estender `formatAnswerForDisplay` | Achado 3.2 (novo) | **P0** |
| `aria-live` no container principal / bloco de feedback | Achado 3.6 (novo, refina Achado #19 de `docs/09`) | **P1** |
| Verificar navegação por teclado nos componentes de chip | Achado 3.10 (novo) | **P1** |
| Resolver a inconsistência "voz (em breve)" — atualizar cópia ou desabilitar até estar pronto; revisar a constraint permanente de serviço fonético local-only no `CLAUDE.md` | Achado 3.4 (novo) | **P1** |
| Corrigir `lang` do documento (`pt-BR` na raiz, `de` localizado no conteúdo alemão) | Achado 3.5 (novo) | **P2** |
| Corrigir texto de instrução do `MatchingEngine` | Achado 3.3 (novo) | **P2** |
| `title` descritivo por vídeo no iframe | Achado 3.7 (novo) | **P3** |
| Diferenciação visual leve entre os 6 cartões do Planejador | Achado 3.8 (novo) | **P3** |
| Unificar hierarquia tipográfica de "Trocar senha" com o resto do app (ou declarar padrão consciente de tela-de-sistema) | Achado 3.9 (novo) | **P3** |
| `MasteryTrail`, "Perfil & Motivo", modo-com-apoio/prova, tipografia IPA dedicada, `source_rule` sob demanda, `SkipButton` | `docs/09` P1, ainda ausentes — confirmado sem evidência de implementação nesta sessão | **P1** (herdado, sem mudança) |
| Verificar visualmente `ShowedUpBadge` em uso real (`OpinionEssay`, avaliação de roleplay, `QuickOpinion`) | Implementado em código, não visto ao vivo nesta sessão | **P2** (verificação, não construção) |
| Testar o ciclo completo de voz do Grupo D e dos exercícios de fonética com microfone real | Fora do alcance desta sessão de automação | **P1** (verificação) |

---

## Fontes

Esta auditoria é baseada em observação direta (sessão ao vivo, inspeção de código-fonte servido) e nas mesmas fontes estruturais já citadas em `docs/09` (heurísticas de Nielsen, Lei de Fitts, Lei de Hick, Gestalt, Clark & Wells, Sonuga-Barke) — nenhuma reivindicação nova de literatura externa foi feita aqui que não estivesse já em `docs/09`; onde este documento cita WCAG, é o mesmo WCAG 2.2 já referenciado na Seção 13 daquele documento.

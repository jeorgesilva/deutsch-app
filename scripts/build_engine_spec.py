# -*- coding: utf-8 -*-
"""Gera a planilha de especificacao de engines por exercicio."""
from pathlib import Path

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

FONT = "Arial"

# cor por grupo
GRUPO_FILL = {
    "A": "D9EAD3",  # verde claro
    "B": "CFE2F3",  # azul claro
    "C": "EFEFEF",  # cinza (fora de escopo)
    "D": "F4CCCC",  # vermelho claro
    "E": "FFF2CC",  # amarelo claro
}

NA = ""

rows = []

def add(idx, categoria, nome, grupo, escopo, engine, correcao, funciona, stack, interacao, visual):
    rows.append(dict(
        id=idx, categoria=categoria, nome=nome, grupo=grupo, escopo=escopo,
        engine=engine, correcao=correcao, funciona=funciona, stack=stack,
        interacao=interacao, visual=visual,
    ))

FORA = "Fora de escopo (Grupo C) — herdado de metodologia de sala/grupo, sem ligacao direta com topico B2/C1 especifico. Nao implementar sem pedido explicito."

# ---------- Categoria 1: Nucleo C1+ (motor semanal) — Grupo B ----------
add(1, "Nucleo C1+ (motor semanal)", "Revisao de repeticao espacada (Leitner)", "B", "Sim",
    "SpacedReviewEngine", "Deterministica (auto-avaliacao FSRS)",
    "No inicio da sessao consulta progress.next_review_at <= hoje, monta fila por urgencia, serve um item de cada vez (de qualquer grupo/tipo ja visto), atualiza progress via FSRS apos cada resposta.",
    "ts-fsrs no Worker; D1 (tabela progress).",
    "Fila sequencial, um item por vez, sem escolha manual de 'o que revisar' — o sistema decide pela urgencia.",
    "Tela inicial mostra contador 'X itens para revisar hoje'; sessao e uma sequencia simples item -> feedback -> proximo, visual identico entre tipos de item.")

add(2, "Nucleo C1+ (motor semanal)", "Shadowing", "B", "Sim",
    "ShadowingEngine", "Nenhuma automatica por padrao (foco e prosodia, nao conteudo)",
    "Toca so o audio de um trecho curto (extraido de video_clips quando a fonte for video, ou TTS) — decidido audio-only em vez de exibir o video, mais simples de implementar e consistente entre as duas fontes possiveis, sem distracao visual desnecessaria num exercicio de pronuncia. Usuario grava a si mesmo repetindo simultaneamente ou logo depois, e ouve a propria gravacao pra auto-comparacao. Sem correcao automatica de conteudo nesta variante base (aprovado manter assim) — ver item 117 pra uma segunda opcao lado a lado com correcao automatica (mesma mecanica, adiciona diff fonetico).",
    "Player de audio + MediaRecorder (gravacao) + upload para Google Drive.",
    "Play do trecho-alvo com replay ilimitado; botao grande de gravar com estado visual claro (parado/gravando/gravado); ouve a propria gravacao.",
    "Trecho-alvo em destaque no topo, botao de gravar grande abaixo, player da propria gravacao aparece logo apos para auto-comparacao.")

add(3, "Nucleo C1+ (motor semanal)", "Mineracao de video", "B", "Sim",
    "VideoMiningEngine", "N/A (e a origem de novos itens do lexico, nao um exercicio corrigido)",
    "Usuario cola a URL de um video escolhido por ele (reforca temptation bundling), assiste, anota candidatos a expressao; ao marcar 'vale virar card' a anotacao dispara enriquecimento (lookup Wiktionary) e vira entrada no lexicon/TransitionPhraseEngine.",
    "YouTube iframe embed + D1 (lexicon, video_clips) + Wiktionary lookup no pipeline.",
    "Assistir e anotar em paralelo; marcar nota como candidata a card com um clique.",
    "Layout dividido: video a esquerda, area de notas com timestamp a direita; notas marcadas viram uma lista 'candidatos a card' abaixo, revisavel antes de confirmar.")

add(4, "Nucleo C1+ (motor semanal)", "Paragrafo de opiniao (Diskussionsbeitrag)", "B", "Sim",
    "OpinionEssayEngine", "LLM com rubrica estruturada (JSON)",
    "Apresenta o tema da semana e lembra expressoes minadas recentes; usuario escreve ~230 palavras em tese->argumentos->contra-argumento->conclusao; LLM avalia estrutura, gramatica e uso do vocabulario-alvo.",
    "D1 (attempts.correction_json) + Worker chamando o motor de geracao/correcao (Ollama local).",
    "Editor de texto simples com contador de palavras; checklist da estrutura esperada visivel durante a escrita.",
    "Tema fixo no topo, editor abaixo, contador 'X/230 palavras', indicador discreto de quais das 4 partes da estrutura ja foram identificadas no texto.")

add(5, "Nucleo C1+ (motor semanal)", "Audio de opiniao gravado", "B", "Sim",
    "RecordedOpinionEngine", "Canal separado: exposicao sempre validada + feedback de idioma a parte (opcional)",
    "A partir de um roteiro de topicos (nao do texto pronto — e reformulacao, nao leitura), grava 1-2 minutos.",
    "MediaRecorder + upload Google Drive + Whisper local (opcional, para permitir feedback de idioma sem re-digitar).",
    "Roteiro em bullets na tela (nao o texto completo); botao de gravar; replay pos-gravacao.",
    "Roteiro como lembretes discretos, gravador grande e simples, sem cronometro regressivo agressivo (ansiedade social — ver docs/03).")

add(6, "Nucleo C1+ (motor semanal)", "Sessao de correcao com tutor/parceiro", "B", "Sim",
    "TutorSessionEngine", "N/A — correcao e feita por humano, engine so orquestra",
    "Nao automatizavel: e uma sessao real (chamada de video ou presencial). O modulo so agenda (captura when/where — implementation intention), guarda anexo do material da semana e registra notas pos-sessao.",
    "D1 (session_plans) + anexo simples (link/arquivo).",
    "Agendar (when/where), anexar parágrafo/audio, registrar notas depois.",
    "Tela simples: 'proxima sessao: [data]' + checklist 'material enviado? sim/nao'.")

add(7, "Nucleo C1+ (motor semanal)", "Speech / debate estruturado", "B", "Sim (padrao humano; migra p/ Grupo D se confirmado)",
    "StructuredSpeechEngine", "N/A por padrao (humano); vira llm_roleplay se adaptado",
    "Por padrao precisa de tutor/parceiro real, mesma logica do item 6. Se o usuario confirmar adaptacao para LLM, migra para o mecanismo do HostileRoleplayEngine (Grupo D) com persona 'moderador', nao hostil.",
    "Igual ao item 6 por padrao; ver D1 (HostileRoleplayEngine) se adaptado.",
    "Igual ao item 6 por padrao.",
    "Igual ao item 6 por padrao, com nota 'candidato a virar Grupo D' visivel so para o usuario/dev, nao para a UI final.")

# ---------- Categoria 2: Gramatica (Baralho C1+) — Grupo A ----------
add(8, "Gramatica (Baralho C1+)", "Transformacao estrutural", "A", "Sim",
    "StructuralTransformEngine", "Deterministica, com variantes aceitas",
    "Gera (via Ollama, few-shot com a regra+exemplo curados) uma frase na forma A (ex. voz ativa, discurso direto); usuario reescreve na forma B (Konjunktiv II, discurso indireto, passiva) definida pelo topico gramatical.",
    "D1 (exercises.accepted_answers em JSON, pode ter mais de uma forma valida) + funcao de matching no Worker (tolerante a variacao de ordem secundaria).",
    "Frase original fixa no topo; campo de texto livre abaixo para reescrever.",
    "Layout 'antes/depois': frase-fonte em destaque, campo de resposta com placeholder indicando a transformacao pedida (ex. 'Reescreva em Konjunktiv II:').")

add(9, "Gramatica (Baralho C1+)", "Completar lacunas com a regencia correta", "A", "Sim",
    "GapFillGovernanceEngine", "Deterministica",
    "Usa a regra+exemplo de regencia (Prapositionen, Verben mit Genitiv/Dativ/Akkusativ) como few-shot; gera frase com uma lacuna no lugar da preposicao/caso certo; accepted_answers pode ter mais de uma forma (ex. contracao 'im'='in dem').",
    "D1 (exercises, accepted_answers JSON) + funcao de matching TS (normaliza maiusculas/espaco, checa lista aceita).",
    "Lacuna vira um campo de texto curto inline no meio da frase; Enter ou botao 'Corrigir' submete.",
    "Frase em destaque com a lacuna como caixa de input do tamanho aproximado da palavra faltante; feedback imediato (verde/ambar, nunca vermelho puro) ao lado; contador de progresso da sessao no topo.")

add(10, "Gramatica (Baralho C1+)", "Reformulacao para registro formal (Nominalstil)", "A", "Sim",
    "RegisterReformulationEngine", "Hibrida: checagem deterministica de padrao + nota de fluencia via LLM leve",
    "Frase em estilo verbal comum -> pede reescrita em Nominalstil; checa deterministicamente se a transformacao-chave ocorreu (ex. existe substantivo nominalizado com sufixo -ung/-heit/-keit) e usa LLM leve so para nota de naturalidade.",
    "D1 + checagem por regex/sufixo + chamada LLM local leve (mesmo motor da Fase 0) para a nota de fluencia.",
    "Mesmo layout 'antes/depois' do item 8.",
    "Igual ao item 8, mas o feedback mostra dois indicadores separados: 'transformacao certa? sim/nao' e 'quao natural ficou'.")

# ---------- Categoria 3: Bloco multimidia — misto ----------
add(11, "Herdado My Way - Bloco multimidia", "Video show", "E", "Sim (e o estimulo, nao uma tarefa isolada)",
    "VideoStimulusEngine", "N/A",
    "Apenas exibicao do clipe de trabalho da sessao — alimenta os demais itens desta categoria (Subtitling, Lixicon, Podcast interpret), nao e corrigido por si so.",
    "YouTube iframe embed + D1 (video_clips).",
    "Assistir, com controles limitados ao trecho definido em video_clips.",
    "Player central, sem elementos de tarefa proprios — a tarefa aparece nos modulos vizinhos.")

add(12, "Herdado My Way - Bloco multimidia", "Subtitling", "E", "Sim",
    "VideoTaskEngine (subtipo: legendar)", "Deterministica (compara transcricao) com tolerancia",
    "Enquanto assiste ao clipe, o usuario digita as falas como se estivesse legendando; comparado ao texto-fonte do clipe. Texto-fonte agora tem origem real e definida (aprovado — ver docs/07-sourcing-de-video.md): extraido via yt-dlp (legenda manual da emissora com fallback pra ASR), nunca mostrado ao usuario antes da tentativa, so como gabarito de correcao depois.",
    "YouTube iframe + D1 (video_clips, video_transcript_segments) + campo de texto + diff de string no Worker.",
    "Campo de texto ao lado/abaixo do video, digitacao em tempo real ou pausada.",
    "Video a esquerda, area de 'legenda' a direita tipo editor de legendas simples; diff visual pos-submissao.")

add(13, "Herdado My Way - Bloco multimidia", "Lixicon", "E", "Sim",
    "VideoTaskEngine (subtipo: reconhecimento lexical)", "Auto-relato (sem certo/errado — e reconhecimento)",
    "Apos assistir, usuario lista o vocabulario e as estruturas gramaticais que reconhece no clipe; itens marcados podem alimentar o lexicon.",
    "YouTube iframe + D1 (video_clips, lexicon) + lista editavel.",
    "Lista de chips adicionaveis (uma palavra/estrutura por vez).",
    "Video em cima, lista de chips crescente embaixo, cada chip com opcao 'virar card'.")

add(14, "Herdado My Way - Bloco multimidia", "Discussion", "C", "Nao",
    "-", "-", FORA + " Bom candidato a llm_roleplay (debate sobre o tema do video) se confirmado depois.", "-", "-", "-")

add(15, "Herdado My Way - Bloco multimidia", "Podcast interpret", "E", "Sim",
    "VideoTaskEngine (subtipo: interpretar, variante so-audio)", "LLM com rubrica",
    "Variante em audio do bloco multimidia: ouve um trecho de podcast e produz uma interpretacao/resumo, sem apoio visual.",
    "Player de audio + D1 (video_clips com fonte=podcast) + LLM rubrica.",
    "Player de audio simples + campo de resposta (texto ou gravacao).",
    "Player minimalista no topo, campo de resposta abaixo, sem elementos visuais do video (proposital — treina compreensao so-audio).")

# ---------- Categoria 4: Bloco de texto e sala — misto ----------
add(16, "Herdado My Way - Bloco de texto e sala", "News / analysis / understanding / grammar / practice", "B", "Sim",
    "DECOMPOSTO em 10 engines novas (ver linhas 104-113, docs/06-bloco-texto-noticias.md)", "Ver linhas 104-113",
    "Item original generico demais (misturava analise/compreensao/gramatica num so bloco). Analise do PDF de referencia breakingnewsenglish.com (aprovada) decompos isso em 10 engines especificas ligadas a um reading_block com texto-base gerado original: MatchingEngine, TrueFalseEngine, ComprehensionQAEngine, PredictThenVerifyEngine, LetterAnagramEngine, ParagraphOrderEngine, BinaryChoiceEngine, VowelInsertEngine, PunctuationCapsEngine, CompoundSegmentationEngine.",
    "Ver linhas 104-113.",
    "Ver linhas 104-113.",
    "Ver linhas 104-113.")

add(17, "Herdado My Way - Bloco de texto e sala", "Fill in the blanks", "A", "Sim",
    "FillBlankEngine", "Deterministica",
    "Variante generica do gap-fill: lacuna pode ser vocabulario, conector ou tempo verbal conforme o topico (nao so regencia como o item 9) — implementacao pode reusar a mesma engine de GapFillGovernanceEngine, diferindo so na fonte da regra.",
    "Igual ao item 9.",
    "Igual ao item 9.",
    "Igual ao item 9.")

add(18, "Herdado My Way - Bloco de texto e sala", "Complete / Opinion (em sala)", "C", "Nao",
    "-", "-", FORA + " Explicitamente marcado 'em sala' na planilha original.", "-", "-", "-")

add(19, "Herdado My Way - Bloco de texto e sala", "Unscramble", "A", "Sim",
    "UnscrambleEngine", "Deterministica (compara sequencia exata ou lista de sequencias validas)",
    "Pega uma frase-exemplo correta (respeitando a regra de ordem do topico, ex. V2, TeKaMoLo), embaralha os blocos/tokens, apresenta para reordenar.",
    "D1 (accepted_answers como array de sequencias validas) + comparacao de array no Worker.",
    "Tokens como chips clicaveis em ordem (mais amigavel em touch/mobile que arrastar) — area de 'banco' embaixo, area de montagem em cima.",
    "Tokens embaralhados no banco; token usado some do banco e aparece na area de montagem; ordem final destacada ao corrigir.")

add(20, "Herdado My Way - Bloco de texto e sala", "Guess (lacunas com banco de palavras)", "A", "Sim",
    "WordBankGuessEngine", "Deterministica (selecao, nao digitacao)",
    "Como os gap-fills, mas oferece um banco fechado de opcoes (a certa + distratores gerados via OpenThesaurus/campo semantico) em vez de campo livre.",
    "D1 (accepted_answers + lista de distratores) + comparacao de selecao.",
    "Lacuna + banco de palavras clicaveis abaixo; selecao preenche a lacuna, clicavel de novo para trocar.",
    "Chips de palavra clicaveis abaixo da frase; chip selecionado preenche a lacuna visualmente.")

add(21, "Herdado My Way - Bloco de texto e sala", "Completing (criar paragrafo)", "B", "Sim",
    "OpenPromptEngine (variante)", "LLM com rubrica leve",
    "A partir de uma abertura/gancho dado, o usuario completa criando um paragrafo — mesma engine do item 16, variando so o tipo de prompt inicial.",
    "Igual ao item 16.",
    "Igual ao item 16.",
    "Igual ao item 16.")

# ---------- Categoria 5: Tarefas semanais/casa — misto ----------
add(22, "Herdado My Way - Tarefas semanais/casa", "Make a similar", "B", "Sim",
    "GuidedImitationEngine", "LLM com rubrica (fluencia + similaridade estrutural ao modelo)",
    "Mostra um texto-modelo, pede para escrever um parecido (mesma estrutura, conteudo livre); nao exige identidade de conteudo, so de forma.",
    "D1 (attempts.correction_json) + LLM local.",
    "Texto-modelo fixo no topo, editor abaixo.",
    "Layout modelo+resposta lado a lado ou empilhado, com destaque visual leve nos marcadores estruturais do modelo (ex. conectores).")

add(23, "Herdado My Way - Tarefas semanais/casa", "Notebook", "B", "Sim",
    "PersonalReferenceEngine", "N/A (sem correcao — e registro livre)",
    "Caderno digital simples, sem corrigir nada — so um espaco de registro persistente por topico/data.",
    "D1 (tabela simples de notas livres, sem FK obrigatoria a exercicio).",
    "Campo de texto livre, organizavel por topico/data.",
    "Editor tipo bloco de notas minimalista, lista lateral de entradas anteriores.")

add(24, "Herdado My Way - Tarefas semanais/casa", "How do you say it?", "B", "Sim",
    "PersonalReferenceEngine (variante lookup)", "N/A",
    "Ferramenta de consulta rapida — usuario registra 'como se diz X' para revisar depois; pode disparar lookup Wiktionary automatico.",
    "D1 (notas) + Wiktionary lookup.",
    "Campo de busca/registro rapido, uma linha por vez.",
    "Lista simples tipo 'pergunta -> resposta encontrada', cronologica.")

add(25, "Herdado My Way - Tarefas semanais/casa", "Audio journal", "B", "Sim",
    "RecordedOpinionEngine (variante livre, sem tema fixo)", "Canal separado (exposicao validada + feedback a parte)",
    "Mesmo mecanismo do item 5 (audio de opiniao), mas sem tema da semana — reflexao livre do usuario.",
    "Igual ao item 5.",
    "Igual ao item 5, sem o bloco de roteiro fixo.",
    "Igual ao item 5, mais minimalista (sem topicos guia).")

add(26, "Herdado My Way - Tarefas semanais/casa", "Think in English/target language", "-", "Sem engine propria",
    "N/A", "N/A",
    "Nao gera output registravel — e uma pratica mental sem registro. Melhor tratado como lembrete/notificacao (implementation intention) e nao como tela de exercicio.",
    "D1 (session_plans, so para o lembrete).",
    "Nenhuma — e uma notificacao/push, nao uma tela.",
    "Sem UI propria; no maximo uma notificacao de sistema.")

add(27, "Herdado My Way - Tarefas semanais/casa", "List", "B", "Sim",
    "PersonalReferenceEngine (variante lista)", "N/A",
    "Registro de listas livres (ex. '10 palavras sobre X') — mesma engine de Notebook, variando o formato de exibicao (lista, nao texto corrido).",
    "Igual ao item 23.",
    "Campo de lista (um item por linha).",
    "Lista numerada/com marcadores, editavel inline.")

add(28, "Herdado My Way - Tarefas semanais/casa", "Dictation", "A", "Sim",
    "DictationEngine", "Deterministica, com diff palavra-a-palavra e tolerancia configuravel",
    "Toca um audio TTS gerado a partir de uma frase que ilustra um phonetic_point (ex. Auslautverhartung); usuario digita o que ouviu; compara com o texto-fonte. Erros foneticos tipicos (ex. escrever 'Tak' em vez de 'Tag') sao logados como dado diagnostico, nao so marcados errados. Variante aprovada (docs/07-sourcing-de-video.md): mesmo mecanismo, mas com audio autentico de video_clips + video_transcript_segments em vez de TTS — 'source_type' diferencia as duas.",
    "D1 (phonetic_points, exercises.audio_ref no R2, video_transcript_segments p/ variante autentica) + Web Audio API (player) + diff de string.",
    "Botao de play/replay ilimitado (reduz ansiedade de 'so uma chance'); campo de texto abaixo.",
    "Player minimalista (so play/replay, sem scrubber que distrai); diff visual pos-submissao, palavra por palavra (certo/quase/errado).")

add(29, "Herdado My Way - Tarefas semanais/casa", "Legendar trecho de podcast", "E", "Sim",
    "VideoTaskEngine (subtipo: legendar, variante so-audio)", "Deterministica (compara transcricao) com tolerancia",
    "Mesma logica do item 12 (Subtitling), mas para um trecho de podcast (so audio, sem video). Mesma origem de transcricao real via yt-dlp (docs/07) quando o podcast tambem existir como video/tiver legenda publicada.",
    "Player de audio + D1 (video_clips fonte=podcast, video_transcript_segments) + diff de string.",
    "Igual ao item 12, sem o componente de video.",
    "Igual ao item 12, area de video substituida por player de audio.")

# ---------- Categoria 6: Atividades em aula — todas C ----------
_cat6 = [
    (30, "Guess the word / Describe the word", "bom candidato a llm_roleplay se confirmado"),
    (31, "Talking about yourself", "bom candidato a llm_roleplay se confirmado"),
    (32, "Situation", "bom candidato a llm_roleplay/simulacao se confirmado"),
    (33, "New words (uso imediato)", ""),
    (34, "Did you understand?", "precisa de outra pessoa checando compreensao"),
    (35, "What is the gist?", ""),
    (36, "Role play", "otimo candidato a llm_roleplay se confirmado"),
    (37, "Ask a question", "bom candidato a llm_roleplay se confirmado"),
    (38, "Listen and repeat", "redundante com ShadowingEngine (item 2) se quiser reaproveitar"),
    (39, "Speech (versao original My Way)", "redundante com StructuredSpeechEngine (item 7)"),
    (40, "Responder oralmente a um dialogo", ""),
]
for idx, nome, extra in _cat6:
    nota = FORA + (f" {extra}." if extra else "")
    add(idx, "Herdado My Way - Atividades em aula", nome, "C", "Nao", "-", "-", nota, "-", "-", "-")

# ---------- Categoria 7: Tecnica com cenas de filme — todas E ----------
add(41, "Herdado My Way - Tecnica com cenas de filmes", "Dublagem", "E", "Sim",
    "VideoTaskEngine (subtipo: dublar)", "LLM com rubrica (fluencia/naturalidade, nao ha 'gabarito' unico)",
    "Assiste a cena com o audio original mutado (ou nao) e grava a propria dublagem por cima do dialogo.",
    "YouTube iframe/video local + MediaRecorder + LLM rubrica sobre a transcricao (Whisper) da gravacao.",
    "Video com controles de replay + botao de gravar sincronizado ao trecho.",
    "Video em cima, controles de gravacao embaixo, replay lado a lado (original vs. dublagem do usuario) apos gravar.")

add(42, "Herdado My Way - Tecnica com cenas de filmes", "Legendagem", "E", "Sim",
    "VideoTaskEngine (subtipo: legendar)", "Deterministica (compara transcricao) com tolerancia",
    "Mesma logica do item 12, aplicada a uma cena de filme em vez de video curado. Cena de filme normalmente NAO tem legenda oficial extraivel via yt-dlp (nao e canal com legenda publicada) — nesse caso o texto-fonte precisa ser transcrito manualmente uma vez na curadoria, nao automatizado como o item 12/DW.",
    "Igual ao item 12.",
    "Igual ao item 12.",
    "Igual ao item 12.")

add(43, "Herdado My Way - Tecnica com cenas de filmes", "Interpretando", "E", "Sim",
    "VideoTaskEngine (subtipo: interpretar)", "LLM com rubrica",
    "Assiste a cena e produz um resumo/paraphrase do que aconteceu e foi dito.",
    "YouTube iframe + D1 (video_clips) + LLM rubrica.",
    "Campo de resposta (texto ou gravacao) apos assistir.",
    "Video em cima, campo de resposta rotulado 'O que aconteceu nessa cena?' embaixo.")

add(44, "Herdado My Way - Tecnica com cenas de filmes", "Citando", "E", "Sim",
    "VideoTaskEngine (subtipo: citar)", "Deterministica (compara transcricao de um trecho especifico)",
    "Transcreve literalmente uma citacao/trecho especifico da cena, marcado em video_clips. Mesma ressalva do item 42: cena de filme raramente tem legenda extraivel via yt-dlp, citacao normalmente vem de transcricao manual pontual na curadoria (docs/07-sourcing-de-video.md), nao do pipeline automatico usado pra DW/ZDF.",
    "YouTube iframe + D1 (video_clips com start/end apontando pro trecho da citacao, video_transcript_segments) + diff de string.",
    "Campo de texto curto, foco no trecho exato definido.",
    "Video com marcador visual do trecho-alvo (ex. highlight na barra de progresso), campo de resposta abaixo.")

# ---------- Categoria 8: Jogos de grupo (Warm Up Santa Maria) — todas C ----------
_cat8 = [45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]
_cat8_nomes = ["Memorize","Create a story","Image guess","Liar","Sentences","Battle ship","Spin around",
               "I can see with my eyes","Describe the picture","Chinese whispers","Habits","Verbs",
               "Throw the dice","Bingo","What time is it?"]
for idx, nome in zip(_cat8, _cat8_nomes):
    add(idx, "Herdado My Way - Jogos de grupo (Warm Up Santa Maria)", nome, "C", "Nao", "-", "-",
        FORA + " Exige multiplos jogadores e/ou props fisicos (dado, tabuleiro, cartelas).", "-", "-", "-")

# ---------- Categoria 9: Warmup ideas (eslgames.com) — todas C ----------
_cat9_nomes = ["Quick questions","Make the most words","Make the longest words","What does your name mean?",
    "Mixed-up sentence","Hangman","Word ladders","Mixed-up sentence (anagrama)","The A to Z game",
    "What's the missing word?","What do you know about bananas?","How many sounds can you hear?",
    "Things to do with a potato","Odd one out","Name ten","Two truths and a lie","Mastermind",
    "I'm going on a picnic...","Word Association","Tell a story","Three things in common",
    "Just a Minute / Tic Tac Toe","One-upmanship","Spontaneous Scatter Sheet","Spin the marker",
    "Fortunately/Unfortunately","Organise yourselves!","Letter string dictation","Whose weekend?",
    "Provocative statements","Draw the kitchen","The Categories Game","Compound word quiz"]
for i, nome in enumerate(_cat9_nomes):
    idx = 60 + i
    add(idx, "Terceiros - Warmup ideas (eslgames.com)", nome, "C", "Nao", "-", "-",
        FORA + " Warmup generico de sala de aula ESL, majoritariamente em grupo/dupla, sem ligacao a um topico B2/C1 especifico.", "-", "-", "-")

# ---------- Categoria 10: Extensao minada — misto ----------
add(93, "Extensao minada - 1.000 Ideas & Activities (adaptado)", "Frases de transicao para opiniao", "A", "Sim",
    "TransitionPhraseEngine", "Deterministica com multiplas variantes aceitas",
    "Flashcard: apresenta um contexto/gatilho (ex. 'voce discorda educadamente'), usuario produz a frase-alvo (recall ativo); liga direto na tabela progress/FSRS.",
    "D1 (exercises + progress) + ts-fsrs.",
    "Card vira: mostra o gatilho, usuario fala/digita a frase, clica para 'virar' e ver a resposta certa, se auto-avalia (Errei/Dificil/Bom/Facil).",
    "Cartao central, gatilho em cima, botao 'virar card' no meio, botoes de auto-avaliacao FSRS embaixo apos virar — visual proximo ao Anki.")

add(94, "Extensao minada - 1.000 Ideas & Activities (adaptado)", "Frases de reacao natural", "A", "Sim",
    "ReactionPhraseEngine (reusa TransitionPhraseEngine)", "Deterministica com multiplas variantes aceitas",
    "Mesma mecanica do item 93, banco de frases diferente (reacao natural em vez de transicao de opiniao).",
    "Igual ao item 93.",
    "Igual ao item 93.",
    "Igual ao item 93.")

add(95, "Extensao minada - 1.000 Ideas & Activities (adaptado)", "Contestacao hostil - Coletiva de imprensa", "D", "Sim",
    "HostileRoleplayEngine (cenario: coletiva de imprensa)", "LLM roleplay multi-turno + avaliacao de fechamento em JSON",
    "Sessao de chat multi-turno; system prompt fixa a persona (jornalista cetico) e o cenario; mantem pressao ao longo da conversa; avaliacao so no fim, para nao quebrar a imersao.",
    "Worker mantendo sessao de chat (D1 ou memoria de sessao) + LLM local via Ollama + toggle texto/voz. Modo voz (aprovado, docs/08-fonetica-e-fala.md): loop simples turn-based -- grava, faster-whisper local transcreve, Ollama gera a resposta da persona, Piper sintetiza, toca, sua vez de novo. Nao usa CrewAI (framework pra multiplos agentes delegando tarefa, nao se aplica a uma persona unica) nem Pipecat por enquanto (framework de voice agent real-time/full-duplex, mais do que este exercicio de exposicao precisa).",
    "Interface de chat (texto) OU botao de 'falar' com indicador de gravacao (voz) — escolha explicita no inicio, nunca forcada.",
    "UI de chat, avatar/nome da persona visivel; modo voz mostra indicador de fala em vez de bolhas de texto.")

add(96, "Extensao minada - 1.000 Ideas & Activities (adaptado)", "Contestacao hostil - Tribunal", "D", "Sim",
    "HostileRoleplayEngine (cenario: tribunal)", "LLM roleplay multi-turno + avaliacao de fechamento em JSON",
    "Mesma engine do item 95, persona 'juiza/promotor', cenario de tribunal.",
    "Igual ao item 95.",
    "Igual ao item 95.",
    "Igual ao item 95, com indicador visual do 'nivel' do cenario (1 a 4 dos quatro cenarios de contestacao hostil).")

add(97, "Extensao minada - 1.000 Ideas & Activities (adaptado)", "Contestacao hostil - Concorrente hostil", "D", "Sim",
    "HostileRoleplayEngine (cenario: concorrente)", "LLM roleplay multi-turno + avaliacao de fechamento em JSON",
    "Mesma engine, persona 'concorrente de negocios hostil'.",
    "Igual ao item 95.",
    "Igual ao item 95.",
    "Igual ao item 95.")

add(98, "Extensao minada - 1.000 Ideas & Activities (adaptado)", "Contestacao hostil - Interrogatorio tecnico", "D", "Sim",
    "HostileRoleplayEngine (cenario: interrogatorio tecnico)", "LLM roleplay multi-turno + avaliacao de fechamento em JSON",
    "Mesma engine, persona 'interrogador tecnico', foco em vocabulario/registro tecnico-formal.",
    "Igual ao item 95.",
    "Igual ao item 95.",
    "Igual ao item 95.")

add(99, "Extensao minada - 1.000 Ideas & Activities (adaptado)", "Speech de posicao atribuida", "D", "Sim",
    "AssignedPositionSpeechEngine (variante do HostileRoleplayEngine)", "LLM roleplay (persona 'moderador curioso', nao hostil) + avaliacao final",
    "Sistema atribui uma posicao (nao escolhida pelo usuario, treina argumentar por um lado nao necessariamente pessoal); usuario prepara e apresenta (texto ou voz); LLM faz perguntas de sustentacao depois.",
    "Igual ao item 95, persona diferente.",
    "Igual ao item 95.",
    "Igual ao item 95, com a posicao atribuida exibida claramente antes de comecar.")

add(100, "Extensao minada - 1.000 Ideas & Activities (adaptado)", "Aquecimento: 5 opinioes controversas", "B", "Sim",
    "OpenPromptEngine (variante curta)", "LLM com rubrica leve",
    "Prompt rapido, 5 respostas curtas de opiniao — mesma engine dos itens 16/21, variante de formato mais curto/rapido.",
    "Igual ao item 16.",
    "Igual ao item 16, sessao mais curta (5 prompts em sequencia).",
    "Igual ao item 16.")

add(101, "Extensao minada - 1.000 Ideas & Activities (adaptado)", "Consequencias em cadeia", "B", "Sim",
    "OpenPromptEngine (variante encadeada)", "LLM com rubrica leve",
    "Cada resposta do usuario vira o gatilho da proxima pergunta ('e se...?') — mesma engine, com encadeamento de prompts.",
    "Igual ao item 16.",
    "Igual ao item 16, com exibicao da cadeia de respostas anteriores.",
    "Igual ao item 16, layout tipo thread/conversa.")

add(102, "Extensao minada - 1.000 Ideas & Activities (adaptado)", "Citacao real da semana", "B", "Sim",
    "OpenPromptEngine (variante, ligada a mineracao de video/noticias)", "LLM com rubrica leve",
    "A partir de uma citacao real (pode vir da mineracao de video ou de noticia), usuario comenta/reage — mesma engine dos demais prompts abertos.",
    "Igual ao item 16.",
    "Igual ao item 16, com a citacao-fonte fixa no topo.",
    "Igual ao item 16.")

add(103, "Extensao minada - 1.000 Ideas & Activities (adaptado)", 'Speech rapido "Einerseits... andererseits..."', "D", "Sim",
    "QuickOpinionSpeechEngine (variante leve do HostileRoleplayEngine)", "LLM com rubrica leve (resposta curta, nao multi-turno)",
    "Prompt rapido de fala espontanea, resposta curta e imediata — nao e sessao longa como as contestacoes hostis, mais parecido com um 'flash prompt'.",
    "D1 (attempts) + gravacao ou texto + LLM rubrica leve.",
    "Um unico prompt + gravacao/texto, sem troca de turnos.",
    "Prompt em destaque, botao de gravar ou campo de texto, resposta unica.")

# ---------- Categoria 11: Bloco de leitura/noticia — aprovado, ver docs/06 ----------
# Decomposicao do item 16 original, a partir da analise do pacote de exercicios
# de breakingnewsenglish.com (Sean Banville). Todo texto-base do bloco e SEMPRE
# gerado original pelo motor de geracao (Ollama), citando DW/ZDF/Nachrichtenleicht
# so como inspiracao factual - nunca copiado/raspado literal. Ver reading_blocks/
# reading_block_items em app/migrations/0001_init.sql.
BLOCO = "Faz parte de um reading_block (docs/06): sequencia de exercicios ligados a um texto-base gerado original, ordem obrigatoria via reading_block_items. Credito e sempre por item (imediato), pontuacao de bloco e bonus, nunca unica fonte de credito (ver docs/03)."

add(104, "Bloco de leitura/noticia (novo, aprovado)", "Vocabulary/Synonym/Phrase Matching", "A", "Sim",
    "MatchingEngine", "Deterministica (par correto)",
    "Antes ou depois da leitura: usuario liga cada palavra/expressao do texto ao seu significado, sinonimo ou colocacao correta, escolhendo entre um conjunto de pares embaralhados. " + BLOCO,
    "D1 (exercises.accepted_answers como mapa de pares) + comparacao de selecao no Worker.",
    "Duas colunas clicaveis (termo / definicao); clicar um item de cada coluna forma um par, par correto fica marcado.",
    "Duas colunas lado a lado, linhas conectando pares ja formados; pares certos ficam verdes, errados voltam a ficar disponiveis.")

add(105, "Bloco de leitura/noticia (novo, aprovado)", "True/False (previsao)", "A", "Sim",
    "TrueFalseEngine", "Deterministica (julgamento binario)",
    "Antes de ler o texto completo, usuario julga se afirmacoes sobre o tema sao verdadeiras ou falsas, so pelo titulo/resumo; depois confirma lendo o texto — treina previsao ativa, nao so leitura passiva. " + BLOCO,
    "D1 (exercises.accepted_answers = true/false) + Worker.",
    "Duas opcoes grandes (Verdadeiro/Falso) por afirmacao, uma de cada vez.",
    "Afirmacao em destaque no topo, dois botoes grandes abaixo; apos responder, mostra se acertou e destaca o trecho do texto que confirma.")

add(106, "Bloco de leitura/noticia (novo, aprovado)", "Comprehension Questions", "A", "Sim",
    "ComprehensionQAEngine", "Deterministica (resposta curta) ou hibrida com LLM leve p/ variacao de fraseado",
    "Perguntas abertas curtas sobre fatos especificos do texto-base (quem/o que/quando/onde) — diferente do OpenPromptEngine, que e opiniao/producao livre; aqui ha uma resposta certa ancorada no texto. " + BLOCO,
    "D1 (accepted_answers com variantes aceitas) + matching tolerante a fraseado no Worker.",
    "Pergunta + campo de resposta curta (nao um paragrafo).",
    "Perguntas em sequencia, uma por vez, com o texto-base disponivel para consulta (colapsavel) durante a resposta.")

add(107, "Bloco de leitura/noticia (novo, aprovado)", "Predict-then-verify (Listening/Reading guess)", "A", "Sim",
    "PredictThenVerifyEngine", "Deterministica (multipla escolha) em duas fases",
    "Fase 1: usuario escolhe entre opcoes (ex. 'como a noticia termina?') antes de ler/ouvir o trecho final; Fase 2: le/ouve e confirma. Mecanismo de previsao-depois-verificacao que nao existia no catalogo. " + BLOCO,
    "D1 (accepted_answers, duas fases marcadas) + Worker.",
    "Multipla escolha na fase 1; leitura/audio + confirmacao na fase 2.",
    "Fase 1 mostra so as opcoes; apos escolher, revela o trecho real e marca acerto/erro da previsao — celebra tentar prever, nao so acertar.")

add(108, "Bloco de leitura/noticia (novo, aprovado)", "Spelling (anagrama de letras)", "A", "Sim",
    "LetterAnagramEngine", "Deterministica (compara palavra exata)",
    "Letras de uma palavra-chave do texto embaralhadas; usuario reordena as LETRAS pra formar a palavra certa — diferente do UnscrambleEngine, que reordena PALAVRAS numa frase, nao letras numa palavra. " + BLOCO,
    "D1 (accepted_answers = palavra-alvo) + comparacao de string no Worker.",
    "Letras como chips clicaveis em ordem, igual ao padrao do UnscrambleEngine mas em nivel de letra.",
    "Letras embaralhadas no banco embaixo, area de montagem em cima; contexto da frase original visivel para dar pista semantica.")

add(109, "Bloco de leitura/noticia (novo, aprovado)", "Put The Text Back Together (ordem de paragrafo/frase)", "A", "Sim",
    "ParagraphOrderEngine (variante de granularidade do UnscrambleEngine)", "Deterministica (compara sequencia exata ou lista de sequencias validas)",
    "Mesmo mecanismo do UnscrambleEngine (item 19), parametrizado por granularidade 'frase/paragrafo' em vez de 'palavra' — reordena os blocos do texto-base do reading_block. " + BLOCO,
    "Igual ao item 19, unidade de embaralhamento = frase/paragrafo em vez de token.",
    "Igual ao item 19 (chips clicaveis em ordem), chip = frase/paragrafo inteiro.",
    "Igual ao item 19, blocos maiores de texto em vez de palavras soltas.")

add(110, "Bloco de leitura/noticia (novo, aprovado)", "Circle The Correct Word (par binario no texto corrido)", "A", "Sim",
    "BinaryChoiceEngine", "Deterministica (selecao entre 2 opcoes)",
    "Dentro do texto corrido, pontos marcados oferecem escolha forcada entre 2 palavras (ex. 'der/die Bericht'); mais leve que o WordBankGuessEngine (banco aberto) — aqui e sempre par fechado de 2. " + BLOCO,
    "D1 (accepted_answers = opcao certa por ponto) + Worker.",
    "Par de palavras clicavel inline no texto corrido, sem sair do fluxo de leitura.",
    "Texto corrido com os pares destacados visualmente (ex. sublinhado pontilhado); clicar a opcao errada marca em vermelho suave, certa em verde.")

add(111, "Bloco de leitura/noticia (novo, aprovado)", "Insert The Vowels (pares minimos foneticos)", "A", "Sim",
    "VowelInsertEngine", "Deterministica (compara palavra exata)",
    "Usa phonetic_points (prioridade Alta: duracao vocalica curta/longa tipo Staat/Stadt, Umlaute o/u) pra gerar pares minimos propositais — mesma palavra-esqueleto com vogais faltando, resposta certa muda conforme o contexto da frase. " + BLOCO,
    "D1 (phonetic_points + accepted_answers) + Worker.",
    "Palavra com vogais faltando + campo de input por vogal, frase-contexto visivel.",
    "Palavra-esqueleto em destaque (consoantes fixas, lacunas nas vogais), frase-contexto abaixo dando a pista semantica que desambigua o par minimo.")

add(112, "Bloco de leitura/noticia (novo, aprovado)", "Punctuate The Text And Add Capitals", "A", "Sim",
    "PunctuationCapsEngine", "Deterministica (compara posicoes de pontuacao/maiuscula)",
    "Texto corrido sem pontuacao nem maiusculas; usuario adiciona nos lugares certos. Ativa duas regras da planilha de gramatica que nenhuma engine usava: Gross-/Kleinschreibung (categoria 18, maiuscula em todo substantivo) e Kommaregeln (categoria 18, capitulos complementares PONS). " + BLOCO,
    "D1 (content_topics categoria 18 + accepted_answers = posicoes certas) + Worker.",
    "Texto corrido clicavel; clicar entre letras insere pontuacao/maiuscula, toggle pra cada tipo de marca.",
    "Texto corrido editavel inline, marcas inseridas aparecem destacadas; diff final mostra posicoes certas vs. erradas/faltantes.")

add(113, "Bloco de leitura/noticia (novo, aprovado)", "Compound Segmentation (Put A Slash, adaptado)", "A", "Sim",
    "CompoundSegmentationEngine", "Deterministica (compara posicoes de segmentacao)",
    "Adaptacao do 'Put A Slash Where The Spaces Are' original (nao faz sentido literal em alemao, que ja usa espaco entre palavras) pro principio de segmentar Komposita: usuario marca onde cada palavra-componente comeca dentro de um substantivo composto longo (ex. Taschenrechnerbatteriefachdeckel). Ativa o topico Komposita da categoria 15 (Wortbildung), sem engine associada ate agora. " + BLOCO,
    "D1 (content_topics categoria 15 + accepted_answers = posicoes de corte) + Worker.",
    "Palavra composta longa exibida sem separacao; clicar entre letras insere um marcador de corte.",
    "Palavra composta em destaque grande, marcadores de corte aparecem como barras verticais; apos corrigir, cada componente segmentado fica com uma cor diferente.")

# ---------- Categoria 12: Fonetica e fala — aprovado, ver docs/08 ----------
# Pipeline de comparacao fonema a fonema (phonemizer/espeak-ng pro IPA-alvo +
# wav2vec2-espeak ou allosaurus pro reconhecido, escolha por piloto empirico).
# Audio-alvo vem do TTS (Piper) da mesma frase ja gerada pela KB — reusa o
# mesmo mecanismo que ja alimenta o DictationEngine (item 28), nao e sourcing
# novo. Ver app/migrations/0001_init.sql (phoneme_scores, exercises.source_type).
add(114, "Fonetica e fala (novo, aprovado)", "Read Aloud", "A", "Sim",
    "ReadAloudEngine", "Deterministica (diff fonema a fonema, IPA) via reconhecedor local",
    "Mostra a frase-alvo gerada pela KB; usuario grava lendo em voz alta; pode ouvir a propria gravacao e regravar quantas vezes quiser antes de submeter (nunca 'so uma chance' — ansiedade social, docs/03). Ao submeter, a frase reaparece com os fonemas errados destacados em IPA, e so entao toca o audio-gabarito (TTS da mesma frase) — transcricao/audio de referencia nunca aparece antes da tentativa, mesma regra do docs/06 e docs/07. Nome e mecanismo estabelecidos na literatura de CAPT (mesma tarefa que TOEFL/PTE/Speechace chamam de 'Read Aloud'); difere do Shadowing (item 2) por ser texto-primeiro (le, depois fala) em vez de audio-primeiro (ouve, depois repete), e por ter correcao automatica.",
    "MediaRecorder (gravacao) + wav2vec2-lv-60-espeak-cv-ft ou allosaurus (reconhecimento) + phonemizer/espeak-ng (IPA-alvo) + D1 (phoneme_scores) + Piper (audio-gabarito).",
    "Grava -> ouvir/regravar a vontade -> submete -> ve destaque de fonemas errados + ouve gabarito.",
    "Frase em destaque no topo, botao de gravar grande abaixo (mesmo padrao do Shadowing/RecordedOpinionEngine); pos-submissao, a mesma frase reaparece com os fonemas errados marcados (ex. sublinhado no IPA correspondente), player do audio-gabarito logo abaixo.")

add(115, "Fonetica e fala (novo, aprovado)", "Spoken Gap-Fill", "A", "Sim",
    "SpokenGapFillEngine (variante em voz do GapFillGovernanceEngine, item 9)", "Hibrida: deterministica (STT + accepted_answers, checagem lexical) + diff fonema a fonema (checagem de pronuncia)",
    "Mesma frase com lacuna sem ambiguidade do item 9 (artigo, ou verbo com infinitivo exposto pedindo conjugacao/declinacao), mas a resposta inteira e falada, nao digitada. Ao submeter: primeiro valida se a palavra certa foi dita (faster-whisper transcreve, compara a accepted_answers, igual ao item 9), depois mostra a qualidade de pronuncia da frase inteira (pipeline do ReadAloudEngine). As duas checagens aparecem em blocos visuais SEPARADOS, nunca um score so — mesmo principio de nao misturar canais de feedback ja usado em showed_up/correction_json.",
    "MediaRecorder + faster-whisper (STT, checagem lexical) + wav2vec2-espeak/allosaurus + phonemizer (checagem de pronuncia) + D1 (phoneme_scores).",
    "Igual ao item 9 (ve a frase+lacuna+infinitivo), mas grava em vez de digitar; ouvir/regravar antes de submeter, igual ao ReadAloudEngine.",
    "Mesmo layout do item 9 (frase com lacuna em destaque), botao de gravar no lugar do campo de texto; pos-submissao, dois blocos de feedback separados — 'palavra certa? sim/nao' em cima, destaque de pronuncia embaixo.")

add(116, "Fonetica e fala (novo, aprovado)", "Shadowing de vocabulario isolado (com correcao)", "A", "Sim",
    "ShadowingEngine (variante: vocabulario isolado + correcao)", "Deterministica (diff fonema a fonema, IPA) via reconhecedor local",
    "Mesma mecanica do Shadowing (toca o audio, usuario grava repetindo, ouve a propria gravacao), numa palavra do lexicon em vez de frase/trecho — caso mais facil de comecar, sem os problemas de coarticulacao/fala conectada que tornam frases continuas mais dificeis de reconhecer fonema a fonema. Ja nasce na variante com correcao (como o item 117): depois de se ouvir, mostra a transcricao fonetica do que foi dito comparada a transcricao-alvo, com as diferencas destacadas. Multiplica por entrada do lexicon (Grupo A), diferente do Shadowing original (item 2, Grupo B, nao multiplica por topico).",
    "Player de audio + MediaRecorder + wav2vec2-espeak/allosaurus + lexicon.ipa (alvo, se ja curado via Wiktionary) ou phonemizer (fallback) + D1 (lexicon, phoneme_scores) + audio-alvo via TTS OU Forvo (pronuncia real de nativo, indexado por palavra — API confirmada, alemao incluso).",
    "Toca a palavra -> grava repetindo -> ouve a propria gravacao -> ve a transcricao fonetica comparada, diferencas destacadas.",
    "Palavra em destaque grande, botao de gravar abaixo; pos-gravacao, player da propria gravacao pra auto-comparacao; em seguida, as duas transcricoes foneticas lado a lado com as diferencas marcadas.")

add(117, "Fonetica e fala (novo, aprovado)", "Shadowing com correcao", "B", "Sim",
    "ShadowingEngine (variante: com correcao)", "Deterministica (diff fonema a fonema, IPA) via reconhecedor local",
    "Mesma mecanica exata do item 2 (toca so o audio do trecho, usuario grava repetindo, ouve a propria gravacao) — a UNICA diferenca e que, depois de se ouvir, o usuario ve a transcricao fonetica (IPA) do que ele falou comparada a transcricao-alvo do audio, com as diferencas destacadas. Nao substitui o item 2, que continua sem correcao (foco em prosodia) — e uma segunda opcao lado a lado, escolhida pelo usuario conforme a sessao.",
    "Player de audio + MediaRecorder + wav2vec2-espeak/allosaurus (reconhecimento) + phonemizer/espeak-ng (IPA-alvo) + D1 (phoneme_scores).",
    "Igual ao item 2 (toca, grava, ouve a si mesmo), com um passo a mais: ve a transcricao fonetica comparada antes de encerrar.",
    "Igual ao item 2 (trecho-alvo em destaque, botao de gravar, player da propria gravacao), com um bloco adicional abaixo mostrando as duas transcricoes foneticas lado a lado e as diferencas marcadas.")

add(118, "Fonetica e fala (novo, aprovado)", "Read Aloud de vocabulario isolado", "A", "Sim",
    "ReadAloudEngine (variante: vocabulario isolado)", "Deterministica (diff fonema a fonema, IPA) via reconhecedor local",
    "Mesma mecanica do ReadAloudEngine (item 114): mostra a palavra ESCRITA (do lexicon), usuario le em voz alta gravando, pode ouvir/regravar a vontade antes de submeter, feedback com fonemas errados destacados, so entao ouve o audio-gabarito. Completa a mesma dupla de granularidade que ja existe pro Shadowing (item 2/117 = frase/trecho, item 116 = palavra isolada): aqui item 114 = frase, este item = palavra isolada, mantendo texto-primeiro (le, depois fala) em vez de audio-primeiro (ouve, depois repete). Target IPA vem de lexicon.ipa (ja curado via Wiktionary) quando a palavra ja estiver no lexicon, com phonemizer como fallback.",
    "MediaRecorder + wav2vec2-espeak/allosaurus (reconhecimento) + lexicon.ipa (alvo, se ja curado) ou phonemizer (fallback) + D1 (lexicon, phoneme_scores) + audio-alvo via TTS ou Forvo.",
    "Ve a palavra escrita -> grava lendo -> ouve/regrava a vontade -> submete -> ve fonemas errados destacados -> ouve o audio-gabarito.",
    "Palavra em destaque grande, botao de gravar abaixo; pos-submissao, fonemas errados destacados na propria palavra + player do audio-gabarito (TTS ou Forvo).")

assert len(rows) == 118, f"esperado 118 linhas, tem {len(rows)}"

# ---------------- montagem do workbook ----------------
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Engines por Exercicio"

headers = ["ID", "Categoria original", "Nome do exercicio", "Grupo", "Em escopo v1",
           "Engine / classe proposta", "Mecanismo de correcao", "Como funciona",
           "Stack tecnico", "Interacao do usuario", "Apresentacao visual"]
ws.append(headers)

header_fill = PatternFill("solid", fgColor="434343")
header_font = Font(name=FONT, size=11, bold=True, color="FFFFFF")
for c in range(1, len(headers) + 1):
    cell = ws.cell(row=1, column=c)
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

thin = Side(style="thin", color="CCCCCC")
border = Border(left=thin, right=thin, top=thin, bottom=thin)

for r, row in enumerate(rows, start=2):
    values = [row["id"], row["categoria"], row["nome"], row["grupo"], row["escopo"],
              row["engine"], row["correcao"], row["funciona"], row["stack"],
              row["interacao"], row["visual"]]
    for c, v in enumerate(values, start=1):
        cell = ws.cell(row=r, column=c, value=v)
        cell.font = Font(name=FONT, size=10)
        cell.alignment = Alignment(vertical="top", wrap_text=True)
        cell.border = border
    fill_color = GRUPO_FILL.get(row["grupo"])
    if fill_color:
        for c in range(1, len(headers) + 1):
            ws.cell(row=r, column=c).fill = PatternFill("solid", fgColor=fill_color)

# larguras de coluna
widths = [5, 26, 30, 8, 22, 30, 26, 55, 40, 40, 45]
for i, w in enumerate(widths, start=1):
    ws.column_dimensions[get_column_letter(i)].width = w

ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{len(rows)+1}"

# aba de legenda
legend = wb.create_sheet("Legenda")
legend_rows = [
    ["Grupo", "Significado", "Em escopo na v1?"],
    ["A", "Templates reutilizaveis - geram multiplas variacoes por topico gramatical/fonetico ou por texto gerado (bloco de leitura/noticia)", "Sim"],
    ["B", "Motor semanal / ferramentas pessoais recorrentes - nao multiplicam por topico", "Sim"],
    ["C", "Herdado de metodologia de sala de aula/grupo (My Way + eslgames.com)", "Nao, por padrao"],
    ["D", "Roleplay adversarial via LLM (contestacao hostil, speech) - texto e voz", "Sim"],
    ["E", "Baseado em video/audio (ZDF, DW, cenas de filme) - so link, sem armazenar midia", "Sim"],
]
for r in legend_rows:
    legend.append(r)
legend["A1"].font = Font(name=FONT, bold=True)
legend["B1"].font = Font(name=FONT, bold=True)
legend["C1"].font = Font(name=FONT, bold=True)
for row in legend.iter_rows(min_row=2, max_row=len(legend_rows)):
    for cell in row:
        cell.font = Font(name=FONT, size=10)
        cell.alignment = Alignment(vertical="top", wrap_text=True)
for cell in legend[1]:
    cell.alignment = Alignment(vertical="top", wrap_text=True)
legend.column_dimensions["A"].width = 10
legend.column_dimensions["B"].width = 70
legend.column_dimensions["C"].width = 18

out_path = Path(__file__).resolve().parent.parent / "docs" / "05-engines-por-exercicio.xlsx"
wb.save(out_path)
print("Salvo em", out_path)
print("Total de linhas:", len(rows))
from collections import Counter
print("Distribuicao por grupo:", Counter(r["grupo"] for r in rows))

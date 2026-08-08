"""Fase 5 (CLAUDE.md, docs/06-bloco-texto-noticias.md) -- gera o texto-base
de um `reading_block`: SEMPRE original, nível B2/C1, citando uma notícia real
(DW Top-Thema/ZDF logo!/Nachrichtenleicht) só como INSPIRAÇÃO FACTUAL --
nunca copia/rapa texto literal (mesma técnica que a breakingnewsenglish.com
usa há 20+ anos pra reciclar notícia sem problema de direito autoral).

Os fatos da notícia real são buscados por fora deste módulo (WebSearch/
WebFetch, curadoria assistida por mim a cada bloco -- decisão do usuário,
não automatizado dentro do pipeline) e passados como `fatos` (string livre,
lista de fatos em qualquer idioma) pra este gerador.
"""
from dataclasses import dataclass

TEMPLATE_NAME = "Reading Block Text"

SYSTEM_PROMPT = """Você é um jornalista/redator de material didático de alemão nível B2/C1, escrevendo pra um \
app pessoal de estudo. Sua tarefa é escrever um texto ORIGINAL em alemão sobre um tema atual, baseado nos \
FATOS fornecidos (de uma notícia real) -- mas o texto em si tem que ser sua própria redação, nunca uma \
tradução ou paráfrase próxima do texto-fonte original (que nem está em alemão nesta etapa). Os fatos são \
matéria-prima factual, não um roteiro pra copiar a estrutura frase a frase.

Regras:
- Nível B2/C1: vocabulário e estrutura de frase mais ricos que uma notícia simplificada (Leichte Sprache) -- \
use Nebensätze, Nominalstil ocasional, conectores variados, vocabulário preciso.
- Tamanho: 180-280 palavras, 3-5 parágrafos curtos, estrutura de notícia (lead com o fato principal, depois \
contexto/detalhes).
- Tom jornalístico neutro, sem opinião pessoal nem sensacionalismo.
- Use APENAS os fatos fornecidos -- não invente números, nomes ou detalhes que não estejam nos fatos-fonte; \
se precisar de uma frase de transição/contexto genérico, tudo bem, mas fatos específicos (datas, nomes, \
números) têm que vir do material fornecido.
- "titulo": um título curto e jornalístico em alemão pro texto (não precisa ser o mesmo título da notícia \
original).

Responda SOMENTE com um objeto JSON válido: {"titulo": "...", "texto": "..."}, sem texto antes ou depois, \
sem markdown, sem explicação."""


def build_user_prompt(fatos: str, fonte_nome: str, nivel: str = "B2/C1") -> str:
    return f"""Fatos da notícia real (fonte: {fonte_nome}) -- use como matéria-prima, escreva um texto \
ORIGINAL em alemão nível {nivel} a partir deles, sem copiar estrutura de frase:

{fatos}

Responda no formato JSON descrito."""


@dataclass
class ReadingBlockDraft:
    titulo: str
    texto: str

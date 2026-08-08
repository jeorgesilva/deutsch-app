"""Fase 8 (CLAUDE.md, docs/08-fonetica-e-fala.md) -- gera o IPA-alvo de um
texto de referência via phonemizer/espeak-ng. Insumo pro diff fonema a
fonema contra o que o reconhecedor de fones (wav2vec2-espeak/allosaurus)
identificou no áudio gravado.
"""
import re

from phonemizer import phonemize
from phonemizer.separator import Separator

# phonemizer exige phone/word diferentes se os dois forem nao-vazios --
# usa "|" pra palavra (necessario pra manter o espacamento CORRETO entre
# fonemas de palavras adjacentes; tentar word="" faz os fonemas da ultima
# silaba de uma palavra colarem na primeira da proxima, ex. "ɑː th" em vez
# de "ɑː t" + "h" -- achado real, nao teorico) e remove o marcador "|" DEPOIS,
# via regex, ja que ele nao e' um fonema de verdade -- so um separador
# visual. Sem essa limpeza, o phone_diff (recognize.py) tratava "|" como se
# fosse um fonema a comparar, gerando "FALTOU '|'" espurio.
_SEPARATOR = Separator(phone=" ", word=" | ", syllable=None)
_WORD_MARKER_RE = re.compile(r"\s*\|\s*")


def target_ipa(texto: str, with_stress: bool = False) -> str:
    raw = phonemize(
        texto, language="de", backend="espeak", separator=_SEPARATOR,
        strip=True, with_stress=with_stress,
    )
    return _WORD_MARKER_RE.sub(" ", raw).strip()

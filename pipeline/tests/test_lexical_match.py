"""phonetics/stt.lexical_match -- checagem lexical do SpokenGapFillEngine por
palavra inteira (antes era substring)."""
from deutsch_pipeline.phonetics.stt import lexical_match


def test_frase_inteira_com_a_preposicao_certa():
    assert lexical_match("Die Lieferung wird voraussichtlich am kommenden Freitag eintreffen.", ["am"])


def test_preposicao_curta_nao_casa_dentro_de_outra_palavra():
    # "an" está em "kann" e "angenehm"; "im" em "immer" -- nada disso é a resposta
    assert not lexical_match("Er kann das immer angenehm finden.", ["an", "im"])


def test_preposicao_errada_nao_passa():
    assert not lexical_match("Die Lieferung wird voraussichtlich um kommenden Freitag eintreffen.", ["am"])


def test_maiuscula_e_pontuacao_nao_atrapalham():
    assert lexical_match("Am.", ["am"])


def test_resposta_com_mais_de_uma_palavra_e_variante_colada():
    assert lexical_match("Sie stellte den Erfolg in Frage.", ["in Frage", "inFrage"])
    assert lexical_match("Sie stellte den Erfolg infrage.", ["in Frage", "inFrage"])
    assert not lexical_match("Sie stellte den Erfolg in der Frage.", ["in Frage", "inFrage"])


def test_umlaut_conta_como_letra():
    assert lexical_match("Wir warten für dich.", ["für"])
    assert not lexical_match("Wir warten fur dich.", ["für"])


def test_lista_vazia_ou_resposta_vazia():
    assert not lexical_match("qualquer coisa", [])
    assert not lexical_match("qualquer coisa", [""])

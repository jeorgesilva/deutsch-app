"""Fase 8 -- piloto empirico: roda wav2vec2-espeak E allosaurus contra as
gravacoes reais do usuario, compara com o IPA-alvo (phonemizer), imprime
lado a lado pra decisao humana (nao ha metrica unica que substitua o
usuario ouvindo a propria gravacao e julgando qual diff faz mais sentido).
"""
import argparse
from pathlib import Path

from .recognize import phone_diff, recognize_allosaurus, recognize_wav2vec
from .target_ipa import target_ipa

SENTENCES = {
    "01": "Der Staat hat die Stadt finanziell unterstützt.",
    "02": "Das Mädchen fand die alte Mühle wirklich schön.",
    "03": "Ich möchte noch ein Buch über die Chemie kaufen.",
    "04": "Das Kalb steht neben dem Bad, aber die Kälber stehen neben den Bädern.",
    "05": "Die Uhr hängt an der alten Wand im Büro.",
    "06": "Er steht jeden Morgen früh auf und benutzt dann den Taschenrechner.",
    "07": "Ich gehe heute noch einkaufen.",
    "08": "Gehst du heute noch einkaufen?",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wav-dir", type=Path, required=True)
    args = parser.parse_args()

    for key, texto in SENTENCES.items():
        wav_path = args.wav_dir / f"{key}.wav"
        if not wav_path.exists():
            print(f"[{key}] arquivo nao encontrado: {wav_path}, pulando")
            continue

        tgt = target_ipa(texto)
        rec_w2v = recognize_wav2vec(wav_path)
        rec_allo = recognize_allosaurus(wav_path)

        diff_w2v = phone_diff(tgt, rec_w2v)
        diff_allo = phone_diff(tgt, rec_allo)

        print(f"\n{'=' * 70}")
        print(f"[{key}] {texto}")
        print(f"  ALVO:       {tgt}")
        print(f"  WAV2VEC2:   {rec_w2v}  (similaridade: {diff_w2v['similarity']:.2f})")
        print(f"  ALLOSAURUS: {rec_allo}  (similaridade: {diff_allo['similarity']:.2f})")


if __name__ == "__main__":
    main()

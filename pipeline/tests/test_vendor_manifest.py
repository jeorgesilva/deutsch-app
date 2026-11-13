"""O container de geração recebe o pipeline por cópia (vendor/), arquivo por
arquivo, a partir de services/generation-container/vendor-files.txt. Módulo
importado por generation/service.py (direto ou transitivamente) que fique de
fora quebra o container no boot -- foi o que aconteceu com schemas.py em
18/10/2026. Estes testes seguem os imports estaticamente (ast, sem importar
nada, sem rede nem subprocesso) e comparam com o manifesto.
"""
import ast
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PKG_ROOT = REPO_ROOT / "pipeline" / "src" / "deutsch_pipeline"
CONTAINER = REPO_ROOT / "services" / "generation-container"
ENTRYPOINT = "generation/service.py"


def _manifesto():
    linhas = (CONTAINER / "vendor-files.txt").read_text().splitlines()
    return {s for s in (l.strip() for l in linhas) if s and not s.startswith("#")}


def _arquivo_do_modulo(partes):
    """('generation', 'pilot') -> 'generation/pilot.py' ou o __init__.py do pacote."""
    base = PKG_ROOT.joinpath(*partes)
    if base.with_suffix(".py").is_file():
        return "/".join(partes) + ".py"
    if (base / "__init__.py").is_file():
        return "/".join(partes + ("__init__.py",))
    return None


def _imports_internos(rel):
    """Arquivos de deutsch_pipeline importados por `rel`, inclusive os
    imports dentro de função (conservador: o boot não os executa, mas a
    rota que os chama quebraria do mesmo jeito)."""
    pacote = tuple(Path(rel).parent.parts)
    arvore = ast.parse((PKG_ROOT / rel).read_text(), filename=rel)
    achados = set()
    for no in ast.walk(arvore):
        if isinstance(no, ast.Import):
            for alias in no.names:
                partes = alias.name.split(".")
                if partes[0] == "deutsch_pipeline":
                    achados.add(tuple(partes[1:]))
        elif isinstance(no, ast.ImportFrom):
            if no.level:
                base = pacote[: len(pacote) - (no.level - 1)]
            elif no.module and no.module.split(".")[0] == "deutsch_pipeline":
                base = ()
            else:
                continue
            modulo = tuple(no.module.split(".")) if no.module else ()
            if not no.level:
                modulo = modulo[1:]
            alvo = base + modulo
            achados.add(alvo)
            # `from . import schemas` / `from .pkg import sub`: o nome pode ser submódulo.
            for alias in no.names:
                achados.add(alvo + (alias.name,))
    arquivos = set()
    for partes in achados:
        # todo pacote no caminho precisa do __init__.py
        for i in range(len(partes) + 1):
            arq = _arquivo_do_modulo(partes[:i])
            if arq:
                arquivos.add(arq)
    return arquivos


def _fecho_de_imports(inicio):
    vistos, fila = set(), [inicio, "__init__.py"]
    while fila:
        rel = fila.pop()
        if rel in vistos:
            continue
        vistos.add(rel)
        fila.extend(_imports_internos(rel) - vistos)
    return vistos


def test_manifesto_cobre_imports_do_service():
    faltando = _fecho_de_imports(ENTRYPOINT) - _manifesto()
    assert not faltando, (
        "módulos importados por generation/service.py fora de "
        f"services/generation-container/vendor-files.txt: {sorted(faltando)}"
    )


def test_manifesto_so_lista_arquivos_existentes():
    inexistentes = {f for f in _manifesto() if not (PKG_ROOT / f).is_file()}
    assert not inexistentes, f"vendor-files.txt lista arquivos que não existem: {sorted(inexistentes)}"


def test_dockerfile_copia_toda_pasta_do_manifesto():
    dockerfile = (CONTAINER / "Dockerfile").read_text()
    copiadas = set(re.findall(r"COPY vendor/pipeline/src/deutsch_pipeline/(\w+)/", dockerfile))
    pastas = {Path(f).parts[0] for f in _manifesto() if len(Path(f).parts) > 1}
    assert pastas <= copiadas, f"pastas do manifesto sem COPY no Dockerfile: {sorted(pastas - copiadas)}"

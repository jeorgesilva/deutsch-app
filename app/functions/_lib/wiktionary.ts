// Fase 10 -- VideoMiningEngine (docs/05 item 3): enriquecimento de
// candidato a lexico via Wiktionary. Diferente do que CLAUDE.md registrava
// como estrategia planejada (wiktextract -- dataset bruto pra baixar e
// indexar localmente), aqui e' lookup ao vivo por palavra via API do
// MediaWiki (de.wiktionary.org) -- nao precisa de dataset de ~1GB pra
// consultar uma palavra de cada vez, e e' so' um fetch HTTPS, o Worker
// alcanca direto (mesma categoria de chamada em tempo real que a correcao
// via LLM do OpinionEssayEngine, nao a geracao em lote do pipeline).
//
// Parsing de wikitext por regex e' inerentemente best-effort -- so cobre o
// template padrao de substantivo (Deutsch Substantiv Übersicht) usado pela
// maioria dos verbetes de palavra unica; expressoes de multiplas palavras
// muitas vezes nao tem verbete proprio (retorna null, tratado no chamador
// como "sem correspondencia", nunca um erro).
export interface WiktionaryLookup {
  pos: string | null;
  gender: string | null; // 'm' | 'f' | 'n' | null (so' relevante pra substantivo)
  plural: string | null;
  ipa: string | null;
}

function extractPos(wikitext: string): string | null {
  const m = /\{\{Wortart\|([^|}]+)/.exec(wikitext);
  return m ? m[1].trim() : null;
}

function cleanWikitext(s: string): string {
  return s
    .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1")
    .replace(/'''?/g, "")
    .trim();
}

function extractNounInflection(wikitext: string): { gender: string | null; plural: string | null } {
  const templateMatch = /\{\{Deutsch Substantiv Übersicht[\s\S]*?\n\}\}/.exec(wikitext);
  if (!templateMatch) return { gender: null, plural: null };
  const block = templateMatch[0];
  const genusMatch = /Genus\s*=\s*([mfn])/i.exec(block);
  const pluralMatch = /Nominativ Plural\s*=\s*([^\n|]+)/i.exec(block);
  return {
    gender: genusMatch ? genusMatch[1].toLowerCase() : null,
    plural: pluralMatch ? cleanWikitext(pluralMatch[1]) || null : null,
  };
}

function extractIpa(wikitext: string): string | null {
  const m = /\{\{Lautschrift\|([^|}]+)/.exec(wikitext);
  return m ? m[1].trim() : null;
}

export async function lookupWiktionary(lemma: string): Promise<WiktionaryLookup | null> {
  const title = encodeURIComponent(lemma.trim());
  const url = `https://de.wiktionary.org/w/api.php?action=query&titles=${title}&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2`;

  let res: Response;
  try {
    // Wikimedia exige User-Agent descritivo pra chamadas de API (politica
    // deles) -- sem isso, requests podem ser limitados/bloqueados.
    res = await fetch(url, { headers: { "User-Agent": "deutsch-app/1.0 (ferramenta pessoal de estudo)" } });
  } catch {
    return null; // rede indisponivel -- nunca bloqueia o salvamento da nota
  }
  if (!res.ok) return null;

  const data = (await res.json()) as {
    query?: { pages?: { missing?: boolean; revisions?: { slots?: { main?: { content?: string } } }[] }[] };
  };
  const page = data.query?.pages?.[0];
  if (!page || page.missing) return null;

  const wikitext = page.revisions?.[0]?.slots?.main?.content ?? "";
  if (!wikitext) return null;

  const pos = extractPos(wikitext);
  const { gender, plural } = extractNounInflection(wikitext);
  const ipa = extractIpa(wikitext);

  if (!pos && !gender && !plural && !ipa) return null; // pagina existe mas nada aproveitavel foi extraido
  return { pos, gender, plural, ipa };
}

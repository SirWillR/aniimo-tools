// Extrai as habilidades de lar ("Homeland Ability") de cada forma de Aniimo da wiki oficial
// e grava src/assets/data/aniimo-home-abilities.json.
//
// Uso: npm run data            (usa o cache local em scripts/.cache quando existir)
//      npm run data -- --fresh (ignora o cache e baixa tudo de novo)
//
// Fonte: payloads Nuxt de https://wiki.aniimo.com/item/{id}/{forma}/_payload.json (EN e PT).
// A wiki só publica códigos (home-1000…) e níveis; o nome de cada código está em APTIDOES abaixo.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unflatten } from 'devalue';

const BASE = 'https://wiki.aniimo.com';
const UA = 'aniimo-zona-producao data script (uso pessoal, não comercial)';
const CONCURRENCY = 2;
const DELAY_MS = 300;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'scripts', '.cache');
const OUT = join(ROOT, 'src', 'assets', 'data', 'aniimo-home-abilities.json');
const FRESH = process.argv.includes('--fresh');

// Ordem da tabela "Zona de Produção" do jogo. Os códigos elementais foram mapeados pelo sprite
// da wiki (icon-home-100X usa a mesma posição de icon-attributes-<elemento>); os de trabalho,
// cruzando os níveis com os elementos de combate e com o Hideout Guides (ver README).
export const APTIDOES = [
  { codigo: 'home-1000', chave: 'fire', en: 'Fire', pt: 'Fogo', tipo: 'elemental', elemento: 'fire' },
  { codigo: 'home-1001', chave: 'grass', en: 'Grass', pt: 'Planta', tipo: 'elemental', elemento: 'grass' },
  { codigo: 'home-1002', chave: 'water', en: 'Water', pt: 'Água', tipo: 'elemental', elemento: 'water' },
  { codigo: 'home-1003', chave: 'rock', en: 'Rock', pt: 'Rocha', tipo: 'elemental', elemento: 'rock' },
  { codigo: 'home-1004', chave: 'lightning', en: 'Lightning', pt: 'Elétrico', tipo: 'elemental', elemento: 'electric' },
  { codigo: 'home-1005', chave: 'ice', en: 'Ice', pt: 'Gelo', tipo: 'elemental', elemento: 'ice' },
  { codigo: 'home-1006', chave: 'wind', en: 'Wind', pt: 'Vento', tipo: 'elemental', elemento: 'wind' },
  { codigo: 'home-1007', chave: 'dark', en: 'Dark', pt: 'Trevas', tipo: 'elemental', elemento: 'dark' },
  { codigo: 'home-1008', chave: 'light', en: 'Light', pt: 'Luz', tipo: 'elemental', elemento: 'holy' },
  { codigo: 'home-1100', chave: 'hauling', en: 'Hauling', pt: 'Transporte', tipo: 'trabalho' },
  { codigo: 'home-1101', chave: 'artisanship', en: 'Artisanship', pt: 'Artesanato', tipo: 'trabalho' },
  { codigo: 'home-1102', chave: 'leisure', en: 'Leisure', pt: 'Lazer', tipo: 'trabalho' },
  { codigo: 'home-1103', chave: 'perfumery', en: 'Perfumery', pt: 'Perfumaria', tipo: 'trabalho' },
] as const;

type Chave = (typeof APTIDOES)[number]['chave'];
const porCodigo = new Map<string, Chave>(APTIDOES.map((a) => [a.codigo, a.chave]));

// Tipos customizados que o Nuxt serializa no payload; sem eles o devalue lança "Unknown type".
const id = (v: unknown) => v;
const revivers = {
  ShallowReactive: id, Reactive: id, Ref: id, ShallowRef: id,
  EmptyRef: () => null, EmptyShallowRef: () => null, NuxtError: id, Island: id,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let rede = 0;

async function get(url: string, tries = 4): Promise<string> {
  for (let i = 1; ; i++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } }).catch((e: Error) => e);
    if (res instanceof Response && res.ok) {
      rede++;
      return res.text();
    }
    if (i >= tries) throw new Error(`${url}: ${res instanceof Response ? res.status : res.message}`);
    await sleep(1000 * 2 ** i); // backoff exponencial
  }
}

/** GET com cache em disco; só dorme (rate limit) quando realmente foi à rede. */
async function cached(url: string, file: string): Promise<string> {
  const path = join(CACHE, file);
  if (!FRESH && existsSync(path)) return readFile(path, 'utf8');
  const body = await get(url);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  await sleep(DELAY_MS);
  return body;
}

interface Componente { type?: string; props?: Record<string, any>; children?: Componente[] | null }

function detalhe(payload: string) {
  const data = unflatten(JSON.parse(payload), revivers).data as Record<string, any>;
  const key = Object.keys(data).find((k) => k.startsWith('aniimo-detail'));
  if (!key) throw new Error('payload sem aniimo-detail');
  const comps: Componente[] = data[key].directories.flatMap((d: any) => d.components ?? []);
  const info = comps.find((c) => c.type === 'aniimoInfo')?.props?.['formData'];
  if (!info) throw new Error('payload sem aniimoInfo');
  const lar = comps.find((c) => c.props?.['customKey'] === undefined && c.children?.some((x) => /^home-/.test(x.props?.['customKey'] ?? '')));
  const capsulas = (lar?.children ?? []).map((c) => ({ codigo: String(c.props?.['customKey']), nivel: Number(c.props?.['title']) }));
  // currentMorphology é uma chave (sempre em inglês); a tradução vem da tabela morphology-tags.
  const tags = Object.keys(data).find((k) => k.startsWith('morphology-tags'));
  const formas = new Map<string, string>((tags ? data[tags] : []).map((t: any) => [t.tagKey, t.name]));
  const forma: string = formas.get(info.currentMorphology) ?? info.currentMorphology;
  return { info, capsulas, forma };
}

// ---- coleta ----
const sitemap = await cached(`${BASE}/__sitemap__/en-US.xml`, 'sitemap-en.xml');
const paths = [...sitemap.matchAll(/<loc>https:\/\/wiki\.aniimo\.com(\/item\/[^<]+)<\/loc>/g)].map((m) => m[1]!);
if (paths.length === 0) throw new Error('sitemap sem /item/: o formato mudou?');

interface Entrada {
  id: string; nome: string; nomeEn: string; numero: string; forma: string; formaEn: string;
  prismana: boolean; elementos: string[]; imagem: string; aptidoes: Partial<Record<Chave, number>>;
}
const entradas: Entrada[] = [];
const erros: string[] = [];
const fila = [...paths];
let feitos = 0;

async function worker() {
  while (fila.length) {
    const path = fila.shift()!;
    const [, , numero, formaSlug] = path.split('/') as [string, string, string, string];
    try {
      const en = detalhe(await cached(`${BASE}${path}/_payload.json`, `en/${numero}__${formaSlug}.json`));
      const pt = detalhe(await cached(`${BASE}/pt${path}/_payload.json`, `pt/${numero}__${formaSlug}.json`));
      const aptidoes: Partial<Record<Chave, number>> = {};
      for (const { codigo, nivel } of en.capsulas) {
        const chave = porCodigo.get(codigo);
        if (!chave) { erros.push(`${path}: código desconhecido ${codigo}`); continue; }
        if (!Number.isInteger(nivel) || nivel < 1) erros.push(`${path}: nível inválido ${codigo}=${nivel}`);
        aptidoes[chave] = nivel;
      }
      entradas.push({
        id: `${numero}-${formaSlug}`,
        nome: pt.info.name || en.info.name,
        nomeEn: en.info.name,
        numero,
        forma: pt.forma,
        formaEn: en.forma,
        prismana: formaSlug === 'prismana-form',
        elementos: (en.info.attributes as string[]).map((a) => a.replace('attributes-', '')),
        imagem: en.info.noGenderImage || en.info.maleImage || '',
        aptidoes,
      });
    } catch (e) {
      erros.push(`${path}: ${(e as Error).message}`);
    }
    if (++feitos % 25 === 0) console.log(`${feitos}/${paths.length} formas`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// ---- validação das regras do jogo ----
const avisos: string[] = [];
const elementoDaChave = new Map<string, string>(APTIDOES.filter((a) => a.tipo === 'elemental').map((a) => [a.elemento!, a.chave]));
for (const e of entradas) {
  const esperadas = e.elementos.map((el) => elementoDaChave.get(el));
  const elementais = APTIDOES.filter((a) => a.tipo === 'elemental' && e.aptidoes[a.chave]).map((a) => a.chave);
  if (esperadas.some((x) => !x)) avisos.push(`${e.id}: elemento sem aptidão mapeada (${e.elementos})`);
  else if (esperadas.sort().join() !== elementais.sort().join())
    avisos.push(`${e.id} (${e.nomeEn} ${e.formaEn}): elementos ${e.elementos} x aptidões elementais ${elementais}`);
  const trabalho = APTIDOES.filter((a) => a.tipo === 'trabalho' && e.aptidoes[a.chave]).length;
  if (trabalho > 2) avisos.push(`${e.id}: ${trabalho} habilidades de trabalho`);
  if (Object.keys(e.aptidoes).length === 0) avisos.push(`${e.id} (${e.nomeEn} ${e.formaEn}): sem habilidades de lar`);
}

if (erros.length) {
  console.error(`\n${erros.length} erro(s):\n` + erros.join('\n'));
  process.exit(1);
}

entradas.sort((a, b) => a.numero.localeCompare(b.numero) || a.id.localeCompare(b.id));
const saida = {
  fonte: {
    site: BASE,
    endpoint: `${BASE}/item/{numero}/{forma}/_payload.json (EN e /pt)`,
    extraidoEm: new Date().toISOString(),
    formas: paths.length,
    nota: 'A wiki publica só códigos home-XXXX e níveis. Mapeamento código→aptidão em scripts/extract-home-abilities.ts.',
  },
  aptidoes: APTIDOES.map(({ codigo, chave, en, pt, tipo }) => ({ chave, codigo, en, pt, tipo })),
  aniimos: entradas.map(({ numero: _n, ...e }) => e),
};
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(saida, null, 2) + '\n');

console.log(`\nok: ${entradas.length} entradas → ${OUT} (${rede} requisições de rede)`);
if (avisos.length) console.log(`\n${avisos.length} aviso(s) de regra:\n` + avisos.join('\n'));

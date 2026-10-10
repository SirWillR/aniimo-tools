// Extrai os itens decorativos escolhidos em enfeites-escolhidos.ts e grava
// src/assets/data/lar-enfeites.json.
//
// Uso: npm run data:enfeites            (usa o cache local em scripts/.cache/aniidex quando existir)
//      npm run data:enfeites -- --fresh (ignora o cache e baixa tudo de novo)
//
// Fonte: Aniidex (https://aniidex.com/pt/items/{slug}/), exceção aprovada pelo usuário em 2026-10-10.
// O site é "todos os direitos reservados": só lemos fatos do jogo (nome, categoria, RV em que
// desbloqueia, preço e habitabilidade) dos itens escolhidos, uma página por item. Nada de arte nem de
// texto descritivo. O tamanho em tiles não existe lá: vem estimado de enfeites-escolhidos.ts.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unflatten } from 'devalue';
import { ESCOLHIDOS, type Escolhido } from './enfeites-escolhidos.ts';

const BASE = 'https://aniidex.com';
const UA = 'aniimo-zona-producao data script (uso pessoal, não comercial)';
const CONCURRENCY = 2;
const DELAY_MS = 300;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'scripts', '.cache', 'aniidex');
const OUT = join(ROOT, 'src', 'assets', 'data', 'lar-enfeites.json');
const FRESH = process.argv.includes('--fresh');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string, tries = 4): Promise<string> {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (res.ok) return res.text();
    if (i >= tries - 1 || (res.status < 500 && res.status !== 429)) throw new Error(`${res.status} em ${url}`);
    await sleep(DELAY_MS * 2 ** (i + 1));
  }
}

async function cached(url: string, file: string): Promise<string> {
  const path = join(CACHE, file);
  if (!FRESH && existsSync(path)) return readFile(path, 'utf8');
  const body = await get(url);
  await writeFile(path, body);
  await sleep(DELAY_MS);
  return body;
}

/** O estado Nuxt embutido na página (`devalue`), como na wiki. */
function payload(html: string): Record<string, any> {
  const m = html.match(/id="__NUXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!m) throw new Error('página sem __NUXT_DATA__');
  const id = (x: unknown) => x;
  const revivers = Object.fromEntries(['ShallowReactive', 'Reactive', 'Ref', 'ShallowRef', 'EmptyRef', 'EmptyShallowRef', 'NuxtError'].map((k) => [k, id]));
  return unflatten(JSON.parse(m[1]!), revivers).data;
}

const moedas: Record<string, string> = {};
const avisos: string[] = [];

function enfeite(escolhido: Escolhido, html: string) {
  const dados = payload(html);
  const item = dados[`item-${escolhido.slug}`]?.items?.find((i: any) => i.id === escolhido.id);
  if (!item) throw new Error(`${escolhido.slug}: a página não traz o item ${escolhido.id}`);
  const pt = dados[`site-text-pt-item:${escolhido.slug}`];
  const nome = pt?.items?.[escolhido.id]?.name;
  if (!nome || !item.name) throw new Error(`${escolhido.slug}: item sem nome`);

  // Como se compra: a primeira forma de obter com preço. "Unlocks at RV Lv. 8." dá o nível do Lar.
  const metodos: any[] = item.obtainMethods ?? [];
  const compra = metodos.find((m) => m.cost?.length);
  const custo = compra?.cost[0];
  const rv = metodos.map((m) => /RV Lv\. (\d+)/.exec(m.note ?? '')?.[1]).find(Boolean);
  if (custo) moedas[custo.currencyId] = pt?.items?.[custo.currencyId]?.name ?? custo.name;
  if (!custo) avisos.push(`${escolhido.slug}: sem preço (não é de loja)`);
  if (!rv) avisos.push(`${escolhido.slug}: sem RV de desbloqueio (conta como RV 1)`);

  return {
    id: escolhido.id,
    slug: escolhido.slug,
    nome,
    nomeEn: item.name as string,
    categoria: (pt?.facts?.[escolhido.id]?.['homeFacts/index'] ?? item.homeFacts?.index ?? null) as string | null,
    rv: rv ? Number(rv) : 1,
    preco: custo ? (custo.amount as number) : null,
    moeda: custo ? (custo.currencyId as string) : null,
    habitabilidade: (item.homeFacts?.habitability ?? 0) as number,
    largura: escolhido.largura,
    altura: escolhido.altura,
    tamanhoEstimado: !escolhido.medido,
    forma: escolhido.forma,
    cor: escolhido.cor ?? null,
    usos: escolhido.usos,
  };
}

await mkdir(CACHE, { recursive: true });
const fila = [...ESCOLHIDOS];
const enfeites: ReturnType<typeof enfeite>[] = [];
async function worker() {
  for (let e = fila.shift(); e; e = fila.shift()) enfeites.push(enfeite(e, await cached(`${BASE}/pt/items/${e.slug}/`, `${e.slug}.html`)));
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
// Na ordem da curadoria, para o JSON não mudar à toa.
enfeites.sort((a, b) => ESCOLHIDOS.findIndex((e) => e.id === a.id) - ESCOLHIDOS.findIndex((e) => e.id === b.id));

const repetidos = enfeites.filter((a, i) => enfeites.findIndex((b) => b.id === a.id) !== i);
if (repetidos.length) throw new Error(`itens repetidos: ${repetidos.map((r) => r.slug).join(', ')}`);

const saida = {
  fonte: {
    site: BASE,
    endpoint: '/pt/items/{slug}/',
    extraidoEm: new Date().toISOString(),
    nota: 'Nome, categoria, RV, preço e habitabilidade: Aniidex. Tamanho em tiles, desenho e usos: nossos (tamanho estimado até conferir no jogo).',
  },
  moedas,
  enfeites,
};
await writeFile(OUT, JSON.stringify(saida, null, 2) + '\n');

console.log(`${enfeites.length} enfeites em ${OUT}`);
for (const a of avisos) console.warn(`aviso: ${a}`);

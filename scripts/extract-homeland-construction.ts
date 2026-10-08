// Extrai os dados de construção do Lar (instalações, produtos, ambientes) do aniimax e grava
// src/assets/data/lar-construcao.json.
//
// Uso: npm run data:lar            (usa o cache local em scripts/.cache/aniimax quando existir)
//      npm run data:lar -- --fresh (ignora o cache e baixa tudo de novo)
//
// Fonte: github.com/ae-bii/aniimax (MIT, © aebii), num commit fixo. Exceção aprovada pelo usuário à
// regra "só wiki", válida só para a construção do Lar. Para atualizar, troque COMMIT e confira os avisos.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Ambiente, CategoriaConstrucao, Construcao, DadosConstrucao, EtapaCultivo, Produto } from '../src/app/core/lar/modelos-lar.ts';
import { ESTIMADOS, MEDIDOS } from './tamanhos-estimados.ts';

const REPO = 'https://github.com/ae-bii/aniimax';
const COMMIT = '26e6b6f0df756015317e4515bb67b4458a5d1636';
const RAW = `https://raw.githubusercontent.com/ae-bii/aniimax/${COMMIT}`;
const UA = 'aniimo-zona-producao data script (uso pessoal, não comercial)';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'scripts', '.cache', 'aniimax', COMMIT.slice(0, 7));
const OUT = join(ROOT, 'src', 'assets', 'data', 'lar-construcao.json');
const FRESH = process.argv.includes('--fresh');

const RV_MAXIMO = 20;
// facility-config.js: contagens confirmadas no jogo até RV 11 (RV 12 para Heat Furnace e Simmering Pot).
const RV_VERIFICADO = 11;

// Quantidades vistas no jogo pelo usuário, que substituem as do aniimax (RV → quantidade). Os RVs
// abaixo ficam limitados a esse valor, para a quantidade nunca diminuir ao subir de nível.
const CORRECOES_USUARIO: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  farmland: { 20: 40 },
  woodland: { 20: 20 },
  mine: { 20: 10 },
};

// Nomes de aptidão do aniimax → chaves do app (ver APTIDOES em src/app/core/data/models.ts).
const APTIDAO: Readonly<Record<string, string>> = {
  Fire: 'fire', Grass: 'grass', Water: 'water', Earth: 'rock', Lightning: 'lightning', Ice: 'ice',
  Wind: 'wind', Dark: 'dark', Light: 'light', Hauling: 'hauling', Artisanship: 'artisanship',
  Leisure: 'leisure', Perfumery: 'perfumery',
};

const AMBIENTE: Readonly<Record<string, Ambiente>> = {
  Freeze: 'freeze', Cool: 'cool', Warm: 'warm', Scorching: 'scorching', Adequate: 'adequate',
};

const CATEGORIA: Readonly<Record<string, CategoriaConstrucao>> = {
  'Materials': 'materiais', 'Environment': 'ambiente', 'Aniimo Materials': 'materiais-aniimo',
  'Materials Processing': 'processamento',
};

// Constantes do aniimax fora dos CSVs (src/models.rs, src/coverage.rs e ENVIRONMENT_BUILDING_ABILITY
// em web/app.js). Conferidas no commit acima.
const REGRAS: DadosConstrucao['regras'] = {
  raioCobertura: 4.5,
  grade: 0.25,
  temperatura: { freeze: -2, cool: -1, warm: 1, scorching: 2 },
  velocidadeFora: [0.8, 0.5],
  construcoes: {
    'heat-furnace': { modos: ['warm', 'scorching'], aptidao: 'fire' },
    'cooling-unit': { modos: ['cool', 'freeze'], aptidao: 'ice' },
    'sunlamp': { modos: ['adequate'], aptidao: 'light' },
  },
  regasPorCiclo: 2,
} as DadosConstrucao['regras'];

// Subprodutos que entram como ingrediente sem ter CSV próprio.
const SUBPRODUTOS = new Set(['wood_block', 'mineral_sand']);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let rede = 0;

async function baixar(caminho: string): Promise<string> {
  const destino = join(CACHE, caminho);
  if (!FRESH && existsSync(destino)) return readFile(destino, 'utf8');
  for (let i = 1; ; i++) {
    const res = await fetch(`${RAW}/${caminho}`, { headers: { 'user-agent': UA } }).catch((e: Error) => e);
    if (res instanceof Response && res.ok) {
      const corpo = await res.text();
      rede++;
      await mkdir(dirname(destino), { recursive: true });
      await writeFile(destino, corpo);
      await sleep(300);
      return corpo;
    }
    if (i >= 4) throw new Error(`${caminho}: ${res instanceof Response ? res.status : res.message}`);
    await sleep(1000 * 2 ** i);
  }
}

/** CSV simples do aniimax: separado por vírgula, sem aspas; campos vazios viram ''. */
function csv(texto: string): Record<string, string>[] {
  const [cabecalho, ...linhas] = texto.split(/\r?\n/).filter((l) => l.trim());
  const campos = cabecalho!.split(',').map((c) => c.trim());
  return linhas.map((l) => {
    const valores = l.split(',').map((v) => v.trim());
    return Object.fromEntries(campos.map((c, i) => [c, valores[i] ?? '']));
  });
}

const numero = (v: string | undefined) => (v ? Number(v) : 0);
const normalizar = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const tituloDe = (chave: string) => chave.split('_').map((p) => p[0]!.toUpperCase() + p.slice(1)).join(' ');

interface FacilityConfig {
  name: string; slug: string; category: string; hasWorker?: boolean; ability?: string; personality?: string;
  unlocks?: Record<string, number>; counts?: number[]; tooltip?: string;
}

// ---- coleta ----
const configJs = await baixar('web/facility-config.js');
// O módulo só declara constantes; importá-lo do cache é mais seguro do que reproduzir o parser de JS.
const configPath = join(CACHE, 'facility-config.mjs');
await writeFile(configPath, configJs);
const config = (await import(pathToFileURL(configPath).href)) as {
  FACILITIES: FacilityConfig[]; SPECIAL_RECIPES: { name: string; facility: string }[];
  MODULE_MAX_LEVELS: Record<string, number[]>; ANIIMO_MAX: (number | null)[];
  LEVEL_UP_COSTS: Record<string, { coins: number; items: [string, number][] }>;
};

const erros: string[] = [];
const avisos: string[] = [];

const porRv = <T>(lista: readonly T[]) => Array.from({ length: RV_MAXIMO }, (_, i) => lista[Math.min(i, lista.length - 1)]!);
const aptidao = (nome: string | undefined, onde: string) => {
  if (!nome) return null;
  const chave = APTIDAO[nome];
  if (!chave) erros.push(`${onde}: aptidão sem mapeamento "${nome}"`);
  return (chave ?? null) as Construcao['aptidao'];
};

// ---- construções ----
const construcoes: Construcao[] = config.FACILITIES.map((f) => {
  const onde = `facility-config ${f.name}`;
  if (!f.counts?.length) erros.push(`${onde}: sem counts`);
  if (!f.unlocks) erros.push(`${onde}: sem unlocks`);
  const categoria = CATEGORIA[f.category];
  if (!categoria) erros.push(`${onde}: categoria desconhecida "${f.category}"`);
  const tamanho = MEDIDOS[f.slug] ?? ESTIMADOS[f.slug];
  if (tamanho === undefined) erros.push(`${onde}: sem tamanho em scripts/tamanhos-estimados.ts`);
  const liberacoes = Object.entries(f.unlocks ?? {}).map(([nivel, rv]) => [Number(nivel), rv] as const);
  const nivelPorRv = Array.from({ length: RV_MAXIMO }, (_, i) =>
    Math.max(0, ...liberacoes.filter(([, rv]) => rv <= i + 1).map(([nivel]) => nivel)));
  const quantidadePorRv = porRv(f.counts ?? [0]).map((n, i) => (nivelPorRv[i] ? n : 0));
  for (const [rv, qtd] of Object.entries(CORRECOES_USUARIO[f.slug] ?? {})) {
    const i = Number(rv) - 1;
    if (quantidadePorRv[i] !== qtd) avisos.push(`${f.slug} RV ${rv}: aniimax ${quantidadePorRv[i]}, corrigido para ${qtd} (visto no jogo)`);
    quantidadePorRv[i] = qtd;
    for (let j = 0; j < i; j++) quantidadePorRv[j] = Math.min(quantidadePorRv[j]!, qtd);
  }
  const ambiente = REGRAS.construcoes[f.slug];
  return {
    chave: f.slug,
    nomeEn: f.name,
    categoria: categoria!,
    tamanho: tamanho ?? 2,
    tamanhoEstimado: !(f.slug in MEDIDOS),
    quantidadePorRv,
    nivelPorRv,
    aptidao: ambiente ? ambiente.aptidao : aptidao(f.ability, onde),
    personalidade: f.personality ?? null,
    verificada: !/not yet (verified|confirmed)/i.test(f.tooltip ?? ''),
  };
});
const construcaoPorNome = new Map(config.FACILITIES.map((f) => [f.name, f.slug]));

// Nomes bonitos dos produtos: os tooltips listam "Lv.N: Nome, Nome".
const nomesBonitos = new Map<string, string>();
for (const f of config.FACILITIES)
  for (const linha of (f.tooltip ?? '').split('&#10;'))
    for (const nome of linha.replace(/^Lv\.\d+:\s*/, '').replace(/\(.*?\)/g, '').split(','))
      if (nome.trim()) nomesBonitos.set(normalizar(nome), nome.trim());

// ---- produtos ----
const requisitos = csv(await baixar('data/aniimo_requirements.csv'));
const etapas = csv(await baixar('data/grower_steps.csv'));
const naoVerificados = new Set(csv(await baixar('data/unverified.csv')).map((r) => `${r['facility']}|${r['name']}`));
const especiais = new Set(config.SPECIAL_RECIPES.map((r) => `${r.facility}|${r.name}`));

const produtos: Produto[] = [];
for (const c of construcoes) {
  if (c.categoria === 'ambiente') continue;
  const linhas = csv(await baixar(`data/${c.chave.replaceAll('-', '_')}.csv`));
  for (const r of linhas) {
    const chave = r['name']!;
    const onde = `${c.chave}.csv ${chave}`;
    const [modulo, nivelModulo] = (r['module_requirement'] ?? '').split(':');
    const ambiente = r['environment'] ? AMBIENTE[r['environment']] : null;
    if (ambiente === undefined) erros.push(`${onde}: ambiente desconhecido "${r['environment']}"`);
    const materiais = (r['raw_materials'] ?? '').split(';').filter(Boolean);
    const quantidades = (r['required_amount'] ?? '').split(';').map(Number);
    if (materiais.length !== quantidades.filter((n) => n > 0).length && materiais.length)
      erros.push(`${onde}: raw_materials e required_amount com tamanhos diferentes`);
    const req = requisitos.filter((q) => q['name'] === chave && construcaoPorNome.get(q['facility']!) === c.chave);
    if (req.length > 1) avisos.push(`${onde}: ${req.length} linhas em aniimo_requirements, usando a primeira`);
    const cultivo: EtapaCultivo[] = etapas
      .filter((e) => e['name'] === chave && construcaoPorNome.get(e['facility']!) === c.chave)
      .map((e) => ({ etapa: e['step']!, aptidao: aptidao(e['ability'], onde)!, nivel: numero(e['min_level']) }));
    produtos.push({
      chave,
      nomeEn: nomesBonitos.get(chave) ?? tituloDe(chave),
      construcao: c.chave,
      nivel: numero(r['facility_level']),
      modulo: modulo ? { chave: modulo, nivel: numero(nivelModulo) } : null,
      ambiente: ambiente ?? null,
      tempo: r['production_time'] ? numero(r['production_time']) : null,
      trabalho: r['workload'] ? numero(r['workload']) : null,
      rendimento: r['yield'] ? numero(r['yield']) : 1,
      venda: numero(r['sell_value']),
      moeda: r['sell_currency'] || 'coins',
      custo: numero(r['cost']),
      ingredientes: materiais.map((produto, i) => ({ produto, quantidade: quantidades[i]! })),
      // Subprodutos para subir de nível: Bosque dá Blocos de Madeira; Mina, Areia Mineral.
      subproduto:
        numero(r['byproduct_yield']) > 0 && (c.chave === 'woodland' || c.chave === 'mine')
          ? { produto: c.chave === 'woodland' ? 'wood_block' : 'mineral_sand', quantidade: numero(r['byproduct_yield']) }
          : null,
      aniimo: req[0] ? { aptidao: aptidao(req[0]['ability'], onde)!, nivel: numero(req[0]['min_level']) } : null,
      etapas: cultivo,
      especial: especiais.has(`${c.nomeEn}|${chave}`),
      verificado: c.verificada && !naoVerificados.has(`${c.nomeEn}|${chave}`),
    });
  }
}

// ---- validação ----
const chaves = new Set(produtos.map((p) => p.chave));
const nomesConstrucao = new Set(construcaoPorNome.keys());
for (const p of produtos) {
  const c = construcoes.find((x) => x.chave === p.construcao)!;
  for (const i of p.ingredientes)
    if (!chaves.has(i.produto) && !SUBPRODUTOS.has(i.produto)) erros.push(`${p.construcao} ${p.chave}: ingrediente inexistente ${i.produto}`);
  if (c.aptidao && !p.aniimo) avisos.push(`${p.construcao} ${p.chave}: sem aptidão em aniimo_requirements`);
  if ((p.construcao === 'farmland' || p.construcao === 'woodland') && !p.etapas.length && !p.modulo)
    avisos.push(`${p.construcao} ${p.chave}: sem etapas de cultivo`);
  if (!Math.max(...c.nivelPorRv) || p.nivel > Math.max(...c.nivelPorRv))
    avisos.push(`${p.construcao} ${p.chave}: nível ${p.nivel} nunca liberado`);
}
for (const q of requisitos) if (!nomesConstrucao.has(q['facility']!)) erros.push(`aniimo_requirements: instalação desconhecida ${q['facility']}`);
for (const e of etapas) if (!chaves.has(e['name']!)) avisos.push(`grower_steps: produto desconhecido ${e['name']}`);

// ---- custo de subir de nível ----
const custoPorRv = Array.from({ length: RV_MAXIMO }, (_, i) => {
  const c = config.LEVEL_UP_COSTS[String(i + 1)];
  if (!c && i > 0) erros.push(`LEVEL_UP_COSTS: sem custo para o RV ${i + 1}`);
  const itens = (c?.items ?? []).map(([produto, quantidade]) => ({ produto, quantidade }));
  for (const it of itens) if (!chaves.has(it.produto) && it.produto !== 'wood_block' && it.produto !== 'mineral_sand') erros.push(`LEVEL_UP_COSTS RV ${i + 1}: produto desconhecido ${it.produto}`);
  return { moedas: c?.coins ?? 0, itens };
});

if (erros.length) {
  console.error(`\n${erros.length} erro(s):\n` + erros.join('\n'));
  process.exit(1);
}

const saida: DadosConstrucao = {
  fonte: {
    repositorio: REPO,
    commit: COMMIT,
    licenca: 'MIT',
    autor: 'aebii',
    extraidoEm: new Date().toISOString(),
    nota: 'Dados de construção do Lar do aniimax (data/*.csv e web/facility-config.js). Tamanhos marcados como estimados vêm de scripts/tamanhos-estimados.ts. Quantidades do RV 20 de Fazenda, Bosque e Mina corrigidas com o que o usuário viu no jogo (CORRECOES_USUARIO).',
  },
  rvMaximo: RV_MAXIMO,
  rvVerificado: RV_VERIFICADO,
  aniimoPorRv: porRv(config.ANIIMO_MAX),
  modulosPorRv: Object.fromEntries(Object.entries(config.MODULE_MAX_LEVELS).map(([k, v]) => [k, porRv(v)])),
  custoPorRv,
  construcoes,
  produtos,
  regras: REGRAS,
};
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(saida, null, 2) + '\n');

console.log(`ok: ${construcoes.length} construções, ${produtos.length} produtos → ${OUT} (${rede} requisições de rede)`);
if (avisos.length) console.log(`\n${avisos.length} aviso(s):\n` + avisos.join('\n'));

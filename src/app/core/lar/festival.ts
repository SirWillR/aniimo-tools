// Festival da Lua da Colheita: o evento de temporada para o qual as Fazendas coringa existem. Só fatos
// (nomes, números e datas) do aniimotools.dev/pt-br/systems/homeland/home-season/, escritos à mão
// (exceção de fonte aprovada pelo usuário em 2026-10-10). TS puro.
//
// Grande Banquete: três dos seis pratos são receitas comuns do Lar; os outros três são do festival.
//
// Receitas do festival (`PRODUTOS_DO_FESTIVAL`): das capturas do jogo que o usuário mandou em 2026-10-11
// (máquina, ingredientes, preço de venda e carga de trabalho, que é o tempo em segundos). Elas entram
// só nas contas de venda e produção (`comFestival`), nunca na planta: as sementes vivem nas Fazendas
// coringa.
//
// Suposições nossas, que a fonte não confirma: cada semente ocupa uma Fazenda comum e não pede ambiente.
import type { Aptidao } from '../data/models';
import { inventario } from './inventario';
import { rvDoProduto } from './liberacao';
import type { DadosConstrucao, Ingrediente, Produto } from './modelos-lar';
import { PRODUTO_PT } from './nomes-pt';
import { origens } from './vendas';

export interface SementeDoFestival {
  nome: string;
}

export interface PratoDoBanquete {
  nome: string;
  /** Chave do produto: em `lar-construcao.json` ou em `PRODUTOS_DO_FESTIVAL`. */
  chave: string;
}

export const FESTIVAL = {
  nome: 'Festival da Lua da Colheita',
  moeda: 'Trigo do Luar',
  /** Primeiro e último dia, no calendário do jogador. */
  inicio: { ano: 2026, mes: 9, dia: 16 },
  fim: { ano: 2026, mes: 10, dia: 27 },
  sementes: [{ nome: 'Rabanete do Orvalho-lunar' }, { nome: 'Pimenta da Lua Crescente' }] as readonly SementeDoFestival[],
  /** Minutos até a colheita. */
  crescimentoMin: 40,
  /** Unidades colhidas por semente. */
  rendimento: 8,
  /** Preço de uma semente, em Trigo do Luar. */
  precoDaSemente: 4,
  /** Trigo do Luar das 4 tarefas diárias (150 cada). */
  trigoPorDia: 600,
  banquete: {
    /** A fonte se contradiz entre 16 e 17 de outubro; vale o mais cedo. */
    prazo: { ano: 2026, mes: 10, dia: 16 },
    porPrato: 5,
    pratos: [
      { nome: 'Tanghulu', chave: 'tanghulu' },
      { nome: 'Geleia de Maçã com Bordo', chave: 'maple_candy_apple_jam' },
      { nome: 'Biscoitos de Lavanda', chave: 'lavender_cookies' },
      { nome: 'Conserva Umbralina', chave: 'umbral_pickle' },
      { nome: 'Caçarola Umbralina', chave: 'umbral_casserole' },
      { nome: 'Travessa da Colheita', chave: 'harvest_platter' },
    ] as readonly PratoDoBanquete[],
    /** Outros insumos que o banquete inteiro pede, somados (a fonte só dá o total). */
    outrosInsumos: [
      { nome: 'Sal Marinho', quantidade: 115 },
      { nome: 'Água Doce', quantidade: 40 },
      { nome: 'Vinagre de Cidra', quantidade: 5 },
      { nome: 'Açúcar Cristal', quantidade: 5 },
    ],
  },
} as const;

/** Chaves (nossas) das duas sementes do festival, na ordem de `FESTIVAL.sementes`. */
export const SEMENTES_FESTIVAL_CHAVES = ['moon_radish', 'crescent_pepper'] as const;

const produtoDoFestival = (chave: string, construcao: string, extra: Partial<Produto>): Produto => ({
  chave,
  nomeEn: PRODUTO_PT[chave] ?? chave,
  construcao,
  nivel: 1,
  modulo: null,
  ambiente: null,
  tempo: null,
  trabalho: null,
  rendimento: 1,
  venda: 0,
  moeda: 'coins',
  custo: 0,
  ingredientes: [],
  aniimo: null,
  etapas: [],
  subproduto: null,
  especial: false,
  verificado: true,
  ...extra,
});
/** Semente: preço de venda desconhecido (0); comprada com Trigo do Luar, não com moedas. */
const semente = (chave: string) => produtoDoFestival(chave, 'farmland', { tempo: FESTIVAL.crescimentoMin * 60, rendimento: FESTIVAL.rendimento });
/** Receita de máquina no nível 1. */
const receita = (chave: string, construcao: string, aptidao: Aptidao, venda: number, trabalho: number, ingredientes: Ingrediente[]) =>
  produtoDoFestival(chave, construcao, { venda, trabalho, ingredientes, aniimo: { aptidao, nivel: 1 } });

const [RABANETE, PIMENTA] = SEMENTES_FESTIVAL_CHAVES;

/** As seis receitas do festival: três pratos do banquete, dois intermediários da Travessa e o Molho. */
export const RECEITAS_DO_FESTIVAL: readonly Produto[] = [
  receita('umbral_pickle', 'pickling-jar', 'dark', 2290, 203, [
    { produto: RABANETE, quantidade: 8 },
    { produto: PIMENTA, quantidade: 8 },
    { produto: 'cider_vinegar', quantidade: 1 },
  ]),
  receita('umbral_casserole', 'blazing-stove', 'fire', 2150, 203, [
    { produto: RABANETE, quantidade: 8 },
    { produto: PIMENTA, quantidade: 8 },
    { produto: 'fresh_water', quantidade: 8 },
  ]),
  receita('harvest_platter', 'crafting-table', 'artisanship', 5290, 405, [
    { produto: 'roasted_crescent_pepper', quantidade: 1 },
    { produto: 'moon_radish_slices', quantidade: 1 },
  ]),
  receita('roasted_crescent_pepper', 'claw-game-cooker', 'fire', 1520, 162, [
    { produto: PIMENTA, quantidade: 8 },
    { produto: 'sea_salt', quantidade: 23 },
  ]),
  receita('moon_radish_slices', 'blazing-stove', 'fire', 2370, 203, [
    { produto: RABANETE, quantidade: 8 },
    { produto: 'rock_candy', quantidade: 1 },
  ]),
  receita('umbral_sweet_spicy_sauce', 'simmering-pot', 'fire', 2390, 243, [
    { produto: RABANETE, quantidade: 8 },
    { produto: PIMENTA, quantidade: 8 },
    { produto: 'sea_salt', quantidade: 23 },
  ]),
];

export const PRODUTOS_DO_FESTIVAL: readonly Produto[] = [...SEMENTES_FESTIVAL_CHAVES.map(semente), ...RECEITAS_DO_FESTIVAL];

/** Os dados do Lar com os produtos do festival somados, para as contas de venda e produção. */
export function comFestival(dados: DadosConstrucao): DadosConstrucao {
  if (dados.produtos.some((p) => p.chave === RABANETE)) return dados;
  return { ...dados, produtos: [...dados.produtos, ...PRODUTOS_DO_FESTIVAL] };
}

type Dia = { ano: number; mes: number; dia: number };
const meiaNoite = (d: Dia, mais = 0) => new Date(d.ano, d.mes - 1, d.dia + mais).getTime();

/** O festival está acontecendo em `hoje` (do primeiro ao último dia, inclusive)? */
export function festivalAtivo(hoje: Date): boolean {
  const t = hoje.getTime();
  return t >= meiaNoite(FESTIVAL.inicio) && t < meiaNoite(FESTIVAL.fim, 1);
}

/**
 * Colheitas que uma Fazenda coringa dá em 24 h. Informado pelo usuário (2026-10-11): são os Aniimo que
 * replantam, sozinhos, então o lote emenda uma semente na outra.
 */
export const COLHEITAS_POR_DIA = Math.floor((24 * 60) / FESTIVAL.crescimentoMin);

/** Sementes que o Trigo do Luar de um dia compra. */
export const sementesPorDia = (trigoPorDia: number) => Math.floor(trigoPorDia / FESTIVAL.precoDaSemente);

/**
 * Fazendas coringa que dão conta das sementes do dia, cada uma plantando sem parar. Nunca mais que as
 * Fazendas que o jogador tem.
 */
export function coringasSugeridas(trigoPorDia: number, fazendas: number): number {
  return Math.max(0, Math.min(fazendas, Math.ceil(sementesPorDia(trigoPorDia) / COLHEITAS_POR_DIA)));
}

/**
 * O que `coringas` Fazendas fazem com as sementes do dia: quantas plantam, quantas sobram sem lote e
 * quanto do tempo os lotes ficam ocupados (menos de 1 = há coringa sobrando). Null sem coringas.
 */
export function usoDasCoringas(trigoPorDia: number, coringas: number): { sementes: number; sobram: number; ocupacao: number } | null {
  if (!Number.isInteger(coringas) || coringas <= 0) return null;
  const total = sementesPorDia(trigoPorDia);
  const capacidade = coringas * COLHEITAS_POR_DIA;
  const sementes = Math.min(total, capacidade);
  return { sementes, sobram: total - sementes, ocupacao: sementes / capacidade };
}

export interface PratoNoRv {
  prato: PratoDoBanquete;
  /** A receita (dos dados do Lar ou do festival); null se faltar nos dados. */
  produto: Produto | null;
  /** RV em que dá para fazer: a receita e tudo o que ela pede liberados (null: sem dado). */
  rvLibera: number | null;
  liberado: boolean;
  /** Receita do festival (pede as sementes dele), e não uma receita comum do Lar. */
  doFestival: boolean;
  /** Culturas (famílias) de Fazenda e Bosque que a receita usa, descendo pelos ingredientes. */
  culturas: string[];
  /** Sementes do festival (chaves) que a receita usa, descendo pelos ingredientes. */
  sementes: string[];
}

/** RV em que a receita e todos os seus ingredientes (descendo por eles) estão liberados. */
function rvDaReceita(p: Produto, todos: ReadonlyMap<string, Produto>, dados: DadosConstrucao, visitados = new Set<string>()): number | null {
  let rv = rvDoProduto(p, dados);
  for (const i of p.ingredientes) {
    const x = todos.get(i.produto);
    if (rv === null) break;
    if (!x || visitados.has(x.chave)) continue;
    const r = rvDaReceita(x, todos, dados, new Set([...visitados, p.chave]));
    rv = r === null ? null : Math.max(rv, r);
  }
  return rv;
}

/** Os pratos do banquete vistos do RV do jogador: quais ele já faz e o que cada um pede plantar. */
export function pratosDoBanquete(dados: DadosConstrucao, rv: number): PratoNoRv[] {
  const d = comFestival(dados);
  const liberados = new Map(inventario(d, rv).produtos.map((p) => [p.chave, p]));
  const todos = new Map(d.produtos.map((p) => [p.chave, p]));
  const sementesDoFestival: readonly string[] = SEMENTES_FESTIVAL_CHAVES;
  return FESTIVAL.banquete.pratos.map((prato) => {
    const produto = todos.get(prato.chave) ?? null;
    const doFestival = RECEITAS_DO_FESTIVAL.some((r) => r.chave === prato.chave);
    if (!produto) return { prato, produto: null, rvLibera: null, liberado: false, doFestival, culturas: [], sementes: [] };
    const rvLibera = rvDaReceita(produto, todos, d);
    const liberado = rvLibera !== null && rvLibera <= rv;
    // Prato ainda fechado: as culturas saem de todas as receitas, para o jogador saber o que vai pedir.
    const usadas = [...origens(produto, liberado ? liberados : todos).culturas].sort();
    return {
      prato,
      produto,
      rvLibera,
      liberado,
      doFestival,
      culturas: usadas.filter((c) => !sementesDoFestival.includes(c)),
      sementes: usadas.filter((c) => sementesDoFestival.includes(c)),
    };
  });
}

/** Culturas dos pratos do banquete que o jogador já consegue fazer no RV. */
export const culturasDoBanquete = (dados: DadosConstrucao, rv: number): string[] =>
  [...new Set(pratosDoBanquete(dados, rv).filter((p) => p.liberado).flatMap((p) => p.culturas))].sort();

/** "A ou B", para os rótulos do lote coringa. */
export const SEMENTES_DO_FESTIVAL = FESTIVAL.sementes.map((s) => s.nome).join(' ou ');

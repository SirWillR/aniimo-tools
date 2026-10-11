// Festival da Lua da Colheita: o evento de temporada para o qual as Fazendas coringa existem. Só fatos
// (nomes, números e datas) do aniimotools.dev/pt-br/systems/homeland/home-season/, escritos à mão
// (exceção de fonte aprovada pelo usuário em 2026-10-10). TS puro.
//
// Grande Banquete: três dos seis pratos são receitas comuns do Lar (têm `chave`); os outros três são do
// festival e a fonte não dá a receita.
//
// Suposições nossas, que a fonte não confirma: cada semente ocupa uma Fazenda comum e não pede ambiente.
import { inventario } from './inventario';
import { rvDoProduto } from './liberacao';
import type { DadosConstrucao, Produto } from './modelos-lar';
import { origens } from './vendas';

export interface SementeDoFestival {
  nome: string;
}

export interface PratoDoBanquete {
  nome: string;
  /** Chave do produto em `lar-construcao.json`; null nos pratos do festival, cuja receita a fonte não dá. */
  chave: string | null;
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
      { nome: 'Conserva Umbralina', chave: null },
      { nome: 'Caçarola Umbralina', chave: null },
      { nome: 'Travessa da Colheita', chave: null },
    ] as readonly PratoDoBanquete[],
    /** Outros insumos que o banquete inteiro pede, somados (a fonte só dá o total). */
    outrosInsumos: [
      { nome: 'Sal Marinho', quantidade: 115 },
      { nome: 'Água Doce Simples', quantidade: 40 },
      { nome: 'Vinagre de Cidra', quantidade: 5 },
      { nome: 'Açúcar Derretido', quantidade: 5 },
    ],
  },
} as const;

type Dia = { ano: number; mes: number; dia: number };
const meiaNoite = (d: Dia, mais = 0) => new Date(d.ano, d.mes - 1, d.dia + mais).getTime();

/** O festival está acontecendo em `hoje` (do primeiro ao último dia, inclusive)? */
export function festivalAtivo(hoje: Date): boolean {
  const t = hoje.getTime();
  return t >= meiaNoite(FESTIVAL.inicio) && t < meiaNoite(FESTIVAL.fim, 1);
}

/** Ciclos de crescimento que cabem em 24 h: o máximo de plantios por dia num mesmo lote. */
export const MAX_PLANTIOS_POR_DIA = Math.floor((24 * 60) / FESTIVAL.crescimentoMin);

/** Sementes que o Trigo do Luar de um dia compra. */
export const sementesPorDia = (trigoPorDia: number) => Math.floor(trigoPorDia / FESTIVAL.precoDaSemente);

/**
 * Fazendas coringa que dão conta das sementes do dia, com o jogador replantando `plantiosPorDia` vezes
 * (cada lote cresce uma semente por vez). Nunca mais que as Fazendas que ele tem.
 */
export function coringasSugeridas(trigoPorDia: number, plantiosPorDia: number, fazendas: number): number {
  const plantios = Math.max(1, Math.min(MAX_PLANTIOS_POR_DIA, Math.floor(plantiosPorDia) || 1));
  return Math.max(0, Math.min(fazendas, Math.ceil(sementesPorDia(trigoPorDia) / plantios)));
}

/**
 * O caminho inverso: com `coringas` Fazendas, quantas vezes por dia replantar para dar conta das sementes
 * do dia, e de quanto em quanto tempo (minutos). `sementes` é o que dá para plantar: menos que o total
 * quando nem replantando sem parar as coringas dão conta. Null sem coringas.
 */
export function plantiosNecessarios(trigoPorDia: number, coringas: number): { plantios: number; intervaloMin: number; sementes: number } | null {
  if (!Number.isInteger(coringas) || coringas <= 0) return null;
  const total = sementesPorDia(trigoPorDia);
  const plantios = Math.max(1, Math.min(MAX_PLANTIOS_POR_DIA, Math.ceil(total / coringas)));
  return { plantios, intervaloMin: Math.floor((24 * 60) / plantios), sementes: Math.min(total, coringas * plantios) };
}

export interface PratoNoRv {
  prato: PratoDoBanquete;
  /** A receita nos dados do Lar; null nos pratos do festival. */
  produto: Produto | null;
  /** RV em que a receita libera (null: prato do festival, ou sem dado). */
  rvLibera: number | null;
  liberado: boolean;
  /** Culturas (famílias) de Fazenda e Bosque que a receita usa, descendo pelos ingredientes. */
  culturas: string[];
}

/** Os pratos do banquete vistos do RV do jogador: quais ele já faz e o que cada um pede plantar. */
export function pratosDoBanquete(dados: DadosConstrucao, rv: number): PratoNoRv[] {
  const liberados = new Map(inventario(dados, rv).produtos.map((p) => [p.chave, p]));
  const todos = new Map(dados.produtos.map((p) => [p.chave, p]));
  return FESTIVAL.banquete.pratos.map((prato) => {
    const produto = prato.chave ? (liberados.get(prato.chave) ?? todos.get(prato.chave) ?? null) : null;
    if (!produto) return { prato, produto: null, rvLibera: null, liberado: false, culturas: [] };
    const liberado = liberados.has(produto.chave);
    // Prato ainda fechado: as culturas saem de todas as receitas, para o jogador saber o que vai pedir.
    const culturas = [...origens(produto, liberado ? liberados : todos).culturas].sort();
    return { prato, produto, rvLibera: rvDoProduto(produto, dados), liberado, culturas };
  });
}

/** Culturas dos pratos do banquete que o jogador já consegue fazer no RV. */
export const culturasDoBanquete = (dados: DadosConstrucao, rv: number): string[] =>
  [...new Set(pratosDoBanquete(dados, rv).filter((p) => p.liberado).flatMap((p) => p.culturas))].sort();

/** "A ou B", para os rótulos do lote coringa. */
export const SEMENTES_DO_FESTIVAL = FESTIVAL.sementes.map((s) => s.nome).join(' ou ');

// Monta a entrada da recomendação de Aniimo (`core/solver/equipe.ts`) a partir do Lar no RV do jogador:
// o que cada instalação pode fazer, o material que os lotes dão, os postos fixos, a equipe dos lotes,
// a energia e o objetivo do foco. Não escolhe nada: a escolha é do solver. TS puro.
import type { Aptidao } from '../data/models';
import { type Energia, consumoDe } from './energia';
import { ESPECIE_DO_PRODUTO } from './especies-exigidas';
import { FESTIVAL } from './festival';
import type { Foco } from './foco';
import { inventario } from './inventario';
import type { DadosConstrucao, Produto } from './modelos-lar';
import { AMBIENTES_NA_PLANTA } from './planta';
import { familia } from './sugestao';
import { LOTES_POR_ANIIMO, type TabelaDeVelocidade, tabelaDaConstrucao } from './velocidade';

export interface ReceitaDaEntrada {
  /** Chave do produto (única entre as receitas). */
  chave: string;
  construcao: string;
  aptidao: Aptidao;
  /** Nível da aptidão que a receita pede. */
  nivel: number;
  tabela: TabelaDeVelocidade;
  /** Ciclos por hora a 100% de velocidade. */
  ciclosPorHora: number;
  /** Família do produto → quantidade por ciclo (o subproduto entra aqui). */
  produz: Record<string, number>;
  consome: Record<string, number>;
  /** Espécies que fazem o produto (números da wiki); null = qualquer uma. */
  familia: readonly string[] | null;
  /** Produto de moradia de Aniimo cuja família ainda não foi informada. */
  familiaPendente: boolean;
  /** Watts na rede; null = não roda com energia. */
  watts: number | null;
}

export interface InstalacaoDaEntrada {
  chave: string;
  unidades: number;
  receitas: ReceitaDaEntrada[];
}

/** Posto que ocupa um Aniimo o tempo todo, sem receita (hoje, só ambientes). */
export interface PostoFixo {
  id: string;
  tipo: 'ambiente';
  construcao: string;
  aptidao: Aptidao;
  nivel: number;
}

export interface TarefaDosLotes {
  aptidao: Aptidao;
  nivel: number;
  /** Etapas do cultivo que usam a aptidão (Sowing, Reaping…), sem repetir. */
  etapas: string[];
  /** Quantos Aniimo a tarefa pede. */
  quantidade: number;
  /** A quantidade foi fixada pelo jogador (senão vem da regra de 1 para 8 lotes). */
  manual: boolean;
}

/** O que o foco quer antes das moedas: o produto mais atrasado manda (`ritmo = min vendido ÷ peso`). */
export interface Meta {
  produto: string;
  /** Quantidade por hora que vale ritmo 1. */
  peso: number;
}

export interface EntradaEquipe {
  instalacoes: InstalacaoDaEntrada[];
  /** O que os lotes colhem por hora, por família de produto. */
  oferta: Record<string, number>;
  /** Preço de venda em moedas, por família de produto (0 = não se vende por moedas). */
  precos: Record<string, number>;
  fixos: PostoFixo[];
  tarefas: TarefaDosLotes[];
  energia: Energia;
  /** Máximo de Aniimo a usar (null = sem limite). */
  limite: number | null;
  metas: Meta[];
  /** Teto do ritmo das metas (1 = basta cumprir; null = quanto mais, melhor). */
  tetoDoRitmo: number | null;
}

export interface OpcoesEntrada {
  /** O que os lotes colhem por hora (`ofertaDosLotes`). */
  oferta: ReadonlyMap<string, number>;
  /** Fazendas e Bosques que o jogador já tem plantados (`lotesLiberados`). */
  lotes: number;
  armazens: number;
  energia: Energia;
  /** Aniimo por tarefa dos lotes fixados pelo jogador. */
  equipeLotes?: Partial<Record<Aptidao, number>>;
  /** Quantos Aniimo usar; null ou acima do limite do Lar = o limite do Lar. */
  aniimoAUsar?: number | null;
  /** Para o foco Festival: o banquete só conta até o prazo. */
  hoje?: Date;
}

const paraReceita = (p: Produto, aptidao: Aptidao, categoria: string): ReceitaDaEntrada => {
  const exigidas = ESPECIE_DO_PRODUTO[familia(p.chave)];
  const produz: Record<string, number> = { [familia(p.chave)]: p.rendimento };
  if (p.subproduto) produz[p.subproduto.produto] = (produz[p.subproduto.produto] ?? 0) + p.subproduto.quantidade;
  const consome: Record<string, number> = {};
  for (const i of p.ingredientes) consome[familia(i.produto)] = (consome[familia(i.produto)] ?? 0) + i.quantidade;
  return {
    chave: p.chave,
    construcao: p.construcao,
    aptidao: p.aniimo?.aptidao ?? aptidao,
    nivel: p.aniimo?.nivel ?? 1,
    tabela: tabelaDaConstrucao(p.construcao, categoria),
    ciclosPorHora: 3600 / p.trabalho!,
    produz,
    consome,
    familia: exigidas ?? null,
    familiaPendente: categoria === 'materiais-aniimo' && !exigidas,
    watts: consumoDe(p.construcao, categoria),
  };
};

export function entradaDaEquipe(dados: DadosConstrucao, rv: number, foco: Foco, opcoes: OpcoesEntrada): EntradaEquipe {
  const inv = inventario(dados, rv);

  const instalacoes: InstalacaoDaEntrada[] = [];
  for (const { construcao, quantidade } of inv.itens) {
    if (construcao.chave === 'farmland' || construcao.chave === 'woodland' || construcao.categoria === 'ambiente' || !construcao.aptidao) continue;
    const receitas = inv.produtos.filter((p) => p.construcao === construcao.chave && p.trabalho).map((p) => paraReceita(p, construcao.aptidao!, construcao.categoria));
    if (receitas.length) instalacoes.push({ chave: construcao.chave, unidades: quantidade, receitas });
  }

  const precos: Record<string, number> = {};
  for (const p of dados.produtos) if (p.moeda === 'coins' && p.venda > 0) precos[familia(p.chave)] ??= p.venda;

  const fixos: PostoFixo[] = [];
  for (const [chave, { aptidao }] of Object.entries(dados.regras.construcoes)) {
    const construidos = inv.itens.find((i) => i.construcao.chave === chave)?.quantidade ?? 0;
    const n = Math.min(construidos, AMBIENTES_NA_PLANTA[chave] ?? construidos);
    for (let k = 1; k <= n; k++) fixos.push({ id: `${chave}#${k}`, tipo: 'ambiente', construcao: chave, aptidao, nivel: 1 });
  }

  // Equipe dos lotes: as aptidões das etapas das culturas liberadas, mais regar (não vem nas etapas dos
  // dados; o usuário confirmou que pede Água, nível desconhecido).
  const porAptidao = new Map<Aptidao, TarefaDosLotes>();
  const lotesPorAniimo = Math.ceil(opcoes.lotes / LOTES_POR_ANIIMO);
  const tarefa = (aptidao: Aptidao, nivel: number, etapa: string, automatico = lotesPorAniimo) => {
    const fixado = opcoes.equipeLotes?.[aptidao];
    const t = porAptidao.get(aptidao) ?? { aptidao, nivel: 0, etapas: [], quantidade: Math.max(0, Math.floor(fixado ?? automatico)), manual: fixado !== undefined };
    t.nivel = Math.max(t.nivel, nivel);
    if (!t.etapas.includes(etapa)) t.etapas.push(etapa);
    porAptidao.set(aptidao, t);
  };
  if (opcoes.lotes > 0) {
    for (const p of inv.produtos) if (p.construcao === 'farmland' || p.construcao === 'woodland') for (const e of p.etapas) tarefa(e.aptidao, e.nivel, e.etapa);
    tarefa('water', 1, 'Watering');
  }
  // Armazém (informado pelo usuário, 2026-10-17): não prende um Aniimo; quem tem Transporte só vai
  // quando há produção pronta para levar. Entra junto da equipe dos lotes, 1 por armazém no automático
  // (nível desconhecido, conta 1).
  if (opcoes.armazens > 0) tarefa('hauling', 1, 'Hauling', opcoes.armazens);

  const limiteDoLar = dados.aniimoPorRv[rv - 1] ?? null;
  const pedido = opcoes.aniimoAUsar ?? null;
  const limite = pedido === null ? limiteDoLar : limiteDoLar === null ? pedido : Math.min(pedido, limiteDoLar);

  return {
    instalacoes,
    oferta: Object.fromEntries(opcoes.oferta),
    precos,
    fixos,
    tarefas: [...porAptidao.values()],
    energia: opcoes.energia,
    limite,
    ...metasDoFoco(dados, rv, foco, new Set(instalacoes.flatMap((i) => i.receitas.map((r) => familia(r.chave)))), opcoes.hoje ?? new Date()),
  };
}

function metasDoFoco(dados: DadosConstrucao, rv: number, foco: Foco, fabricaveis: ReadonlySet<string>, hoje: Date): Pick<EntradaEquipe, 'metas' | 'tetoDoRitmo'> {
  if (foco === 'nivel' && rv < dados.rvMaximo) {
    // Os itens que o próximo RV custa, na proporção em que são pedidos (moedas vêm depois, como sempre).
    const itens = dados.custoPorRv[rv]?.itens ?? [];
    return { metas: itens.map((i) => ({ produto: familia(i.produto), peso: i.quantidade })), tetoDoRitmo: null };
  }
  if (foco === 'festival') {
    const { prazo, porPrato, pratos } = FESTIVAL.banquete;
    const horas = (new Date(prazo.ano, prazo.mes - 1, prazo.dia + 1).getTime() - hoje.getTime()) / 3_600_000;
    if (horas > 0)
      return { metas: pratos.filter((p) => fabricaveis.has(p.chave)).map((p) => ({ produto: p.chave, peso: porPrato / horas })), tetoDoRitmo: 1 };
  }
  return { metas: [], tetoDoRitmo: null };
}

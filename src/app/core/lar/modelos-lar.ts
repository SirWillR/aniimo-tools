// Modelos dos dados de construção do Lar (instalações, produtos e ambientes). TS puro.
// Fonte: aniimax (github.com/ae-bii/aniimax, MIT), exceção aprovada à regra "só wiki" para esta parte.
import type { Aptidao } from '../data/models';

/** Condição de cultivo que uma cultura pede. As quatro primeiras são temperaturas; `adequate` vem do Sunlamp. */
export type Ambiente = 'freeze' | 'cool' | 'warm' | 'scorching' | 'adequate';

export type CategoriaConstrucao = 'materiais' | 'ambiente' | 'materiais-aniimo' | 'processamento';

export interface Construcao {
  /** Slug do aniimax, ex.: `carousel-mill`. */
  chave: string;
  nomeEn: string;
  categoria: CategoriaConstrucao;
  /** Lado do quadrado ocupado, em tiles. */
  tamanho: number;
  /** true quando nenhuma fonte informa o tamanho e ele foi estimado (scripts/tamanhos-estimados.ts). */
  tamanhoEstimado: boolean;
  /** Índice = RV − 1 (RV 1 a 20). */
  quantidadePorRv: number[];
  /** Nível da instalação em cada RV; 0 = ainda não liberada. Índice = RV − 1. */
  nivelPorRv: number[];
  /** Aptidão do Aniimo que trabalha nela; null quando não tem trabalhador fixo (Fazenda, Bosque). */
  aptidao: Aptidao | null;
  /** Personalidade que dá +20% de velocidade (em inglês, como no jogo). */
  personalidade: string | null;
  /** false quando o aniimax avisa que os números não foram conferidos no jogo. */
  verificada: boolean;
}

export interface Ingrediente {
  produto: string;
  quantidade: number;
}

export interface EtapaCultivo {
  /** Sowing, Reclaiming, Reaping, Logging, Collecting ou Watering. */
  etapa: string;
  aptidao: Aptidao;
  nivel: number;
}

export interface Produto {
  /** Nome interno do aniimax, ex.: `cherry_blossom`. */
  chave: string;
  nomeEn: string;
  construcao: string;
  /** Nível da instalação que libera o produto. */
  nivel: number;
  /** Módulo de melhoria exigido (variantes "quick"/"premium"). */
  modulo: { chave: string; nivel: number } | null;
  ambiente: Ambiente | null;
  /** Fazenda e Bosque: segundos de crescimento. */
  tempo: number | null;
  /** Demais: carga de trabalho (1 por segundo com Aniimo no nível exigido). */
  trabalho: number | null;
  rendimento: number;
  venda: number;
  /** `coins` ou outra moeda do jogo. */
  moeda: string;
  /** Custo em moedas da semente/muda. */
  custo: number;
  ingredientes: Ingrediente[];
  /** Aptidão e nível mínimo do Aniimo que produz (instalações com trabalhador). */
  aniimo: { aptidao: Aptidao; nivel: number } | null;
  /** Trabalhos de cultivo (Fazenda e Bosque), na ordem em que acontecem. */
  etapas: EtapaCultivo[];
  /** Subproduto de cada leva: Blocos de Madeira (Bosque) ou Areia Mineral (Mina), usados para subir de nível. */
  subproduto: { produto: 'wood_block' | 'mineral_sand'; quantidade: number } | null;
  /** Receita liberada com moeda rara; fica de fora das sugestões. */
  especial: boolean;
  verificado: boolean;
}

export interface RegrasAmbiente {
  /** A cobertura vai até esta distância do centro da construção (quadrado de 9×9). */
  raioCobertura: number;
  /** Menor passo de posição no jogo, em tiles. */
  grade: number;
  temperatura: Record<Exclude<Ambiente, 'adequate'>, number>;
  /** Velocidade de crescimento a 1 e a 2 passos de temperatura do ideal. */
  velocidadeFora: [number, number];
  /** Modos de cada construção de ambiente e a aptidão de quem cuida dela. */
  construcoes: Record<string, { modos: Ambiente[]; aptidao: Aptidao }>;
  regasPorCiclo: number;
}

export interface DadosConstrucao {
  fonte: { repositorio: string; commit: string; licenca: string; autor: string; extraidoEm: string; nota: string };
  rvMaximo: number;
  /** Até este RV as quantidades foram conferidas no jogo; acima, são extrapoladas pelo aniimax. */
  rvVerificado: number;
  /** Máximo de Aniimo no Lar por RV (null = desconhecido). Índice = RV − 1. */
  aniimoPorRv: (number | null)[];
  /** Nível máximo de cada módulo por RV. Índice = RV − 1. */
  modulosPorRv: Record<string, number[]>;
  /**
   * O que custa chegar a cada RV: moedas e itens (Blocos de Madeira e Areia Mineral até o RV 6; depois um
   * item da Bancada de Marcenaria e um do Forno com Chaminé). Índice = RV − 1; o RV 1 não custa nada.
   */
  custoPorRv: { moedas: number; itens: Ingrediente[] }[];
  construcoes: Construcao[];
  produtos: Produto[];
  regras: RegrasAmbiente;
}

/** Onde um enfeite pode aparecer: os quatro tipos de terreno decorativo e os temas produtivos. */
export type UsoEnfeite = 'praca' | 'lago' | 'pomar' | 'lazer' | 'cultivo' | 'oficina' | 'recursos' | 'moradias' | 'ninhal';

/** Item decorativo do jogo (lar-enfeites.json, gerado por `npm run data:enfeites`). */
export interface Enfeite {
  id: string;
  /** Slug da página do item no Aniidex. */
  slug: string;
  nome: string;
  nomeEn: string;
  categoria: string | null;
  /** Nível do Lar em que a loja libera (1 quando não é de loja). */
  rv: number;
  preco: number | null;
  /** Id da moeda do preço (ver `DadosEnfeites.moedas`). */
  moeda: string | null;
  habitabilidade: number;
  /** Tamanho em tiles: estimado por nós enquanto `tamanhoEstimado` (a fonte não publica). */
  largura: number;
  altura: number;
  tamanhoEstimado: boolean;
  /** Nosso desenho: id do `<symbol>` em mapa-simbolos.html, sem o prefixo `ml-`. */
  forma: string;
  cor: string | null;
  usos: UsoEnfeite[];
}

export interface DadosEnfeites {
  fonte: { site: string; endpoint: string; extraidoEm: string; nota: string };
  /** Id da moeda → nome em PT. */
  moedas: Record<string, string>;
  enfeites: Enfeite[];
}

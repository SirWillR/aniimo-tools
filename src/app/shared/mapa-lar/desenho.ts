// Tradução da planta (geometria) para o desenho ilustrado: qual símbolo, que cores e onde. Sem Angular.
import type { Aptidao } from '../../core/data/models';
import type { Retangulo } from '../../core/lar/geometria';
import type { Ambiente, Construcao } from '../../core/lar/modelos-lar';
import type { Bloco, ItemMapa, PlantaLar } from '../../core/lar/planta';

type ItemConstrucao = Extract<ItemMapa, { tipo: 'construcao' }>;

/** Cor da aura de cada condição (e do selo na tabela). */
export const COR_AMBIENTE: Readonly<Record<Ambiente, string>> = {
  freeze: '#5b86e5',
  cool: '#4cc3d9',
  warm: '#f2a33a',
  scorching: '#e0533d',
  adequate: '#e9cc3f',
};

/** [planta/copa, fruto/flor] por cultura. Variantes quick_/premium_ usam a cor da base. */
const COR_CULTURA: Readonly<Record<string, readonly [string, string]>> = {
  wheat: ['#9fbf4a', '#e8bf45'], potato: ['#6ea647', '#c89a5b'], rice: ['#8fbf55', '#e9e1a0'],
  soybean: ['#7fb24c', '#b8d36a'], rose: ['#4f8f45', '#e0455f'], cotton: ['#6f9d4c', '#fbf8f0'],
  strawberry: ['#4f9448', '#e5404a'], lavender: ['#6d9a5a', '#9c7fd6'], sugarcane: ['#9dc257', '#d9e27a'],
  ginseng: ['#5f9a4a', '#d9763f'], grape: ['#5f8f45', '#7c4ca8'], cranberry: ['#5c8a47', '#b5263e'],
  agave: ['#6aa89d', '#8fc7bb'],
  willow_wood: ['#86b86a', '#a9cf88'], bamboo: ['#9cc85a', '#c6e07e'], lemon: ['#5f9d48', '#f5d547'],
  cherry_blossom: ['#f0a3c0', '#fbd3e1'], apple: ['#5c9b45', '#d9433a'], maple_syrup: ['#d9663a', '#f09a4e'],
  palm_bark: ['#5f9a4c', '#8fc063'], chestnut: ['#6f9440', '#8a5a2b'], walnut: ['#6a8d44', '#b08a5a'],
  natural_rubber: ['#467f45', '#cfe0c1'], coconut: ['#579a50', '#8a6a3a'], cocoa: ['#4f8742', '#b0602f'],
  orange_flower: ['#62a049', '#fff1d0'],
};
const COR_PADRAO: readonly [string, string] = ['#6aa04c', '#f2e2a0'];

export function coresDaCultura(chave: string | undefined): readonly [string, string] {
  if (!chave) return COR_PADRAO;
  return COR_CULTURA[chave.replace(/^(quick|premium)_/, '')] ?? COR_PADRAO;
}

/** Símbolo de cada construção (ids dos <symbol> em mapa-lar.html). */
const SIMBOLO: Readonly<Record<string, string>> = {
  'farmland': 'fazenda', 'woodland': 'bosque', 'mine': 'mina', 'well': 'poco',
  'heat-furnace': 'fornalha', 'cooling-unit': 'resfriador', 'sunlamp': 'lampada',
  'dewy-house': 'casa-orvalho', 'nimbus-bed': 'cama-nuvem', 'tidewhisper-sandcastle': 'castelo-areia',
  'starfall-hammock': 'rede-estelar', 'floral-windmill': 'moinho-floral', 'chocadeira': 'chocadeira',
  'carousel-mill': 'moinho', 'armazem': 'armazem',
};

export interface Desenho {
  /** Ids dos símbolos: tipo + variante. */
  simbolo: string;
  area: Retangulo;
  /** Cor principal (currentColor no símbolo). */
  cor: string;
  /** Cor secundária (var(--cor-2) no símbolo). */
  cor2: string;
  item: ItemConstrucao;
}

export function desenhoDaConstrucao(item: ItemConstrucao, construcao: Construcao | undefined): Desenho {
  if (item.coringa) return { simbolo: 'fazenda-coringa', area: item.area, cor: '#f6c343', cor2: '#fff6d6', item };
  const simbolo = SIMBOLO[item.construcao] ?? 'oficina';
  const [cor, cor2] =
    item.construcao === 'armazem'
      ? [corDaAptidao('hauling'), '#fff6e6']
      : simbolo === 'fazenda' || simbolo === 'bosque'
      ? coresDaCultura(item.cultura?.chave)
      : item.condicao
        ? [COR_AMBIENTE[item.condicao], '#ffffff']
        : [corDaAptidao(construcao?.aptidao ?? null), '#fff6e6'];
  return { simbolo, area: item.area, cor, cor2, item };
}

export function corDaAptidao(aptidao: Aptidao | null): string {
  return aptidao ? `var(--ap-${aptidao})` : '#b9855a';
}

// ---- cercas ----

export interface Cerca {
  /** Trilhos (duas tábuas paralelas), já sem o vão do portão. */
  trilhos: string;
  postes: { x: number; y: number }[];
  pilares: { x: number; y: number }[];
}

/** Cerca de madeira no perímetro de `area`, com postes a cada tile e o vão do portão aberto. */
export function cerca(area: Retangulo, portao: Retangulo | null): Cerca {
  const { x, y, largura: l, altura: a } = area;
  const x1 = x + l;
  const y1 = y + a;
  const vaoIni = portao ? portao.x : 0;
  const vaoFim = portao ? portao.x + portao.largura : 0;
  // Lado de cima em dois trechos (o portão fica nele), depois direita, baixo e esquerda.
  const segmentos: [number, number, number, number][] = portao
    ? [[x, y, vaoIni, y], [vaoFim, y, x1, y]]
    : [[x, y, x1, y]];
  segmentos.push([x1, y, x1, y1], [x1, y1, x, y1], [x, y1, x, y]);
  const trilhos = segmentos
    .flatMap(([ax, ay, bx, by]) => {
      const vertical = ax === bx;
      const d = 0.09;
      return [-d, d].map((o) =>
        vertical ? `M${ax + o} ${ay}V${by}` : `M${ax} ${ay + o}H${bx}`,
      );
    })
    .join('');
  const postes: { x: number; y: number }[] = [];
  const noVao = (px: number, py: number) => portao && py === y && px > vaoIni - 1e-6 && px < vaoFim + 1e-6;
  for (let px = x; px <= x1 + 1e-6; px += 1) {
    if (!noVao(px, y)) postes.push({ x: px, y });
    postes.push({ x: px, y: y1 });
  }
  for (let py = y + 1; py < y1 - 1e-6; py += 1) postes.push({ x, y: py }, { x: x1, y: py });
  const pilares = portao ? [{ x: vaoIni, y }, { x: vaoFim, y }] : [];
  return { trilhos, postes, pilares };
}

// ---- chão dos blocos ----

export type Chao = 'prado' | 'piso' | 'cascalho' | 'palha';

export function chaoDoBloco(b: Bloco): Chao {
  switch (b.tipo) {
    case 'recursos':
      return 'cascalho';
    case 'ninhal':
      return 'palha';
    default:
      return 'prado';
  }
}

/** Separa os itens da planta por camada, na ordem de desenho. */
export function camadas(p: PlantaLar) {
  const de = <T extends ItemMapa['tipo']>(tipo: T) => p.itens.filter((i): i is Extract<ItemMapa, { tipo: T }> => i.tipo === tipo);
  return {
    caminhos: de('caminho'),
    pisos: de('piso'),
    trilhas: de('trilha'),
    cercas: de('cerca'),
    coberturas: de('cobertura'),
    construcoes: de('construcao'),
    decoracao: de('decoracao'),
  };
}

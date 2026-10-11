// Decoração da planta por terrenos, com itens reais do jogo (catálogo em lar-enfeites.json). Só enfeite:
// nunca ocupa espaço de construção nem de pátio, e não muda a posição de nada. Três partes:
// - ruas: peças de piso de 2×2 em toda a borda do tabuleiro e na divisa entre duas áreas diferentes (ver
//   ruas.ts), ligando tudo (pedidos do usuário: os terrenos não podem parecer ilhas soltas, e o mapa
//   tem rua em toda a borda). Terrenos vizinhos do mesmo tema são uma área só, sem rua no meio;
// - terrenos produtivos: vinhetas do tema no espaço que sobra (feno e girassóis no cultivo, lenha e
//   vasos junto às máquinas, carrinhos e pedras nas minas, flores e ninhos nas moradias);
// - terrenos sem construção: viram jardins. Dois terrenos livres lado a lado se unem num jardim grande,
//   sem rua no meio (pedido do usuário); os demais ficam com um dos quatro tipos (praça, lago, pomar,
//   lazer dos Aniimo). Os caminhos de cada jardim, também em peças de 2×2 inteiras, vão até a rua.
// Suposição nossa: o piso é uma camada de chão, e construções e enfeites podem ficar em cima dele.
// O controle "Eficiente ↔ Bonito" muda a densidade. Aleatória mas determinística (RNG com semente).
// TS puro.
import { type Retangulo, contem, expandir, sobrepoe, uniao } from './geometria';
import type { Enfeite, UsoEnfeite } from './modelos-lar';
import type { Bloco, ItemMapa, TerrenoDaPlanta, TipoBloco } from './planta';
import { type Margens, malhaDeRuas } from './ruas';

export type Equilibrio = 'eficiente' | 'equilibrado' | 'bonito';
export const EQUILIBRIOS: readonly Equilibrio[] = ['eficiente', 'equilibrado', 'bonito'];

/** Tipos de terreno decorativo. `jardinagem` é o jardim grande, que ocupa dois terrenos vizinhos. */
export type TipoJardim = 'praca' | 'lago' | 'pomar' | 'lazer' | 'jardinagem';

type Decoracao = Extract<ItemMapa, { tipo: 'decoracao' }>;
type Rua = Extract<ItemMapa, { tipo: 'caminho' }>;

export interface EntradaDecoracao {
  terrenos: readonly TerrenoDaPlanta[];
  blocos: readonly Bloco[];
  itens: readonly ItemMapa[];
  enfeites: readonly Enfeite[];
  equilibrio: Equilibrio;
  /** Só terrenos que abrem até este RV entram (ruas e jardins). */
  rv: number;
  semente: number;
}

/** Um jardim: o tipo e os terrenos que ele ocupa (um, ou dois vizinhos no jardim grande). */
export interface Jardim {
  tipo: TipoJardim;
  terrenos: number[];
}

export interface ResultadoDecoracao {
  itens: Decoracao[];
  /** Peças de piso das ruas entre os terrenos em uso. Existem mesmo sem enfeites. */
  ruas: Rua[];
  jardins: Jardim[];
}

/** mulberry32: pequeno, rápido e suficiente para enfeites. */
function rng(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Densidade das vinhetas e do preenchimento dos jardins em cada posição do controle. */
const DENSIDADE: Readonly<Record<Equilibrio, number>> = { eficiente: 0, equilibrado: 0.6, bonito: 1.15 };

/** Peças de chão: nunca se sobrepõem (nem às da rua), e só o que for posto de propósito fica em cima delas. */
const CHAO = new Set(['cascalho-chao', 'laje']);
/** A cerca fica na metade de dentro da rua, em cima do piso. */
const SOBRE_A_CALCADA = new Set(['cerca-jardim']);

/** Chance de cada enfeite numa célula livre de um terreno produtivo; `junto` = só encostado numa construção. */
const VINHETAS: Readonly<Record<TipoBloco, readonly { slug: string; chance: number; junto?: boolean }[]>> = {
  cultivo: [
    { slug: 'hayrick', chance: 0.05 },
    { slug: 'hay-cart', chance: 0.015 },
    { slug: 'wheelbarrow', chance: 0.02 },
    { slug: 'sunflower', chance: 0.07 },
    { slug: 'lavender', chance: 0.05 },
    { slug: 'round-shrubs', chance: 0.04 },
  ],
  oficina: [
    { slug: 'stacked-wood-pile', chance: 0.07, junto: true },
    { slug: 'terracotta-vase', chance: 0.06, junto: true },
    { slug: 'wooden-signpost', chance: 0.02, junto: true },
    { slug: 'oak', chance: 0.03 },
    { slug: 'pink-tulip', chance: 0.06 },
    { slug: 'round-shrubs', chance: 0.05 },
  ],
  recursos: [
    { slug: 'empty-cart', chance: 0.04, junto: true },
    { slug: 'starine-pile-medium', chance: 0.07, junto: true },
    { slug: 'glowstone-lamp-i', chance: 0.03, junto: true },
    { slug: 'pine-tree', chance: 0.03 },
    { slug: 'rock---repose', chance: 0.05 },
    { slug: 'round-shrubs', chance: 0.04 },
  ],
  moradias: [
    { slug: 'floral-arch', chance: 0.02 },
    { slug: 'wisteria', chance: 0.03 },
    { slug: 'woven-grass-nest', chance: 0.03 },
    { slug: 'endless-summer', chance: 0.08 },
    { slug: 'pink-tulip', chance: 0.08 },
    { slug: 'flowering-shrubs', chance: 0.06 },
    { slug: 'terracotta-vase', chance: 0.03 },
  ],
  ninhal: [
    { slug: 'hayrick', chance: 0.08 },
    { slug: 'woven-grass-nest', chance: 0.06 },
    { slug: 'daisy', chance: 0.1 },
  ],
};

/** Miudezas que preenchem o gramado de cada tipo de jardim. */
const PREENCHIMENTO: Readonly<Record<TipoJardim, readonly { slug: string; chance: number }[]>> = {
  praca: [
    { slug: 'pink-tulip', chance: 0.05 },
    { slug: 'endless-summer', chance: 0.04 },
    { slug: 'flowering-shrubs', chance: 0.04 },
    { slug: 'round-shrubs', chance: 0.03 },
  ],
  lago: [
    { slug: 'lavender', chance: 0.05 },
    { slug: 'daisy', chance: 0.05 },
    { slug: 'rock---repose', chance: 0.02 },
    { slug: 'round-shrubs', chance: 0.04 },
  ],
  pomar: [
    { slug: 'daisy', chance: 0.05 },
    { slug: 'sunflower', chance: 0.03 },
    { slug: 'moss-covered-stump', chance: 0.02 },
    { slug: 'mushroom-light', chance: 0.015 },
  ],
  lazer: [
    { slug: 'pink-tulip', chance: 0.05 },
    { slug: 'balloon', chance: 0.015 },
    { slug: 'round-shrubs', chance: 0.04 },
    { slug: 'mushroom-light', chance: 0.015 },
  ],
  jardinagem: [
    { slug: 'daisy', chance: 0.04 },
    { slug: 'lavender', chance: 0.03 },
    { slug: 'flowering-shrubs', chance: 0.03 },
    { slug: 'round-shrubs', chance: 0.03 },
  ],
};

/**
 * Uma área sendo decorada (um terreno, ou os dois de um jardim grande): põe enfeites onde couber, em
 * coordenadas locais (0,0 = canto da área).
 */
class Canteiro {
  readonly itens: Decoracao[] = [];
  private readonly ocupado: Retangulo[];
  /** Peças de chão já postas. */
  private readonly pecasDeChao: Retangulo[] = [];
  readonly area: Retangulo;

  constructor(
    /** Onde os enfeites podem ficar: o terreno, ou o miolo do jardim (para dentro das ruas). */
    area: Retangulo,
    private readonly terrenos: readonly TerrenoDaPlanta[],
    private readonly porSlug: ReadonlyMap<string, Enfeite>,
    readonly aleatorio: () => number,
    /** Construções e pátios (com meio tile de respiro em volta das construções). */
    private readonly estrutura: readonly Retangulo[],
    /** Peças de piso das ruas: só a cerca pode ficar em cima. */
    private readonly calcadas: readonly Retangulo[],
  ) {
    this.area = area;
    this.ocupado = [...estrutura];
  }

  private global(x: number, y: number, largura: number, altura: number): Retangulo {
    return { x: this.area.x + x, y: this.area.y + y, largura, altura };
  }

  private cabe(e: Enfeite, r: Retangulo, sobreChao: boolean): boolean {
    if (!contem(this.area, r) || this.ocupado.some((o) => sobrepoe(o, r))) return false;
    if (!SOBRE_A_CALCADA.has(e.forma) && this.calcadas.some((c) => sobrepoe(c, r))) return false;
    return (!CHAO.has(e.forma) && sobreChao) || !this.pecasDeChao.some((c) => sobrepoe(c, r));
  }

  /** Encostado numa construção ou pátio (a até um tile). */
  private junto(r: Retangulo): boolean {
    const perto = expandir(r, 1);
    return this.estrutura.some((o) => sobrepoe(o, perto));
  }

  /**
   * Põe o enfeite se ele existir no catálogo e couber. `giro` 90 troca largura e altura; `sobreChao`
   * deixa ficar em cima de peças de chão do jardim (o gazebo no largo, a fonte na praça).
   */
  por(slug: string, x: number, y: number, giro: 0 | 90 = 0, soJunto = false, sobreChao = false): boolean {
    const e = this.porSlug.get(slug);
    if (!e) return false;
    const [largura, altura] = giro ? [e.altura, e.largura] : [e.largura, e.altura];
    const area = this.global(x, y, largura, altura);
    if (!this.cabe(e, area, sobreChao) || (soJunto && !this.junto(area))) return false;
    (CHAO.has(e.forma) ? this.pecasDeChao : this.ocupado).push(area);
    // O enfeite é do terreno onde está o seu centro (no jardim grande, pode cruzar a divisa).
    const cx = area.x + largura / 2;
    const cy = area.y + altura / 2;
    const dono = this.terrenos.find((t) => cx >= t.area.x && cx <= t.area.x + t.area.largura && cy >= t.area.y && cy <= t.area.y + t.area.altura)!;
    this.itens.push({
      tipo: 'decoracao',
      area,
      forma: e.forma,
      variante: Math.floor(this.aleatorio() * 4),
      enfeite: e.id,
      terreno: dono.n,
      rv: e.rv,
      ...(e.cor ? { cor: e.cor } : {}),
      ...(giro ? { giro } : {}),
    });
    return true;
  }

  /** Mesmo enfeite nas posições espelhadas na horizontal (e, com `vertical`, nos quatro cantos). */
  espelhar(slug: string, x: number, y: number, vertical = false, sobreChao = false): void {
    const e = this.porSlug.get(slug);
    if (!e) return;
    const xs = [x, this.area.largura - x - e.largura];
    const ys = vertical ? [y, this.area.altura - y - e.altura] : [y];
    for (const py of ys) for (const px of xs) this.por(slug, px, py, 0, false, sobreChao);
  }

  /** Espalha miudezas pelas células livres: cada célula sorteia, na ordem, os enfeites da lista. */
  espalhar(lista: readonly { slug: string; chance: number; junto?: boolean }[], densidade: number): void {
    const { largura, altura } = this.area;
    for (let y = 0; y < altura; y++)
      for (let x = 0; x < largura; x++) {
        const r = this.aleatorio();
        let acumulado = 0;
        for (const v of lista) {
          acumulado += v.chance * densidade;
          if (r >= acumulado) continue;
          this.por(v.slug, x, y, 0, v.junto);
          break;
        }
      }
  }

  /** Uma faixa de chão (peças inteiras de `slug`) de (x, y) até cobrir `largura` × `altura`. Vem antes dos enfeites. */
  chao(slug: string, x: number, y: number, largura: number, altura: number): void {
    const e = this.porSlug.get(slug);
    if (!e) return;
    for (let py = y; py + e.altura <= y + altura + 1e-9; py += e.altura)
      for (let px = x; px + e.largura <= x + largura + 1e-9; px += e.largura) this.por(slug, px, py);
  }
}

// ---- composições dos jardins ----
// As coordenadas são do miolo do jardim, para dentro das ruas (o canteiro já vem com essa área): 16 ou 18
// de largura e 12 ou 14 de altura num terreno, 36 ou 38 de largura no jardim grande. O chão é sempre em
// peças de 2×2 inteiras e os caminhos encostam nas ruas dos quatro lados: o largo do meio tem o tamanho
// certo (`largo`) para os braços fecharem em peças inteiras.

/** Lado do largo central num miolo de tamanho `n`: 4 ou 6, o que deixar os dois braços com tamanho par. */
const largo = (n: number) => ((n / 2) % 2 ? 6 : 4);

/** Caminhos em cruz de `slug` até as quatro ruas, com um largo no meio `mais` tiles maior que o mínimo. */
function cruz(c: Canteiro, slug: string, mais = 0): Retangulo {
  const { largura: W, altura: H } = c.area;
  const [cx, cy] = [W / 2, H / 2];
  const [pw, ph] = [largo(W) + mais, largo(H) + mais];
  const meio = { x: cx - pw / 2, y: cy - ph / 2, largura: pw, altura: ph };
  c.chao(slug, meio.x, meio.y, pw, ph);
  c.chao(slug, 0, cy - 1, meio.x, 2);
  c.chao(slug, meio.x + pw, cy - 1, meio.x, 2);
  c.chao(slug, cx - 1, 0, 2, meio.y);
  c.chao(slug, cx - 1, meio.y + ph, 2, meio.y);
  return meio;
}

const JARDINS: Readonly<Record<TipoJardim, (c: Canteiro) => void>> = {
  /** Praça de laje com a fonte no meio, estátuas, bancos e postes; árvores floridas nos cantos. */
  praca(c) {
    const { largura: W, altura: H } = c.area;
    const [cx, cy] = [W / 2, H / 2];
    const p = cruz(c, 'flagstone-pavement', 4);
    c.por('spinning-fountain', cx - 1, cy - 1, 0, false, true);
    c.espelhar('retro-streetlamp', p.x, p.y, true, true);
    c.espelhar('solid-wood-low-stool', p.x + 1.5, p.y + 1, true, true);
    c.espelhar('stone-carved-figure', p.x - 1, p.y, true);
    c.espelhar('golden-trumpet-tree', 0, 0, true);
    c.espelhar('wisteria', 2.5, 0, true);
    c.espelhar('floral-arch', 0.5, cy - 2);
    c.espelhar('floral-arch', 0.5, cy + 1);
    c.espelhar('box-hedge', 5, p.y - 1, true);
  },
  /** Lago largo com ponte; do lado da ponte, acampamento com mesa, sombrinha e fogueira. */
  lago(c) {
    const { largura: W, altura: H } = c.area;
    // O caminho corre numa linha par, para os dois braços de cima a baixo fecharem em peças inteiras.
    const y0 = 2 * Math.floor((H / 2 - 1) / 2);
    const px = W - 6;
    c.chao('gravel-path', px, y0, 6, 2);
    c.chao('gravel-path', px, 0, 2, y0);
    c.chao('gravel-path', px, y0 + 2, 2, H - y0 - 2);
    c.por('stone-bridge', px - 3, y0);
    c.por('curved-pond', px - 7, y0 - 0.5);
    c.por('curved-pond', px - 11, y0 - 0.5);
    if (!c.por('wooden-waterwheel', px - 11, y0 + 2.5)) c.por('wooden-waterwheel', px - 7, y0 + 2.5);
    c.por('camping-canopy', px + 2.5, 0.5);
    c.por('bonfire', px - 2, y0 - 2);
    c.por('solid-wood-low-stool', px - 3, y0 - 2);
    c.por('solid-wood-low-stool', px - 1.5, y0 - 1);
    c.por('grassland-dining-table', px + 2.5, y0 + 2.5);
    c.por('sun-umbrella', px + 3.5, H - 2);
    c.por('glowstone-lamp-i', px - 3, y0 - 1);
    c.por('glowstone-lamp-i', px - 3, y0 + 2);
    for (const y of [0, H - 2]) {
      c.por('willow', 0, y);
      c.por('oak', 3, y);
      c.por('pine-tree', 6, y);
      c.por('pine-tree', 8.5, y);
    }
  },
  /** Pomar em fileiras com um gazebo no largo do meio; portão e treliças na entrada. */
  pomar(c) {
    const { largura: W, altura: H } = c.area;
    const [cx, cy] = [W / 2, H / 2];
    cruz(c, 'gravel-path');
    c.por('gazebo', cx - 2, cy - 2, 0, false, true);
    c.espelhar('garden-gate', 0, cy - 2);
    c.espelhar('puffby-flower-trellis', 2.5, cy - 2);
    c.espelhar('puffby-flower-trellis', 2.5, cy + 1);
    const arvores = ['cherry-tree', 'apple-tree', 'maple-tree'];
    [0, 2.5, 5].forEach((x, i) => {
      c.espelhar(arvores[i]!, x, 0, true);
      c.espelhar(arvores[(i + 1) % 3]!, x, 2, true);
    });
  },
  /** Parquinho dos Aniimo: escalada, balanços e tocas em volta de um largo de cascalho com a fogueira. */
  lazer(c) {
    const { largura: W, altura: H } = c.area;
    const [cx, cy] = [W / 2, H / 2];
    const p = cruz(c, 'gravel-path');
    c.por('bonfire', cx - 0.5, cy - 0.5, 0, false, true);
    c.espelhar('solid-wood-low-stool', cx - 2, cy - 0.5, false, true);
    c.por('aniimo-climbing-frame', 2.5, 0.5);
    c.por('playful-adventure-den', W - 5.5, 0.5);
    c.por('pawprint-swing', 3, H - 3);
    c.por('pawprint-swing', W - 5, H - 3);
    c.espelhar('cozy-bear-den', 0, H - 2.5);
    c.espelhar('garden-gate', 0, cy - 2);
    c.espelhar('coconut-tree', 0, 0);
    c.por('sun-umbrella', 0, 2);
    c.por('pond', W - 2, 2);
    c.espelhar('balloon', p.x - 1, p.y - 1, true);
    c.espelhar('mushroom-light', 2.5, cy - 2, true);
  },
  /**
   * Jardim grande em dois terrenos: alameda de cascalho de ponta a ponta com arcos floridos, gazebo no
   * meio, canteiros de flores com cerca viva, lagos e fontes, e árvores floridas nas bordas.
   */
  jardinagem(c) {
    const { largura: W, altura: H } = c.area;
    const [cx, cy] = [W / 2, H / 2];
    // Os braços de cima e de baixo têm tamanho par; a folga que sobrar até a alameda fica sob o gazebo.
    const braco = 2 * Math.floor((cy - 1) / 2);
    c.chao('gravel-path', 0, cy - 1, W, 2);
    c.chao('gravel-path', cx - 1, 0, 2, braco);
    c.chao('gravel-path', cx - 1, H - braco, 2, braco);
    c.por('gazebo', cx - 2, cy - 2, 0, false, true);
    c.espelhar('garden-gate', 0, cy - 2);
    for (const x of [3, 7, 11]) {
      c.espelhar('floral-arch', x, cy - 2);
      c.espelhar('floral-arch', x, cy + 1);
    }
    // Canteiros: 4×2 flores de uma espécie, com cerca viva do lado de fora.
    const flores = ['red-rose', 'endless-summer', 'pink-tulip', 'sunflower'];
    [3, 8].forEach((bx, i) => {
      for (let dx = 0; dx < 4; dx++)
        for (let dy = 0; dy < 2; dy++) {
          c.espelhar(flores[i]!, bx + dx, 1 + dy);
          c.espelhar(flores[i + 2]!, bx + dx, H - 3 + dy);
        }
      for (const dx of [0, 2]) c.espelhar('box-hedge', bx + dx, 0, true);
    });
    c.espelhar('curved-pond', 13, 0.5);
    c.espelhar('spinning-fountain', 14, H - 3);
    c.espelhar('stone-carved-figure', 13, H - 2.5);
    c.espelhar('solid-wood-low-stool', 16, H - 2.5);
    c.espelhar('retro-streetlamp', 2, cy - 2, true);
    c.espelhar('cherry-tree', 0, 0, true);
  },
};

const ORDEM_DOS_JARDINS: readonly TipoJardim[] = ['praca', 'lago', 'pomar'];

/**
 * Jardins dos terrenos livres. O primeiro par de terrenos livres lado a lado vira o jardim grande; dos
 * que sobram, o de lazer é o mais perto das moradias e os outros se revezam entre praça, lago e pomar.
 */
function escolherJardins(e: EntradaDecoracao): Jardim[] {
  const livres = e.terrenos.filter((t) => !t.tema && t.rv <= e.rv);
  const jardins: Jardim[] = [];
  const par = livres
    .map((a) => [a, livres.find((b) => b.linha === a.linha && b.coluna === a.coluna + 1)] as const)
    .find((p): p is readonly [TerrenoDaPlanta, TerrenoDaPlanta] => !!p[1]);
  if (par) jardins.push({ tipo: 'jardinagem', terrenos: [par[0].n, par[1].n] });
  const avulsos = livres.filter((t) => !par?.includes(t));
  if (!avulsos.length) return jardins;
  const moradias = e.terrenos.find((t) => t.tema === 'moradias');
  const distancia = (t: TerrenoDaPlanta) => (moradias ? Math.abs(t.coluna - moradias.coluna) + Math.abs(t.linha - moradias.linha) : 0);
  const lazer = avulsos.reduce((a, b) => (distancia(b) < distancia(a) ? b : a));
  jardins.push({ tipo: 'lazer', terrenos: [lazer.n] });
  avulsos.filter((t) => t !== lazer).forEach((t, i) => jardins.push({ tipo: ORDEM_DOS_JARDINS[i % ORDEM_DOS_JARDINS.length]!, terrenos: [t.n] }));
  return jardins;
}

/**
 * Ruas na borda do tabuleiro e entre as áreas (ver ruas.ts): terrenos vizinhos do mesmo tema, e os dois de
 * um jardim grande, são uma área só e não têm rua entre si. Uma peça só existe se todos os terrenos em que
 * ela pisa já abriram e algum terreno em uso encosta nela.
 */
function tracarRuas(
  terrenos: readonly TerrenoDaPlanta[],
  jardins: readonly Jardim[],
  aberto: (t: TerrenoDaPlanta) => boolean,
  emUso: (t: TerrenoDaPlanta) => boolean,
): { ruas: Rua[]; margens: (t: TerrenoDaPlanta) => Margens } {
  const porNumero = new Map(terrenos.map((t) => [t.n, t]));
  /** A área de cada terreno: o tema, ou o jardim a que pertence; sem nada planejado, nenhuma. */
  const areaDe = (n: number) => {
    const jardim = jardins.findIndex((j) => j.terrenos.includes(n));
    return jardim >= 0 ? `jardim ${jardim}` : (porNumero.get(n)?.tema ?? null);
  };
  const malha = malhaDeRuas(terrenos, (a, b) => areaDe(a.n) === areaDe(b.n));
  const ruas: Rua[] = malha.pecas
    .filter((peca) => {
      // A rua de uma divisa pode ficar inteira num dos dois terrenos: conta também quem só encosta nela.
      const perto = expandir(peca, 1);
      return terrenos.filter((t) => sobrepoe(t.area, peca)).every(aberto) && terrenos.some((t) => emUso(t) && sobrepoe(t.area, perto));
    })
    .map((area) => ({ tipo: 'caminho', area }));
  return { ruas, margens: (t) => malha.margens(t) };
}

/** A parte do terreno para dentro das ruas. */
const miolo = (t: TerrenoDaPlanta, m: Margens): Retangulo => ({
  x: t.area.x + m.esq,
  y: t.area.y + m.topo,
  largura: t.area.largura - m.esq - m.dir,
  altura: t.area.altura - m.topo - m.base,
});

/**
 * Cerca de jardim (só em "Bonito", nos terrenos cercados) nos lados do terreno que têm rua, na metade de
 * dentro dela, para não tirar espaço dos lotes; em cima, um vão de portão. Do lado em que o terreno se
 * une a outro, ou em que a rua fica toda no vizinho, não há cerca.
 */
function cercar(c: Canteiro, m: Margens): void {
  const { largura, altura } = c.area;
  const [x0, x1, y0, y1] = [m.esq, largura - m.dir, m.topo, altura - m.base];
  for (let x = x0; x + 2 <= x1; x += 2) {
    if (m.topo && Math.abs(x + 1 - (x0 + x1) / 2) > 1.5) c.por('garden-fence', x, y0 - 0.5);
    if (m.base) c.por('garden-fence', x, y1);
  }
  for (let y = y0; y + 2 <= y1; y += 2) {
    if (m.esq) c.por('garden-fence', x0 - 0.5, y, 90);
    if (m.dir) c.por('garden-fence', x1, y, 90);
  }
}

export function decorar(e: EntradaDecoracao): ResultadoDecoracao {
  const densidade = DENSIDADE[e.equilibrio];
  const decorando = densidade > 0 && e.enfeites.length > 0;
  const jardins = decorando ? escolherJardins(e) : [];
  const noJardim = new Set(jardins.flatMap((j) => j.terrenos));
  const { ruas, margens } = tracarRuas(e.terrenos, jardins, (t) => t.rv <= e.rv, (t) => t.rv <= e.rv && (!!t.tema || noJardim.has(t.n)));
  if (!decorando) return { itens: [], ruas, jardins };

  const porSlug = new Map(e.enfeites.map((x) => [x.slug, x]));
  const calcadas = ruas.map((r) => r.area);
  const itens: Decoracao[] = [];
  const semente = (n: number) => rng(e.semente * 7919 + n * 131 + 17);

  for (const jardim of jardins) {
    const doJardim = e.terrenos.filter((t) => jardim.terrenos.includes(t.n));
    const c = new Canteiro(uniao(doJardim.map((t) => miolo(t, margens(t)))), doJardim, porSlug, semente(jardim.terrenos[0]!), [], calcadas);
    JARDINS[jardim.tipo](c);
    c.espalhar(PREENCHIMENTO[jardim.tipo], densidade);
    itens.push(...c.itens);
  }

  for (const terreno of e.terrenos) {
    const bloco = e.blocos.find((b) => b.terreno === terreno.n);
    if (!bloco) continue;
    const aleatorio = semente(terreno.n);
    const doTerreno = e.itens.filter((i) => (i.tipo === 'construcao' || i.tipo === 'piso') && sobrepoe(i.area, terreno.area));
    // Meio tile de respiro em volta das construções; os pátios já são esse respiro.
    const estrutura = doTerreno.map((i) => (i.tipo === 'construcao' ? expandir(i.area, 0.5) : i.area));
    // A cerca fica na borda, onde o respiro das construções não deixaria: ela só evita as construções em si.
    const m = margens(terreno);
    const cerca = new Canteiro(terreno.area, [terreno], porSlug, aleatorio, doTerreno.filter((i) => i.tipo === 'construcao').map((i) => i.area), calcadas);
    if (e.equilibrio === 'bonito' && bloco.cercado) cercar(cerca, m);
    const c = new Canteiro(terreno.area, [terreno], porSlug, aleatorio, [...estrutura, ...cerca.itens.map((i) => i.area)], calcadas);
    // Um poste em cada canto, na beira da rua.
    for (const x of [m.esq, terreno.area.largura - m.dir - 1]) for (const y of [m.topo, terreno.area.altura - m.base - 1]) c.por('retro-streetlamp', x, y);
    c.espalhar(VINHETAS[bloco.tipo], densidade);
    itens.push(...cerca.itens, ...c.itens);
  }
  return { itens, ruas, jardins };
}

/** Verdadeiro se alguma decoração invade uma área funcional (usado nos testes). */
export function decoracaoInvade(itens: readonly ItemMapa[], areas: readonly Retangulo[]): boolean {
  return itens.some((i) => i.tipo === 'decoracao' && areas.some((a) => sobrepoe(a, i.area)));
}

/** Os usos que o motor de decoração conhece (para conferir o catálogo). */
export const USOS: readonly UsoEnfeite[] = ['praca', 'lago', 'pomar', 'lazer', 'cultivo', 'oficina', 'recursos', 'moradias', 'ninhal'];

/** Todo slug que o motor usa (composições, vinhetas, preenchimento, postes e cerca), para conferir com o catálogo. */
export function slugsUsados(): Set<string> {
  const usados = new Set<string>(['garden-fence', 'retro-streetlamp']);
  for (const lista of [...Object.values(VINHETAS), ...Object.values(PREENCHIMENTO)]) for (const v of lista) usados.add(v.slug);
  const espiao = { area: { x: 0, y: 0, largura: 18, altura: 12 }, por: (s: string) => (usados.add(s), true), espelhar: (s: string) => usados.add(s), chao: (s: string) => usados.add(s) };
  for (const compor of Object.values(JARDINS)) compor(espiao as unknown as Canteiro);
  return usados;
}

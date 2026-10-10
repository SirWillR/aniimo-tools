// Decoração da planta por terrenos, com itens reais do jogo (catálogo em lar-enfeites.json). Só enfeite:
// nunca ocupa espaço de construção nem de pátio, e não muda a posição de nada. Três partes:
// - ruas: meio tile de calçada na borda de cada terreno, que junto com a do vizinho forma uma rua de um
//   tile ligando todos os terrenos (pedido do usuário: os terrenos não podem parecer ilhas soltas);
// - terrenos produtivos: vinhetas do tema no espaço que sobra (feno e girassóis no cultivo, lenha e
//   vasos junto às máquinas, carrinhos e pedras nas minas, flores e ninhos nas moradias);
// - terrenos sem construção: viram jardins. Dois terrenos livres lado a lado se unem num jardim grande,
//   sem rua no meio (pedido do usuário); os demais ficam com um dos quatro tipos (praça, lago, pomar,
//   lazer dos Aniimo). Os caminhos de cada jardim vão até a borda, onde encontram a rua.
// O controle "Eficiente ↔ Bonito" muda a densidade. Aleatória mas determinística (RNG com semente).
// TS puro.
import { type Retangulo, contem, expandir, sobrepoe, uniao } from './geometria';
import type { Enfeite, UsoEnfeite } from './modelos-lar';
import type { Bloco, ItemMapa, TerrenoDaPlanta, TipoBloco } from './planta';

export type Equilibrio = 'eficiente' | 'equilibrado' | 'bonito';
export const EQUILIBRIOS: readonly Equilibrio[] = ['eficiente', 'equilibrado', 'bonito'];

/** Tipos de terreno decorativo. `jardinagem` é o jardim grande, que ocupa dois terrenos vizinhos. */
export type TipoJardim = 'praca' | 'lago' | 'pomar' | 'lazer' | 'jardinagem';

/** Largura da calçada na borda de cada terreno, em tiles (duas calçadas vizinhas fazem a rua). */
export const CALCADA = 0.5;

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
  /** Calçadas na borda dos terrenos em uso. Existem mesmo sem enfeites. */
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

/** Peças de chão (podem passar por cima da calçada, para o caminho do jardim chegar à rua) e a cerca, que fica na borda. */
const SOBRE_A_CALCADA = new Set(['cascalho-chao', 'laje', 'cerca-jardim']);

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
  readonly area: Retangulo;

  constructor(
    private readonly terrenos: readonly TerrenoDaPlanta[],
    private readonly porSlug: ReadonlyMap<string, Enfeite>,
    readonly aleatorio: () => number,
    /** Construções e pátios (com meio tile de respiro em volta das construções). */
    private readonly estrutura: readonly Retangulo[],
    /** Calçadas: só chão e cerca podem ficar em cima. */
    private readonly calcadas: readonly Retangulo[],
  ) {
    this.area = uniao(terrenos.map((t) => t.area));
    this.ocupado = [...estrutura];
  }

  private global(x: number, y: number, largura: number, altura: number): Retangulo {
    return { x: this.area.x + x, y: this.area.y + y, largura, altura };
  }

  private cabe(e: Enfeite, r: Retangulo): boolean {
    if (!contem(this.area, r) || this.ocupado.some((o) => sobrepoe(o, r))) return false;
    return SOBRE_A_CALCADA.has(e.forma) || !this.calcadas.some((c) => sobrepoe(c, r));
  }

  /** Encostado numa construção ou pátio (a até um tile). */
  private junto(r: Retangulo): boolean {
    const perto = expandir(r, 1);
    return this.estrutura.some((o) => sobrepoe(o, perto));
  }

  /** Põe o enfeite se ele existir no catálogo e couber. `giro` 90 troca largura e altura. */
  por(slug: string, x: number, y: number, giro: 0 | 90 = 0, soJunto = false): boolean {
    const e = this.porSlug.get(slug);
    if (!e) return false;
    const [largura, altura] = giro ? [e.altura, e.largura] : [e.largura, e.altura];
    const area = this.global(x, y, largura, altura);
    if (!this.cabe(e, area) || (soJunto && !this.junto(area))) return false;
    this.ocupado.push(area);
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
  espelhar(slug: string, x: number, y: number, vertical = false): void {
    const e = this.porSlug.get(slug);
    if (!e) return;
    const xs = [x, this.area.largura - x - e.largura];
    const ys = vertical ? [y, this.area.altura - y - e.altura] : [y];
    for (const py of ys) for (const px of xs) this.por(slug, px, py);
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

  /** Uma faixa de chão (peças de `slug`) de (x, y) até cobrir `largura` × `altura`. */
  chao(slug: string, x: number, y: number, largura: number, altura: number): void {
    const e = this.porSlug.get(slug);
    if (!e) return;
    for (let py = y; py + e.altura <= y + altura + 1e-9; py += e.altura)
      for (let px = x; px + e.largura <= x + largura + 1e-9; px += e.largura) this.por(slug, px, py);
  }
}

// ---- composições dos jardins (terreno de 20×15; o jardim grande tem 40×15) ----
// Todo jardim tem um caminho que cruza o terreno de lado a lado e outro de cima a baixo, até a rua.

const JARDINS: Readonly<Record<TipoJardim, (c: Canteiro) => void>> = {
  /** Praça de laje com a fonte no meio, estátuas, bancos e postes; canteiros em volta e árvores floridas nos cantos. */
  praca(c) {
    c.por('spinning-fountain', 9, 6.5);
    c.chao('flagstone-pavement', 6, 3.5, 8, 8);
    c.chao('flagstone-pavement', 0, 6.5, 6, 2);
    c.chao('flagstone-pavement', 14, 6.5, 6, 2);
    c.chao('flagstone-pavement', 9, 1.5, 2, 2);
    c.chao('flagstone-pavement', 9, 11.5, 2, 2);
    c.espelhar('stone-carved-figure', 5, 3, true);
    c.espelhar('retro-streetlamp', 5, 5.5, true);
    c.espelhar('solid-wood-low-stool', 4, 5, true);
    c.espelhar('golden-trumpet-tree', 0.5, 0.5, true);
    c.espelhar('wisteria', 3, 0.5, true);
    c.espelhar('floral-arch', 1, 5.5);
    c.espelhar('floral-arch', 1, 8.5);
    c.espelhar('box-hedge', 6, 2.5, true);
    for (let x = 6; x < 9; x++) c.espelhar(x % 2 ? 'red-rose' : 'endless-summer', x, 1.5, true);
  },
  /** Lago largo com roda-d'água numa ponta e ponte na outra; do lado da ponte, acampamento com mesa, sombrinha e fogueira. */
  lago(c) {
    c.por('wooden-waterwheel', 0.5, 6.5);
    c.por('curved-pond', 2.5, 6);
    c.por('curved-pond', 6.5, 6);
    c.por('stone-bridge', 10.5, 6.5);
    c.chao('gravel-path', 13.5, 6.5, 6.5, 2);
    c.chao('gravel-path', 13.5, 0.5, 2, 6);
    c.chao('gravel-path', 13.5, 8.5, 2, 6.5);
    c.por('camping-canopy', 16, 2);
    c.por('bonfire', 11.5, 4);
    c.por('solid-wood-low-stool', 10.5, 4);
    c.por('solid-wood-low-stool', 12.5, 5);
    c.por('grassland-dining-table', 16, 9.5);
    c.por('sun-umbrella', 17.5, 12);
    c.por('glowstone-lamp-i', 10, 5.5);
    c.por('glowstone-lamp-i', 10, 9);
    for (const y of [0.5, 12.5]) {
      c.por('willow', 0.5, y);
      c.por('oak', 4, y);
      c.por('pine-tree', 7.5, y);
      c.por('pine-tree', 10.5, y);
    }
    c.por('oak', 15.5, 12);
  },
  /** Pomar em fileiras com um gazebo na clareira do meio; portão e treliças na entrada. */
  pomar(c) {
    c.por('gazebo', 8, 5.5);
    c.chao('gravel-path', 0, 6.5, 8, 2);
    c.chao('gravel-path', 12, 6.5, 8, 2);
    c.chao('gravel-path', 9, 1.5, 2, 4);
    c.chao('gravel-path', 9, 9.5, 2, 4);
    c.espelhar('garden-gate', 0.5, 5.5);
    c.espelhar('puffby-flower-trellis', 3, 5.5);
    c.espelhar('puffby-flower-trellis', 3, 8.5);
    const arvores = ['cherry-tree', 'apple-tree', 'maple-tree'];
    [0.5, 4, 7].forEach((x, i) => {
      c.espelhar(arvores[i]!, x, 0.5, true);
      c.espelhar(arvores[(i + 1) % 3]!, x, 3, true);
    });
    c.espelhar('mushroom-light', 7, 5.5, true);
  },
  /** Parquinho dos Aniimo: escalada, balanços e tocas em volta de um cruzamento de cascalho. */
  lazer(c) {
    c.chao('gravel-path', 0, 6.5, 20, 2);
    c.chao('gravel-path', 9, 0.5, 2, 6);
    c.chao('gravel-path', 9, 8.5, 2, 6);
    c.por('aniimo-climbing-frame', 4, 2.5);
    c.por('playful-adventure-den', 13, 2.5);
    c.por('pawprint-swing', 5, 10);
    c.por('pawprint-swing', 13.5, 10);
    c.espelhar('cozy-bear-den', 1, 10.5);
    c.por('sun-umbrella', 1.5, 3);
    c.por('pond', 16.5, 3);
    c.por('bonfire', 7.5, 11.5);
    c.espelhar('garden-gate', 0.5, 5.5);
    c.espelhar('coconut-tree', 0.5, 0.5, true);
    c.espelhar('balloon', 8, 5.5, true);
    c.espelhar('mushroom-light', 3, 5.5, true);
  },
  /**
   * Jardim grande em dois terrenos (40×15): alameda de cascalho de ponta a ponta com arcos floridos, gazebo
   * no meio, canteiros de flores com cerca viva, lagos e fontes, e árvores floridas nas bordas.
   */
  jardinagem(c) {
    c.por('gazebo', 18, 5.5);
    c.chao('gravel-path', 0, 6.5, 40, 2);
    c.chao('gravel-path', 19, 1.5, 2, 4);
    c.chao('gravel-path', 19, 9.5, 2, 4);
    c.espelhar('garden-gate', 0.5, 5.5);
    for (const x of [4, 8, 12]) {
      c.espelhar('floral-arch', x, 5.5);
      c.espelhar('floral-arch', x, 8.5);
    }
    // Canteiros: 4×2 flores de uma espécie, com cerca viva do lado de fora.
    const flores = ['red-rose', 'endless-summer', 'pink-tulip', 'sunflower'];
    [4, 9].forEach((bx, i) => {
      for (let dx = 0; dx < 4; dx++)
        for (let dy = 0; dy < 2; dy++) {
          c.espelhar(flores[i]!, bx + dx, 3 + dy);
          c.espelhar(flores[i + 2]!, bx + dx, 10 + dy);
        }
      for (const dx of [0, 2]) c.espelhar('box-hedge', bx + dx, 2, true);
    });
    c.espelhar('curved-pond', 14, 2.5);
    c.espelhar('spinning-fountain', 15, 10);
    c.espelhar('stone-carved-figure', 14, 10.5);
    c.espelhar('solid-wood-low-stool', 17, 10.5);
    c.espelhar('retro-streetlamp', 17, 5.5, true);
    c.espelhar('retro-streetlamp', 2.5, 5.5, true);
    c.espelhar('cherry-tree', 0.5, 0.5, true);
    c.espelhar('wisteria', 1, 3);
    c.espelhar('wisteria', 1, 10);
    c.espelhar('golden-trumpet-tree', 6.5, 0.5);
    c.espelhar('golden-trumpet-tree', 6.5, 12.5);
    c.espelhar('cherry-tree', 15.5, 12.5);
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

/** Calçadas na borda de cada terreno em uso; os dois terrenos de um jardim grande não têm calçada entre si. */
function tracarRuas(terrenos: readonly TerrenoDaPlanta[], jardins: readonly Jardim[], emUso: (t: TerrenoDaPlanta) => boolean): Rua[] {
  const ruas: Rua[] = [];
  for (const t of terrenos.filter(emUso)) {
    const { x, y, largura, altura } = t.area;
    const grupo = jardins.find((j) => j.terrenos.includes(t.n))?.terrenos ?? [];
    const unido = (coluna: number) => terrenos.some((o) => o !== t && grupo.includes(o.n) && o.linha === t.linha && o.coluna === coluna);
    ruas.push({ tipo: 'caminho', area: { x, y, largura, altura: CALCADA } }, { tipo: 'caminho', area: { x, y: y + altura - CALCADA, largura, altura: CALCADA } });
    if (!unido(t.coluna - 1)) ruas.push({ tipo: 'caminho', area: { x, y, largura: CALCADA, altura } });
    if (!unido(t.coluna + 1)) ruas.push({ tipo: 'caminho', area: { x: x + largura - CALCADA, y, largura: CALCADA, altura } });
  }
  return ruas;
}

/** Cerca de jardim no contorno do terreno (só em "Bonito", nos terrenos cercados), com um vão de portão em cima. */
function cercar(c: Canteiro): void {
  const { largura, altura } = c.area;
  for (let x = 0; x + 2 <= largura; x += 2) {
    if (Math.abs(x + 1 - largura / 2) > 1.5) c.por('garden-fence', x, 0);
    c.por('garden-fence', x, altura - 0.5);
  }
  for (let y = 0.5; y + 2 <= altura - 0.5; y += 2) {
    c.por('garden-fence', 0, y, 90);
    c.por('garden-fence', largura - 0.5, y, 90);
  }
}

export function decorar(e: EntradaDecoracao): ResultadoDecoracao {
  const densidade = DENSIDADE[e.equilibrio];
  const decorando = densidade > 0 && e.enfeites.length > 0;
  const jardins = decorando ? escolherJardins(e) : [];
  const noJardim = new Set(jardins.flatMap((j) => j.terrenos));
  const ruas = tracarRuas(e.terrenos, jardins, (t) => t.rv <= e.rv && (!!t.tema || noJardim.has(t.n)));
  if (!decorando) return { itens: [], ruas, jardins };

  const porSlug = new Map(e.enfeites.map((x) => [x.slug, x]));
  const calcadas = ruas.map((r) => r.area);
  const itens: Decoracao[] = [];
  const semente = (n: number) => rng(e.semente * 7919 + n * 131 + 17);

  for (const jardim of jardins) {
    const c = new Canteiro(e.terrenos.filter((t) => jardim.terrenos.includes(t.n)), porSlug, semente(jardim.terrenos[0]!), [], calcadas);
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
    const cerca = new Canteiro([terreno], porSlug, aleatorio, doTerreno.filter((i) => i.tipo === 'construcao').map((i) => i.area), calcadas);
    if (e.equilibrio === 'bonito' && bloco.cercado) cercar(cerca);
    const c = new Canteiro([terreno], porSlug, aleatorio, [...estrutura, ...cerca.itens.map((i) => i.area)], calcadas);
    // Um poste em cada canto, na beira da rua.
    c.espelhar('retro-streetlamp', CALCADA, CALCADA, true);
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
  const espiao = { por: (s: string) => (usados.add(s), true), espelhar: (s: string) => usados.add(s), chao: (s: string) => usados.add(s) };
  for (const compor of Object.values(JARDINS)) compor(espiao as unknown as Canteiro);
  return usados;
}

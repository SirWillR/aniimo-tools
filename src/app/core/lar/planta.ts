// Compõe a planta do Lar para um RV, distribuída nos terrenos do jogo (16 terrenos de 20×15 tiles, um
// por nível): cada terreno ganha um tema (cultivo, oficina, recursos, moradias, ninhal) e o que libera
// no RV n só vai para terrenos que já existem nesse nível. Assim a base final cresce sem que o jogador
// tenha de mudar nada de lugar. Determinístico: o mesmo RV e os mesmos dados dão sempre a mesma planta.
// TS puro.
import { montarAmbientes } from './ambientes';
import { type Equilibrio, type TipoJardim, decorar } from './decoracao';
import { type ConstrucaoAmbiente, TAMANHO_LOTE, melhorMalha } from './empacotamento';
import { type Retangulo, cobertura, expandir, quadrado, sobrepoe, transladar, uniao } from './geometria';
import { type Inventario, inventario } from './inventario';
import { rearranjar } from './rearranjo';
import { rvDoProduto } from './liberacao';
import type { Ambiente, Construcao, DadosConstrucao, Enfeite, Produto, RegrasAmbiente } from './modelos-lar';
import { type Sugestoes, type TipoLote, culturasPara, familia, repartir, sugestoes } from './sugestao';
import { ALTURA_TABULEIRO, ALTURA_TERRENO, LARGURA_TABULEIRO, LARGURA_TERRENO, TERRENOS, type Terreno, areaDoTerreno, terreno } from './terrenos';

/**
 * Faixa livre na borda de cada terreno, em tiles: meio tile de calçada (a rua que liga os terrenos, ver
 * decoracao.ts) mais meio tile para o pátio de uma construção.
 */
export const MARGEM = 1;

/**
 * Passagem máxima entre as construções de cada tema, em tiles. A oficina fica com os 2 tiles aprovados
 * pelo usuário; Minas e moradias (5×5) só cabem três por fileira com 1.
 */
const FOLGA_DO_TEMA: Readonly<Record<TipoBloco, number>> = { cultivo: 2, oficina: 2, recursos: 1, moradias: 1, ninhal: 1 };

export type ItemMapa =
  | { tipo: 'caminho'; area: Retangulo }
  | { tipo: 'trilha'; area: Retangulo }
  | { tipo: 'piso'; area: Retangulo }
  | { tipo: 'cerca'; area: Retangulo; portao: Retangulo | null }
  | { tipo: 'cobertura'; area: Retangulo; modo: Ambiente; construcao: string }
  | {
      tipo: 'construcao';
      area: Retangulo;
      construcao: string;
      nivel: number;
      estimado: boolean;
      /** Condição de cultivo do lote (Fazenda/Bosque) ou modo da construção de ambiente. */
      condicao: Ambiente | null;
      cultura: Produto | null;
      /** Índice em {@link PlantaLar.blocos} e número do terreno onde a construção fica. */
      bloco: number;
      terreno: number;
      /** Fazenda coringa: sem cultura fixa, reservada para sementes de evento. */
      coringa?: true;
      /**
       * Cultura fora da sua temperatura (a zona certa não cabe neste nível): fração da velocidade normal
       * (0,8 a um passo de temperatura, 0,5 a dois, 0,2 a três ou mais). Ausente = na temperatura certa.
       */
      eficiencia?: number;
    }
  | {
      tipo: 'decoracao';
      area: Retangulo;
      /** Nosso desenho (`<symbol id="ml-...">`), a variante de cor (0 a 3) e a cor fixa, se o item tiver. */
      forma: string;
      variante: number;
      cor?: string;
      /** Id do item no catálogo de enfeites, o terreno onde fica e o RV em que a loja o libera. */
      enfeite: string;
      terreno: number;
      rv: number;
      /** Girado 90° (a área já vem com largura e altura trocadas). */
      giro?: 90;
    };

export type TipoBloco = 'cultivo' | 'oficina' | 'recursos' | 'moradias' | 'ninhal';

/**
 * Chocadeira de ovos de Aniimo. Fora do aniimax e da wiki; informado pelo usuário: ocupa o mesmo espaço
 * de uma Fazenda (2×2) e nenhum Aniimo trabalha nela. A quantidade por RV não é conhecida, por isso vem
 * de {@link OpcoesPlanta}.
 */
export const CHOCADEIRA = { chave: 'chocadeira', tamanho: 2 } as const;

/**
 * Unidade de armazenamento: para onde os Aniimo (Transporte) levam o que é produzido. Fora do aniimax e
 * da wiki; informado pelo usuário: 2×2. Ficam espalhadas, uma por terreno produtivo antes de repetir. A
 * quantidade por RV não é conhecida, por isso vem de {@link OpcoesPlanta}.
 */
export const ARMAZEM = { chave: 'armazem', tamanho: 2 } as const;

export interface OpcoesPlanta {
  /**
   * Culturas que o jogador quer cultivar (famílias, ex.: `strawberry` vale também para `quick_strawberry`).
   * Sem o campo, todas. Não muda a disposição (ela é sempre montada com todas as culturas, para o
   * jogador não ter de reconstruir ao trocar a escolha): só os modos dos ambientes e a cultura de cada lote.
   */
  culturas?: readonly string[];
  /** Só culturas (e variantes) que já dá para plantar neste RV. Sem o campo, as do RV da planta. */
  rvCulturas?: number;
  /**
   * Fazendas coringa: quantas Fazendas ficam sem cultura fixa, para sementes de evento. Não mudam a
   * disposição; saem primeiro dos lotes sem ambiente (a semente pode pedir qualquer coisa).
   */
  coringas?: number;
  /** Quantas chocadeiras o jogador tem (padrão 0). */
  chocadeiras?: number;
  /** Quantas unidades de armazenamento (padrão 0). */
  armazens?: number;
  /**
   * Catálogo de itens decorativos e o quanto decorar (padrão `equilibrado`). Sem catálogo, ou em
   * `eficiente`, a planta sai sem enfeites e os terrenos livres ficam vazios. Não muda as construções.
   */
  enfeites?: readonly Enfeite[];
  equilibrio?: Equilibrio;
}

/** A parte temática de um terreno. Cada terreno com tema tem um bloco, que ocupa o terreno inteiro. */
export interface Bloco {
  tipo: TipoBloco;
  area: Retangulo;
  cercado: boolean;
  /** Número do terreno. */
  terreno: number;
  /**
   * Só nos blocos `cultivo`: a sub-região onde os lotes se movem (uma malha de 2 tiles dentro do
   * terreno). Não muda com RV nem com culturas.
   */
  regioes?: Retangulo[];
}

export interface TerrenoDaPlanta extends Terreno {
  area: Retangulo;
  /** `jardim` = terreno só decorativo; null = sem nada planejado. */
  tema: TipoBloco | 'jardim' | null;
  /** O tipo do jardim, quando o tema é `jardim`, e o terreno vizinho com que ele forma um jardim grande. */
  jardim?: TipoJardim;
  unidoA?: number;
}

export interface PlantaLar {
  rv: number;
  verificado: boolean;
  largura: number;
  altura: number;
  /** Os 16 terrenos do tabuleiro; os de `rv` maior que o do jogador ainda estão fechados. */
  terrenos: TerrenoDaPlanta[];
  blocos: Bloco[];
  itens: ItemMapa[];
}

type ItemConstrucao = Extract<ItemMapa, { tipo: 'construcao' }>;

interface Unidade {
  chave: string;
  lado: number;
  nivel: number;
  estimado: boolean;
  tema: TipoBloco;
  /** RV em que esta unidade libera (a k-ésima da sua construção). */
  rv: number;
}

/** Construções de ambiente que ficam juntas: o par Fornalha + Resfriador, ou uma avulsa. */
interface GrupoAmbiente {
  unidades: Unidade[];
  rv: number;
}

interface Vaga {
  terreno: Terreno;
  tema: TipoBloco;
  unidades: Unidade[];
  /** Só no cultivo: os grupos de ambiente do terreno e quantas metades (de duas) eles ocupam. */
  grupos: GrupoAmbiente[];
  metades: number;
}

const eLote = (chave: string): chave is TipoLote => chave === 'farmland' || chave === 'woodland';

/**
 * Quantas construções de ambiente a planta usa, no máximo. O jogo permite mais (3 de cada no RV 20), mas
 * um par Forno de Calor + Resfriador, mais um Forno de Calor e uma Lâmpada Solar avulsos, já dão as
 * cinco condições de cultivo para todas as Fazendas e Bosques; cada ambiente a mais ocuparia meio
 * terreno sem render mais nada.
 */
export const AMBIENTES_NA_PLANTA: Readonly<Record<string, number>> = { 'heat-furnace': 2, 'cooling-unit': 1, 'sunlamp': 1 };

/** O inventário do RV com os ambientes limitados ao que a planta usa. */
function inventarioDaPlanta(dados: DadosConstrucao, rv: number): Inventario {
  const inv = inventario(dados, rv);
  const itens = inv.itens.map((it) => ({ ...it, quantidade: Math.min(it.quantidade, AMBIENTES_NA_PLANTA[it.construcao.chave] ?? Infinity) }));
  return { ...inv, itens };
}

function temaDe(c: Construcao, regras: RegrasAmbiente): TipoBloco {
  if (eLote(c.chave) || regras.construcoes[c.chave]) return 'cultivo';
  if (c.categoria === 'processamento') return 'oficina';
  return c.categoria === 'materiais-aniimo' ? 'moradias' : 'recursos';
}

/** Uma entrada por unidade construída, com o RV em que ela libera. */
function unidadesDe(inv: Inventario, regras: RegrasAmbiente): Unidade[] {
  return inv.itens.flatMap((it) =>
    Array.from({ length: it.quantidade }, (_, k) => ({
      chave: it.construcao.chave,
      lado: it.construcao.tamanho,
      nivel: it.nivel,
      estimado: it.construcao.tamanhoEstimado,
      tema: temaDe(it.construcao, regras),
      rv: it.construcao.quantidadePorRv.findIndex((q) => q >= k + 1) + 1,
    })),
  );
}

const mover = <T extends ItemMapa>(i: T, dx: number, dy: number): T => ({ ...i, area: transladar(i.area, dx, dy) });

/** Um pátio de lajotas (piso) meio tile em volta de cada construção, em vez de um piso único no terreno. */
function comPatios(itens: readonly ItemMapa[]): ItemMapa[] {
  const patios: ItemMapa[] = itens.filter((i) => i.tipo === 'construcao').map((i) => ({ tipo: 'piso', area: expandir(i.area, 0.5) }));
  return [...patios, ...itens];
}

/**
 * Arruma as unidades de um tema dentro de um terreno: maiores primeiro, lado a lado em fileiras
 * centradas, com `folga` tiles de passagem. Oficina e moradias ganham pátios; na oficina, com folga
 * para isso, as fileiras ficam desencontradas (pedido do usuário). Devolve null se não couber. A rede
 * elétrica (Gerador de Estalos e Postes) fica por conta do jogador: não entra no mapa.
 */
function arrumar(tema: TipoBloco, unidades: readonly Unidade[], folgaGeral: number): ItemMapa[] | null {
  const folga = Math.min(folgaGeral, FOLGA_DO_TEMA[tema]);
  const largura = LARGURA_TERRENO - 2 * MARGEM;
  const altura = ALTURA_TERRENO - 2 * MARGEM;
  const ordem = [...unidades].sort((a, b) => b.lado - a.lado || a.chave.localeCompare(b.chave));
  const fileiras: { unidades: Unidade[]; largura: number; altura: number }[] = [];
  for (const u of ordem) {
    const f = fileiras.at(-1);
    if (f && f.largura + folga + u.lado <= largura) {
      f.unidades.push(u);
      f.largura += folga + u.lado;
    } else fileiras.push({ unidades: [u], largura: u.lado, altura: u.lado });
  }
  const total = fileiras.reduce((s, f) => s + f.altura, 0) + folga * (fileiras.length - 1);
  if (total > altura || fileiras.some((f) => f.largura > largura)) return null;

  const desencontrar = tema === 'oficina' && folga >= 2;
  const itens: ItemConstrucao[] = [];
  // Centrado no terreno; as posições caem em meio tile (a grade do jogo é de ¼ de tile).
  let y = MARGEM + (altura - total) / 2;
  fileiras.forEach((f, i) => {
    const sobra = largura - f.largura;
    // Fileiras ímpares deslocadas, quando há sobra para isso.
    const desvio = desencontrar && sobra >= 2 * folga ? (i % 2 ? 1 : -1) * Math.floor(folga / 2) : 0;
    let x = MARGEM + sobra / 2 + desvio;
    for (const u of f.unidades) {
      itens.push({ tipo: 'construcao', area: quadrado(x, y, u.lado), construcao: u.chave, nivel: u.nivel, estimado: u.estimado, condicao: null, cultura: null, bloco: -1, terreno: 0 });
      x += u.lado + folga;
    }
    y += f.altura + folga;
  });
  return tema === 'oficina' || tema === 'moradias' ? comPatios(itens) : itens;
}

/** Células da malha de 2 tiles que as Fazendas e os Bosques de um RV ocupam (o Bosque vale 4). */
function celulasDeCultivo(dados: DadosConstrucao, rv: number): number {
  const qtd = (chave: string) => dados.construcoes.find((c) => c.chave === chave)?.quantidadePorRv[rv - 1] ?? 0;
  return qtd('farmland') + 4 * qtd('woodland');
}

/**
 * Distribui o que cada RV libera pelos terrenos que já existem nesse RV. Cada tema enche o seu terreno
 * e só então abre outro (o de número mais baixo ainda sem tema). No cultivo, o primeiro terreno fica sem
 * ambiente (é onde se planta antes de ter Fornalha); cada grupo de ambiente vai para outro terreno de
 * cultivo, o par ocupando o terreno inteiro e as avulsas meio terreno cada. Devolve null se algum RV
 * ficar sem terreno para o que libera.
 */
function distribuir(dados: DadosConstrucao, inv: Inventario, chocadeiras: number, folga: number, capacidade: number): Vaga[] | null {
  const regras = dados.regras;
  const abertos = TERRENOS.filter((t) => t.rv <= inv.rv);
  const vagas: Vaga[] = [];
  const abrir = (tema: TipoBloco, rv: number): Vaga | undefined => {
    const t = abertos.find((x) => x.rv <= rv && !vagas.some((v) => v.terreno === x));
    if (!t) return undefined;
    const vaga: Vaga = { terreno: t, tema, unidades: [], grupos: [], metades: 0 };
    vagas.push(vaga);
    return vaga;
  };

  const unidades = unidadesDe(inv, regras);
  const ambientes = unidades.filter((u) => regras.construcoes[u.chave]);
  const fornalha = ambientes.find((u) => u.chave === 'heat-furnace');
  const resfriador = ambientes.find((u) => u.chave === 'cooling-unit');
  const par = fornalha && resfriador ? [fornalha, resfriador] : [];
  const grupos: GrupoAmbiente[] = [
    ...(par.length ? [{ unidades: par, rv: Math.max(...par.map((u) => u.rv)) }] : []),
    ...ambientes.filter((u) => !par.includes(u)).map((u) => ({ unidades: [u], rv: u.rv })),
  ];
  const ordemDosTemas: readonly TipoBloco[] = ['oficina', 'recursos', 'moradias'];

  for (let rv = 1; rv <= inv.rv; rv++) {
    const cultivos = () => vagas.filter((v) => v.tema === 'cultivo');
    for (const g of grupos.filter((x) => x.rv === rv)) {
      const cabe = (v: Vaga) => 2 - v.metades >= g.unidades.length;
      const vaga = cultivos().slice(1).find(cabe) ?? (cultivos().length ? abrir('cultivo', rv) : undefined) ?? cultivos().find(cabe) ?? abrir('cultivo', rv);
      if (!vaga) return null;
      vaga.grupos.push(g);
      vaga.metades += g.unidades.length;
    }
    while (celulasDeCultivo(dados, rv) > capacidade * cultivos().length) if (!abrir('cultivo', rv)) return null;

    const novas = unidades
      .filter((u) => u.rv === rv && u.tema !== 'cultivo')
      .sort((a, b) => ordemDosTemas.indexOf(a.tema) - ordemDosTemas.indexOf(b.tema) || b.lado - a.lado || a.chave.localeCompare(b.chave));
    for (const u of novas) {
      const cabe = (v: Vaga) => v.tema === u.tema && arrumar(u.tema, [...v.unidades, u], folga) !== null;
      const vaga = vagas.find(cabe) ?? abrir(u.tema, rv);
      if (!vaga || !cabe(vaga)) return null;
      vaga.unidades.push(u);
    }
  }

  // Chocadeiras: a quantidade por RV não é conhecida; ficam num terreno ainda sem tema.
  for (let k = 0; k < chocadeiras; k++) {
    const u: Unidade = { chave: CHOCADEIRA.chave, lado: CHOCADEIRA.tamanho, nivel: 1, estimado: false, tema: 'ninhal', rv: 1 };
    const cabe = (v: Vaga) => v.tema === 'ninhal' && arrumar('ninhal', [...v.unidades, u], folga) !== null;
    const vaga = vagas.find(cabe) ?? abrir('ninhal', inv.rv);
    if (!vaga || !cabe(vaga)) return null;
    vaga.unidades.push(u);
  }
  return vagas.sort((a, b) => a.terreno.n - b.terreno.n);
}

const meio = (v: number) => Math.round(v * 2) / 2;

/** Posiciona os ambientes de um terreno de cultivo, com as coberturas inteiras dentro dele. */
function ambientesDoTerreno(vaga: Vaga, area: Retangulo, parBase: readonly ConstrucaoAmbiente[], regras: RegrasAmbiente): ConstrucaoAmbiente[] {
  const saida: ConstrucaoAmbiente[] = [];
  let metade = 0;
  for (const g of vaga.grupos) {
    if (g.unidades.length === 2) {
      // O par vem com a distância e os modos escolhidos na montagem da base; fica centrado no terreno.
      const coberto = uniao(parBase.map((a) => cobertura(a.area, regras.raioCobertura)));
      const dx = area.x + meio((area.largura - coberto.largura) / 2) - coberto.x;
      const dy = area.y + meio((area.altura - coberto.altura) / 2) - coberto.y;
      saida.push(...parBase.map((a) => ({ ...a, area: transladar(a.area, dx, dy) })));
      metade = 2;
    } else {
      const u = g.unidades[0]!;
      const cx = area.x + (metade ? 14.5 : 5.5);
      saida.push({ chave: u.chave, area: quadrado(cx - u.lado / 2, area.y + 7.5 - u.lado / 2, u.lado), modo: regras.construcoes[u.chave]!.modos[0]! });
      metade++;
    }
  }
  return saida;
}

/**
 * Sub-região onde os lotes de um terreno de cultivo se movem: a malha de 2 tiles começa no canto dela,
 * a pelo menos meio tile da borda do terreno, alinhada para as zonas dos ambientes renderem mais.
 */
function regiaoDeCultivo(area: Retangulo, ambientes: readonly ConstrucaoAmbiente[], sug: Sugestoes, regras: RegrasAmbiente): Retangulo {
  const { ox, oy } = ambientes.length ? melhorMalha(ambientes, sug, regras) : { ox: 1, oy: 0.5 };
  const alinhar = (inicio: number, desloc: number) => [0.5, 1, 1.5, 2].map((d) => inicio + d).find((v) => Math.abs((((v - desloc) % 2) + 2) % 2) < 1e-9)!;
  const x = alinhar(area.x, ox);
  const y = alinhar(area.y, oy);
  const caber = (fim: number, inicio: number) => Math.floor((fim - 0.5 - inicio) / 2) * 2;
  return { x, y, largura: caber(area.x + area.largura, x), altura: caber(area.y + area.altura, y) };
}

/** Espaço 2×2 para um armazém no terreno do bloco: na malha do cultivo, ou num canto livre dos outros temas. */
function vagaDeArmazem(bloco: Bloco, itens: readonly ItemMapa[]): Retangulo | undefined {
  const lado = ARMAZEM.tamanho;
  const doTerreno = itens.filter((i) => (i.tipo === 'construcao' || i.tipo === 'piso') && sobrepoe(i.area, bloco.area));
  const ocupado = doTerreno.map((i) => (i.tipo === 'construcao' && i.construcao === ARMAZEM.chave ? expandir(i.area, 1) : i.area));
  const regiao = bloco.regioes?.[0];
  const dentro = regiao ?? expandir(bloco.area, -1);
  const passo = regiao ? 2 : 1;
  // Perto do meio do que o terreno produz (no cultivo, o meio da sub-região).
  const alvos = doTerreno.filter((i) => i.tipo === 'construcao').map((i) => i.area);
  const centro = regiao || !alvos.length ? dentro : uniao(alvos);
  const cx = centro.x + centro.largura / 2;
  const cy = centro.y + centro.altura / 2;
  let melhor: { area: Retangulo; distancia: number } | undefined;
  for (let y = dentro.y; y + lado <= dentro.y + dentro.altura + 1e-9; y += passo)
    for (let x = dentro.x; x + lado <= dentro.x + dentro.largura + 1e-9; x += passo) {
      const area = quadrado(x, y, lado);
      if (ocupado.some((o) => sobrepoe(o, area))) continue;
      const distancia = Math.abs(x + lado / 2 - cx) + Math.abs(y + lado / 2 - cy);
      if (!melhor || distancia < melhor.distancia - 1e-9) melhor = { area, distancia };
    }
  return melhor?.area;
}

/** Monta blocos e itens a partir da distribuição. Devolve null se os lotes não couberem nos terrenos de cultivo. */
function montar(dados: DadosConstrucao, inv: Inventario, vagas: readonly Vaga[], folga: number, armazens: number): { blocos: Bloco[]; itens: ItemMapa[] } | null {
  const regras = dados.regras;
  const sug = sugestoes(inv.produtos);
  const qtd = (chave: string) => inv.itens.find((it) => it.construcao.chave === chave)?.quantidade ?? 0;
  const nivel = (chave: string) => inv.itens.find((it) => it.construcao.chave === chave)?.nivel ?? 0;
  const lotes: Record<TipoLote, number> = { farmland: qtd('farmland'), woodland: qtd('woodland') };
  // Distância e modos do par Fornalha + Resfriador, como sempre (Morno + Congelante, com Frio no meio).
  const parBase = montarAmbientes(inv.itens, lotes, sug, regras).aglomerados.find((a) => a.ambientes.length === 2)?.ambientes ?? [];

  const blocos: Bloco[] = [];
  const itens: ItemMapa[] = [];
  vagas.forEach((vaga, indice) => {
    const area = areaDoTerreno(vaga.terreno);
    const bloco: Bloco = { tipo: vaga.tema, area, cercado: vaga.tema === 'cultivo' || vaga.tema === 'ninhal', terreno: vaga.terreno.n };
    blocos.push(bloco);
    const construcao = (chave: string, r: Retangulo, condicao: Ambiente | null): ItemConstrucao => ({
      tipo: 'construcao', area: r, construcao: chave, nivel: nivel(chave), estimado: false, condicao, cultura: null, bloco: indice, terreno: vaga.terreno.n,
    });
    if (vaga.tema === 'cultivo') {
      const ambientes = ambientesDoTerreno(vaga, area, parBase, regras);
      for (const a of ambientes) {
        itens.push({ tipo: 'cobertura', area: cobertura(a.area, regras.raioCobertura), modo: a.modo, construcao: a.chave });
        itens.push(construcao(a.chave, a.area, a.modo));
      }
      bloco.regioes = [regiaoDeCultivo(area, ambientes, sug, regras)];
      return;
    }
    for (const i of arrumar(vaga.tema, vaga.unidades, folga)!) {
      const movido = mover(i, area.x, area.y);
      if (movido.tipo === 'construcao') Object.assign(movido, { bloco: indice, terreno: vaga.terreno.n });
      itens.push(movido);
    }
  });

  // Armazéns espalhados: um por terreno produtivo antes de repetir, começando pelos que abrem primeiro.
  // São construções: ficam onde estão quando o jogador troca as culturas.
  const produtivos = blocos.map((b, indice) => ({ b, indice })).filter((x) => x.b.tipo !== 'ninhal');
  for (let k = 0; k < armazens && produtivos.length; k++)
    for (let tentativa = 0; tentativa < produtivos.length; tentativa++) {
      const { b, indice } = produtivos[(k + tentativa) % produtivos.length]!;
      const area = vagaDeArmazem(b, itens);
      if (!area) continue;
      itens.push({ tipo: 'construcao', area, construcao: ARMAZEM.chave, nivel: 1, estimado: false, condicao: null, cultura: null, bloco: indice, terreno: b.terreno });
      break;
    }

  // Fazendas e Bosques: a posição de cada um sai do rearranjo, com todas as culturas e os modos da base.
  const primeiro = blocos.findIndex((b) => b.tipo === 'cultivo');
  if (primeiro >= 0) {
    const canto = blocos[primeiro]!.regioes![0]!;
    for (const tipo of ['woodland', 'farmland'] as const)
      for (let k = 0; k < lotes[tipo]; k++)
        itens.push({ tipo: 'construcao', area: quadrado(canto.x, canto.y, TAMANHO_LOTE[tipo]), construcao: tipo, nivel: nivel(tipo), estimado: false, condicao: null, cultura: null, bloco: primeiro, terreno: blocos[primeiro]!.terreno });
    if (!rearranjar({ itens, blocos }, dados, sug, { manterModos: true }).coube) return null;
  }
  return { blocos, itens };
}

/**
 * Reparte os lotes de cada (tipo, condição) entre as culturas escolhidas que servem ali, em faixas
 * contínuas na ordem dos blocos e de leitura, para cada cultura ganhar um trecho só.
 */
function repartirCulturas(itens: readonly ItemMapa[], sug: Sugestoes, ativos: ReadonlySet<ItemConstrucao>): void {
  const grupos = new Map<string, ItemConstrucao[]>();
  for (const item of itens) {
    if (item.tipo !== 'construcao' || (item.construcao !== 'farmland' && item.construcao !== 'woodland')) continue;
    if (item.coringa) {
      item.cultura = null;
      continue;
    }
    const k = `${item.construcao}|${item.condicao ?? ''}`;
    grupos.set(k, [...(grupos.get(k) ?? []), item]);
  }
  const leitura = (a: ItemConstrucao, b: ItemConstrucao) => a.bloco - b.bloco || a.area.y - b.area.y || a.area.x - b.area.x;
  for (const lotes of grupos.values()) {
    const { construcao, condicao } = lotes[0]!;
    const culturas = culturasPara(sug, construcao, condicao);
    // Os lotes que já produzem são repartidos primeiro, para cada cultura ter um deles; os demais depois.
    for (const parte of [lotes.filter((l) => ativos.has(l)), lotes.filter((l) => !ativos.has(l))]) {
      parte.sort(leitura);
      repartir(parte, culturas).forEach((cultura, i) => (parte[i]!.cultura = cultura));
    }
  }
}

/**
 * Cultura escolhida sem nenhum lote ativo na sua temperatura (a zona não cabe neste nível, ex.: RV 9–11
 * com uma Fornalha e um Resfriador para quatro temperaturas): vai para o lote ativo de temperatura mais
 * próxima, tirado de um grupo com lote sobrando, e cresce mais devagar (pedido do usuário: "prefiro com
 * eficiência menor do que não ter"). Culturas de Adequado só crescem sob a Lâmpada Solar e ficam de fora.
 */
function acomodarForaDoAmbiente(itens: readonly ItemMapa[], sug: Sugestoes, ativos: ReadonlySet<ItemConstrucao>, regras: RegrasAmbiente): void {
  const lotes = itens.filter((i): i is ItemConstrucao => i.tipo === 'construcao' && (i.construcao === 'farmland' || i.construcao === 'woodland'));
  for (const l of lotes) delete l.eficiencia;
  const temperatura = (a: Ambiente | null) => (a && a !== 'adequate' ? regras.temperatura[a] : 0);
  const velocidade = (passos: number) => (passos === 0 ? 1 : (regras.velocidadeFora[passos - 1] ?? 0.2));

  for (const [chave, culturas] of sug) {
    const [tipo, condicao] = chave.split('|') as [TipoLote, string];
    if (!condicao || condicao === 'adequate' || (tipo !== 'farmland' && tipo !== 'woodland')) continue;
    for (const cultura of culturas) {
      const f = familia(cultura.chave);
      if (lotes.some((l) => ativos.has(l) && l.cultura && familia(l.cultura.chave) === f)) continue;
      // Quantos lotes ativos cada cultura tem: só pode ceder quem tem mais de um (ou lote vazio).
      const porCultura = new Map<string, number>();
      for (const l of lotes) if (ativos.has(l) && l.cultura) porCultura.set(familia(l.cultura.chave), (porCultura.get(familia(l.cultura.chave)) ?? 0) + 1);
      const cede = (l: ItemConstrucao) => !l.cultura || (porCultura.get(familia(l.cultura.chave)) ?? 0) > 1;
      const hospedeiros = lotes.filter((l) => l.construcao === tipo && ativos.has(l) && !l.coringa && !l.eficiencia && l.condicao !== 'adequate' && cede(l));
      if (!hospedeiros.length) continue;
      const alvo = temperatura(condicao as Ambiente);
      const passos = (l: ItemConstrucao) => Math.abs(temperatura(l.condicao) - alvo);
      const escolhido = hospedeiros.reduce((a, b) =>
        passos(b) < passos(a) || (passos(b) === passos(a) && Number(!b.cultura) > Number(!a.cultura)) ? b : a,
      );
      escolhido.cultura = cultura;
      escolhido.eficiencia = velocidade(passos(escolhido));
    }
  }
}

/**
 * Marca as Fazendas coringa sem tirar lote de nenhuma cultura escolhida: saem primeiro das sobras dos
 * lotes sem ambiente, depois de zonas sem cultura escolhida (ficariam vazios), depois das sobras dos
 * grupos com mais lotes que culturas. Em cada faixa, primeiro os terrenos já abertos no nível do jogador
 * (`rv`; a semente de evento é para plantar agora), depois na ordem de blocos e de leitura.
 */
function marcarCoringas(itens: readonly ItemMapa[], quantidade: number, sug: Sugestoes, ativos: ReadonlySet<ItemConstrucao>, rv: number): void {
  const fazendas = itens.filter((i): i is ItemConstrucao => i.tipo === 'construcao' && i.construcao === 'farmland');
  for (const f of fazendas) delete f.coringa;
  const chave = (f: ItemConstrucao) => f.condicao ?? '';
  const livres = new Map<string, number>();
  for (const f of fazendas) livres.set(chave(f), (livres.get(chave(f)) ?? 0) + 1);
  const sobra = (f: ItemConstrucao) => livres.get(chave(f))! - culturasPara(sug, 'farmland', f.condicao).length;
  const faixa = (f: ItemConstrucao) => {
    const culturas = culturasPara(sug, 'farmland', f.condicao).length;
    if (!culturas) return 1;
    if (sobra(f) <= 0) return 9; // tiraria o lote de uma cultura
    return f.condicao === null ? 0 : 2;
  };
  const leitura = (a: ItemConstrucao, b: ItemConstrucao) => a.bloco - b.bloco || a.area.y - b.area.y || a.area.x - b.area.x;
  const fechado = (f: ItemConstrucao) => Number(terreno(f.terreno).rv > rv);
  for (let n = 0; n < quantidade; n++) {
    const candidatas = fazendas.filter((f) => !f.coringa);
    if (!candidatas.length) break;
    // Entre as sobras, as inativas (que ainda não produzem) antes das ativas.
    const escolhida = candidatas.reduce((a, b) => {
      const d = faixa(a) - faixa(b) || fechado(a) - fechado(b) || sobra(b) - sobra(a) || Number(ativos.has(a)) - Number(ativos.has(b)) || leitura(a, b);
      return d <= 0 ? a : b;
    });
    escolhida.coringa = true;
    livres.set(chave(escolhida), livres.get(chave(escolhida))! - 1);
  }
}

/** Passagem entre as construções de um terreno, da mais folgada à mais apertada, em tiles. */
const FOLGAS = [2, 1, 0];
/** Células de lote por terreno de cultivo antes de abrir outro (a malha tem de 48 a 63). */
const CAPACIDADES = [44, 36, 28];

/** Monta a planta completa de um RV. */
export function plantaDoLar(dados: DadosConstrucao, rv: number, opcoes: OpcoesPlanta = {}): PlantaLar {
  for (const campo of ['chocadeiras', 'armazens', 'coringas'] as const) {
    const n = opcoes[campo] ?? 0;
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`${campo} inválido: ${n}`);
  }
  const inv = inventarioDaPlanta(dados, rv);

  // A disposição usa sempre todas as culturas: assim ela não muda quando o jogador troca a escolha.
  // Tenta com folga; se faltar terreno em algum RV, aperta. Se os lotes não couberem, abre mais cultivo.
  let base: { vagas: Vaga[]; blocos: Bloco[]; itens: ItemMapa[] } | undefined;
  for (const folga of FOLGAS) {
    for (const capacidade of CAPACIDADES) {
      const vagas = distribuir(dados, inv, opcoes.chocadeiras ?? 0, folga, capacidade);
      if (!vagas) break;
      const montada = montar(dados, inv, vagas, folga, opcoes.armazens ?? 0);
      if (montada) {
        base = { vagas, ...montada };
        break;
      }
    }
    if (base) break;
  }
  if (!base) throw new Error(`A planta do RV ${rv} não coube nos terrenos`);
  const { vagas, blocos, itens } = base;

  // A escolha do jogador rearruma os lotes dentro dos terrenos de cultivo, os modos dos ambientes e as culturas.
  const lote = (p: Produto) => eLote(p.construcao);
  const rvCulturas = opcoes.rvCulturas;
  const escolha = sugestoes(
    rvCulturas === undefined ? inv.produtos : inv.produtos.filter((p) => !lote(p) || (rvDoProduto(p, dados) ?? Infinity) <= rvCulturas),
    opcoes.culturas ? new Set(opcoes.culturas) : undefined,
  );
  const lotesDaPlanta = itens.filter((i): i is ItemConstrucao => i.tipo === 'construcao' && eLote(i.construcao));
  const { ativos } =
    opcoes.culturas || rvCulturas !== undefined
      ? rearranjar({ itens, blocos }, dados, escolha, rvCulturas === undefined ? {} : { rv: rvCulturas })
      : { ativos: new Set(lotesDaPlanta) };
  marcarCoringas(itens, opcoes.coringas ?? 0, escolha, ativos, rvCulturas ?? rv);
  repartirCulturas(itens, escolha, ativos);
  acomodarForaDoAmbiente(itens, escolha, ativos, dados.regras);

  const terrenos: TerrenoDaPlanta[] = TERRENOS.map((t) => ({ ...t, area: areaDoTerreno(t), tema: vagas.find((v) => v.terreno === t)?.tema ?? null }));
  // Por último, a decoração: usa só o espaço que sobrou e transforma os terrenos livres em jardins.
  const decoracao = decorar({ terrenos, blocos, itens, enfeites: opcoes.enfeites ?? [], equilibrio: opcoes.equilibrio ?? 'equilibrado', rv, semente: rv });
  for (const jardim of decoracao.jardins)
    for (const n of jardim.terrenos) {
      const unidoA = jardim.terrenos.find((o) => o !== n);
      Object.assign(terrenos[n - 1]!, { tema: 'jardim', jardim: jardim.tipo, ...(unidoA ? { unidoA } : {}) });
    }
  return { rv, verificado: inv.verificado, largura: LARGURA_TABULEIRO, altura: ALTURA_TABULEIRO, terrenos, blocos, itens: [...decoracao.ruas, ...decoracao.itens, ...itens] };
}

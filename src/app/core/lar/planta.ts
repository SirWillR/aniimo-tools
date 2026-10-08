// Compõe a planta do Lar para um RV: uma área única de cultivo (Fazendas, Bosques e ambientes, em
// sub-regiões separadas por trilhas), oficina de máquinas, recursos e moradias de Aniimo, organizados em
// blocos com caminhos entre eles. Determinístico: o mesmo RV e os mesmos dados dão sempre a mesma
// planta. TS puro.
import { montarAmbientes } from './ambientes';
import { posicionarArmazens } from './armazens';
import { decorar, tracarCaminhos } from './decoracao';
import { TAMANHO_LOTE } from './empacotamento';
import { type Retangulo, cobertura, expandir, quadrado, sobrepoe, transladar, uniao } from './geometria';
import { type Inventario, type ItemInventario, inventario } from './inventario';
import { rearranjar } from './rearranjo';
import { rvDoProduto } from './liberacao';
import type { Ambiente, DadosConstrucao, Produto, RegrasAmbiente } from './modelos-lar';
import { type Sugestoes, type TipoLote, culturasPara, familia, repartir, sugestoes } from './sugestao';

/** Margem em volta de cada bloco (onde fica a cerca), largura dos caminhos e borda do mapa, em tiles. */
export const MARGEM = 1;
export const CAMINHO = 2;
export const BORDA = 3;
/** Largura das trilhas entre as sub-regiões da área de cultivo, em tiles. */
export const TRILHA = 1;

export type FormaDecoracao =
  | 'arvore' | 'arbusto' | 'flores' | 'pedra' | 'poste' | 'banco' | 'canteiro'
  // cultivo
  | 'espantalho' | 'feno' | 'bebedouro' | 'carrinho-mao'
  // oficina
  | 'caixote' | 'barril' | 'sacos' | 'vaso' | 'lanterna'
  // minas e moradias
  | 'carrinho-minerio' | 'pedras-minerio' | 'arco-florido' | 'casinha-passaro'
  // praças e jardins
  | 'fonte' | 'lago' | 'piquenique' | 'estatua';

export type ItemMapa =
  | { tipo: 'caminho'; area: Retangulo }
  /** Trilha fixa dentro da área de cultivo, entre as sub-regiões. */
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
      bloco: number;
      /** Fazenda coringa: sem cultura fixa, reservada para sementes de evento. */
      coringa?: true;
      /**
       * Cultura fora da sua temperatura (a zona certa não cabe neste nível): fração da velocidade normal
       * (0,8 a um passo de temperatura, 0,5 a dois, 0,2 a três ou mais). Ausente = na temperatura certa.
       */
      eficiencia?: number;
    }
  | { tipo: 'decoracao'; area: Retangulo; forma: FormaDecoracao; variante: number };

export type TipoBloco = 'cultivo' | 'oficina' | 'recursos' | 'moradias' | 'ninhal';

/**
 * Chocadeira de ovos de Aniimo. Fora do aniimax e da wiki; informado pelo usuário: ocupa o mesmo espaço
 * de uma Fazenda (2×2) e nenhum Aniimo trabalha nela. A quantidade por RV não é conhecida, por isso vem
 * de {@link OpcoesPlanta}.
 */
export const CHOCADEIRA = { chave: 'chocadeira', tamanho: 2 } as const;

/**
 * Unidade de armazenamento: para onde os Aniimo (Transporte) levam o que é produzido. Fora do aniimax e
 * da wiki; informado pelo usuário: 2×2. Ficam espalhadas na beira dos caminhos, perto das construções
 * produtivas (ver armazens.ts). A quantidade por RV não é conhecida, por isso vem de {@link OpcoesPlanta}.
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
}

export interface Bloco {
  tipo: TipoBloco;
  /** Área do bloco já com a margem (a cerca fica na borda dela). */
  area: Retangulo;
  cercado: boolean;
  /**
   * Só no bloco `cultivo`: as sub-regiões (cada aglomerado de ambiente e os campos sem ambiente),
   * separadas por trilhas. Os lotes se movem dentro delas; elas não mudam com RV nem com culturas.
   */
  regioes?: Retangulo[];
}

export interface PlantaLar {
  rv: number;
  verificado: boolean;
  largura: number;
  altura: number;
  blocos: Bloco[];
  itens: ItemMapa[];
}

type ItemConstrucao = Extract<ItemMapa, { tipo: 'construcao' }>;
interface BlocoLocal {
  tipo: TipoBloco;
  itens: ItemMapa[];
  cercado: boolean;
  regioes?: Retangulo[];
}

/** Espalha unidades numa grade com `folga` entre elas, `colunas` por linha. */
function grade(unidades: readonly { chave: string; lado: number; nivel: number; estimado: boolean }[], colunas: number, folga: number, cultura?: (chave: string) => Produto | null): ItemConstrucao[] {
  const itens: ItemConstrucao[] = [];
  let x = 0;
  let y = 0;
  let alturaLinha = 0;
  unidades.forEach((u, i) => {
    if (i && i % colunas === 0) {
      x = 0;
      y += alturaLinha + folga;
      alturaLinha = 0;
    }
    itens.push({ tipo: 'construcao', area: quadrado(x, y, u.lado), construcao: u.chave, nivel: u.nivel, estimado: u.estimado, condicao: null, cultura: cultura?.(u.chave) ?? null, bloco: -1 });
    x += u.lado + folga;
    alturaLinha = Math.max(alturaLinha, u.lado);
  });
  return itens;
}

const unidadesDe = (itens: readonly ItemInventario[]) =>
  itens.flatMap((it) =>
    Array.from({ length: it.quantidade }, () => ({ chave: it.construcao.chave, lado: it.construcao.tamanho, nivel: it.nivel, estimado: it.construcao.tamanhoEstimado })),
  );

function montarBlocos(dados: DadosConstrucao, inv: Inventario, opcoes: OpcoesPlanta, sug: Sugestoes): BlocoLocal[] {
  const regras = dados.regras;
  const porChave = new Map(inv.itens.map((it) => [it.construcao.chave, it]));
  const nivel = (chave: string) => porChave.get(chave)?.nivel ?? 0;
  const disponiveis: Record<TipoLote, number> = {
    farmland: porChave.get('farmland')?.quantidade ?? 0,
    woodland: porChave.get('woodland')?.quantidade ?? 0,
  };
  const blocos: BlocoLocal[] = [];

  // As culturas sem ambiente escolhidas ficam com a parte proporcional dos lotes do seu tipo (senão os
  // ambientes, mais rentáveis, levariam tudo e elas não apareceriam).
  const reserva: Record<TipoLote, number> = { farmland: 0, woodland: 0 };
  for (const tipo of ['farmland', 'woodland'] as const) {
    const familias = new Set([...sug.keys()].filter((k) => k.startsWith(`${tipo}|`)).flatMap((k) => sug.get(k)!.map((p) => familia(p.chave))));
    const neutras = culturasPara(sug, tipo, null).length;
    if (neutras && familias.size) reserva[tipo] = Math.round((disponiveis[tipo] * neutras) / familias.size);
  }
  const ambientados = { farmland: disponiveis.farmland - reserva.farmland, woodland: disponiveis.woodland - reserva.woodland };
  const { aglomerados, restantes: sobras } = montarAmbientes(inv.itens, ambientados, sug, regras);
  const restantes = { farmland: sobras.farmland + reserva.farmland, woodland: sobras.woodland + reserva.woodland };
  const subareas: ItemMapa[][] = [];
  for (const ag of aglomerados) {
    const itens: ItemMapa[] = [];
    for (const a of ag.ambientes) {
      itens.push({ tipo: 'cobertura', area: cobertura(a.area, regras.raioCobertura), modo: a.modo, construcao: a.chave });
      itens.push({ tipo: 'construcao', area: a.area, construcao: a.chave, nivel: nivel(a.chave), estimado: false, condicao: a.modo, cultura: null, bloco: -1 });
    }
    for (const l of ag.lotes)
      itens.push({ tipo: 'construcao', area: l.area, construcao: l.tipo, nivel: nivel(l.tipo), estimado: false, condicao: l.condicao, cultura: l.cultura ?? null, bloco: -1 });
    subareas.push(itens);
  }

  // Lotes sem ambiente (a cultura é repartida depois, em repartirCulturas).
  const lote = (tipo: TipoLote, n: number) =>
    Array.from({ length: n }, () => ({ chave: tipo, lado: TAMANHO_LOTE[tipo], nivel: nivel(tipo), estimado: false }));
  if (restantes.farmland > 0) subareas.push(grade(lote('farmland', restantes.farmland), Math.min(6, Math.ceil(Math.sqrt(restantes.farmland * 2))), 0));
  if (restantes.woodland > 0) subareas.push(grade(lote('woodland', restantes.woodland), Math.min(4, Math.ceil(Math.sqrt(restantes.woodland))), 0));
  if (subareas.length) blocos.push({ tipo: 'cultivo', cercado: true, ...comporCultivo(subareas) });

  const categoria = (c: string) => inv.itens.filter((it) => it.construcao.categoria === c && !regras.construcoes[it.construcao.chave]);
  const colunas = (n: number) => Math.max(1, Math.ceil(Math.sqrt(n * 1.5)));
  const oficina = unidadesDe(categoria('processamento'));
  if (oficina.length) blocos.push({ tipo: 'oficina', itens: vilaDeOficinas(oficina), cercado: false });
  const recursos = unidadesDe(categoria('materiais').filter((it) => it.construcao.chave !== 'farmland' && it.construcao.chave !== 'woodland'));
  if (recursos.length) blocos.push({ tipo: 'recursos', itens: grade(recursos, colunas(recursos.length), 2), cercado: false });
  const moradias = unidadesDe(categoria('materiais-aniimo'));
  if (moradias.length) blocos.push({ tipo: 'moradias', itens: comPatios(grade(moradias, colunas(moradias.length), 2)), cercado: false });
  const chocadeiras = Array.from({ length: opcoes.chocadeiras ?? 0 }, () => ({ chave: CHOCADEIRA.chave, lado: CHOCADEIRA.tamanho, nivel: 1, estimado: false }));
  if (chocadeiras.length) blocos.push({ tipo: 'ninhal', itens: grade(chocadeiras, Math.min(4, chocadeiras.length), 1), cercado: true });
  return blocos;
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
 * grupos com mais lotes que culturas. Em cada faixa, na ordem de blocos e de leitura.
 */
function marcarCoringas(itens: readonly ItemMapa[], quantidade: number, sug: Sugestoes, ativos: ReadonlySet<ItemConstrucao>): void {
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
  for (let n = 0; n < quantidade; n++) {
    const candidatas = fazendas.filter((f) => !f.coringa);
    if (!candidatas.length) break;
    // Entre as sobras, as inativas (que ainda não produzem) antes das ativas.
    const escolhida = candidatas.reduce((a, b) => {
      const d = faixa(a) - faixa(b) || sobra(b) - sobra(a) || Number(ativos.has(a)) - Number(ativos.has(b)) || leitura(a, b);
      return d <= 0 ? a : b;
    });
    escolhida.coringa = true;
    livres.set(chave(escolhida), livres.get(chave(escolhida))! - 1);
  }
}

const areaDe = (itens: readonly ItemMapa[]) => uniao(itens.map((i) => i.area));

const mover = <T extends ItemMapa>(i: T, dx: number, dy: number): T => ({ ...i, area: transladar(i.area, dx, dy) });

/** Um pátio de lajotas (piso) meio tile em volta de cada construção, em vez de um piso único no bloco. */
function comPatios(itens: readonly ItemMapa[]): ItemMapa[] {
  const patios: ItemMapa[] = itens.filter((i) => i.tipo === 'construcao').map((i) => ({ tipo: 'piso', area: expandir(i.area, 0.5) }));
  return [...patios, ...itens];
}

type Unidade = { chave: string; lado: number; nivel: number; estimado: boolean };

/**
 * Oficina em forma de vila: máquinas maiores primeiro, lado a lado em fileiras desencontradas (as
 * fileiras ímpares começam deslocadas) com 2 tiles de passagem entre elas, cada uma no seu pátio. A rede
 * elétrica (Gerador de Estalos e Postes) fica por conta do jogador (decisão do usuário): não entra no mapa.
 */
function vilaDeOficinas(unidades: readonly Unidade[]): ItemMapa[] {
  const FOLGA = 2;
  const ordem = [...unidades].sort((a, b) => b.lado - a.lado || a.chave.localeCompare(b.chave));
  const areaTotal = ordem.reduce((s, u) => s + (u.lado + FOLGA) ** 2, 0);
  const larguraAlvo = Math.max(ordem[0]!.lado, Math.ceil(Math.sqrt(areaTotal) * 1.35));
  const maquinas: ItemConstrucao[] = [];
  let x = 0;
  let y = 0;
  let alturaFila = 0;
  let fila = 0;
  for (const u of ordem) {
    if (x > 0 && x + u.lado > larguraAlvo) {
      y += alturaFila + FOLGA;
      fila++;
      x = fila % 2 ? FOLGA : 0;
      alturaFila = 0;
    }
    maquinas.push({ tipo: 'construcao', area: quadrado(x, y, u.lado), construcao: u.chave, nivel: u.nivel, estimado: u.estimado, condicao: null, cultura: null, bloco: -1 });
    x += u.lado + FOLGA;
    alturaFila = Math.max(alturaFila, u.lado);
  }
  return comPatios(maquinas);
}

/**
 * Junta as sub-regiões de cultivo num único bloco: fileiras (maiores primeiro) com trilhas de
 * {@link TRILHA} tile entre elas. Cada sub-região ocupa o retângulo inteiro que a contém (as coberturas
 * 9×9 inclusive), então duas sub-regiões nunca se tocam e as coberturas de uma não alcançam a outra.
 */
function comporCultivo(subareas: readonly ItemMapa[][]): { itens: ItemMapa[]; regioes: Retangulo[] } {
  const partes = subareas
    .map((itens) => {
      const a = areaDe(itens);
      const dx = -Math.floor(a.x);
      const dy = -Math.floor(a.y);
      const movidos = itens.map((i) => mover(i, dx, dy));
      const b = areaDe(movidos);
      return { itens: movidos, largura: Math.ceil(b.x + b.largura), altura: Math.ceil(b.y + b.altura) };
    })
    .sort((a, b) => b.altura - a.altura || b.largura - a.largura);
  const areaTotal = partes.reduce((s, p) => s + (p.largura + TRILHA) * (p.altura + TRILHA), 0);
  const larguraAlvo = Math.max(...partes.map((p) => p.largura), Math.ceil(Math.sqrt(areaTotal) * 1.25));
  const fileiras: { partes: typeof partes; altura: number; largura: number }[] = [];
  for (const p of partes) {
    const f = fileiras.at(-1);
    if (f && f.largura + TRILHA + p.largura <= larguraAlvo) {
      f.partes.push(p);
      f.largura += TRILHA + p.largura;
      f.altura = Math.max(f.altura, p.altura);
    } else fileiras.push({ partes: [p], altura: p.altura, largura: p.largura });
  }
  const largura = Math.max(...fileiras.map((f) => f.largura));
  const itens: ItemMapa[] = [];
  const regioes: Retangulo[] = [];
  let y = 0;
  fileiras.forEach((f, i) => {
    if (i) {
      itens.push({ tipo: 'trilha', area: { x: 0, y, largura, altura: TRILHA } });
      y += TRILHA;
    }
    let x = 0;
    f.partes.forEach((p, j) => {
      if (j) {
        itens.push({ tipo: 'trilha', area: { x, y, largura: TRILHA, altura: f.altura } });
        x += TRILHA;
      }
      regioes.push({ x, y, largura: p.largura, altura: p.altura });
      for (const it of p.itens) itens.push(mover(it, x, y));
      x += p.largura;
    });
    y += f.altura;
  });
  return { itens, regioes };
}

/** Move o bloco para começar em (MARGEM, MARGEM), arredondando para tile inteiro, e mede o tamanho. */
function normalizar(b: BlocoLocal) {
  const a = areaDe(b.itens);
  const dx = MARGEM - Math.floor(a.x);
  const dy = MARGEM - Math.floor(a.y);
  const itens = b.itens.map((i) => mover(i, dx, dy));
  const regioes = b.regioes?.map((r) => transladar(r, dx, dy));
  const conteudo = areaDe(itens);
  return {
    ...b,
    itens,
    ...(regioes ? { regioes } : {}),
    largura: Math.ceil(conteudo.x + conteudo.largura) + MARGEM,
    altura: Math.ceil(conteudo.y + conteudo.altura) + MARGEM,
  };
}

/** Monta a planta completa de um RV. */
export function plantaDoLar(dados: DadosConstrucao, rv: number, opcoes: OpcoesPlanta = {}): PlantaLar {
  for (const campo of ['chocadeiras', 'armazens', 'coringas'] as const) {
    const n = opcoes[campo] ?? 0;
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`${campo} inválido: ${n}`);
  }
  const inv = inventario(dados, rv);
  // A disposição usa sempre todas as culturas: assim ela não muda quando o jogador troca a escolha.
  const locais = montarBlocos(dados, inv, opcoes, sugestoes(inv.produtos))
    .map(normalizar)
    // Ordem estável: maiores primeiro, para as fileiras ficarem equilibradas.
    .sort((a, b) => b.altura - a.altura || b.largura - a.largura);

  // Empacota em fileiras (prateleiras) com caminhos entre os blocos.
  const areaTotal = locais.reduce((s, b) => s + (b.largura + CAMINHO) * (b.altura + CAMINHO), 0);
  const larguraAlvo = Math.max(...locais.map((b) => b.largura), Math.ceil(Math.sqrt(areaTotal) * 1.3), 1);
  const fileiras: { blocos: typeof locais; altura: number; largura: number }[] = [];
  for (const b of locais) {
    const f = fileiras.at(-1);
    if (f && f.largura + CAMINHO + b.largura <= larguraAlvo) {
      f.blocos.push(b);
      f.largura += CAMINHO + b.largura;
      f.altura = Math.max(f.altura, b.altura);
    } else fileiras.push({ blocos: [b], altura: b.altura, largura: b.largura });
  }
  const larguraConteudo = Math.max(0, ...fileiras.map((f) => f.largura));

  const inicio = BORDA + CAMINHO;
  const blocos: Bloco[] = [];
  const itens: ItemMapa[] = [];
  let y = inicio;
  for (const f of fileiras) {
    // Centraliza a fileira na largura do conteúdo.
    let x = inicio + Math.floor((larguraConteudo - f.largura) / 2);
    for (const b of f.blocos) {
      const indice = blocos.length;
      blocos.push({
        tipo: b.tipo,
        area: { x, y, largura: b.largura, altura: b.altura },
        cercado: b.cercado,
        ...(b.regioes ? { regioes: b.regioes.map((r) => transladar(r, x, y)) } : {}),
      });
      for (const i of b.itens) {
        const movido = mover(i, x, y);
        if (movido.tipo === 'construcao') movido.bloco = indice;
        itens.push(movido);
      }
      x += b.largura + CAMINHO;
    }
    y += f.altura + CAMINHO;
  }
  const largura = inicio + larguraConteudo + CAMINHO + BORDA;
  const altura = y + BORDA;

  const porFileira = fileiras.map((f) => f.blocos.length);

  // Armazéns espalhados, perto das construções que produzem (não das chocadeiras nem dos ambientes).
  // Calculados com a base, antes de rearrumar os lotes: são construções e não mudam com as culturas.
  const produtivas = itens.filter(
    (i): i is ItemConstrucao => i.tipo === 'construcao' && i.construcao !== CHOCADEIRA.chave && !dados.regras.construcoes[i.construcao],
  );
  const armazens = posicionarArmazens(
    opcoes.armazens ?? 0,
    ARMAZEM.tamanho,
    { largura, altura },
    blocos.map((b) => b.area),
    tracarCaminhos({ largura, altura, blocos, fileiras: porFileira }),
    produtivas.map((i) => ({ x: i.area.x + i.area.largura / 2, y: i.area.y + i.area.altura / 2 })),
    { x: BORDA, y: BORDA, largura: largura - 2 * BORDA, altura: altura - 2 * BORDA },
  );
  for (const area of armazens)
    itens.push({ tipo: 'construcao', area, construcao: ARMAZEM.chave, nivel: 1, estimado: false, condicao: null, cultura: null, bloco: -1 });

  // A escolha do jogador rearruma os lotes dentro dos blocos, os modos dos ambientes e as culturas.
  const lote = (p: Produto) => p.construcao === 'farmland' || p.construcao === 'woodland';
  const rvCulturas = opcoes.rvCulturas;
  const escolha = sugestoes(
    rvCulturas === undefined ? inv.produtos : inv.produtos.filter((p) => !lote(p) || (rvDoProduto(p, dados) ?? Infinity) <= rvCulturas),
    opcoes.culturas ? new Set(opcoes.culturas) : undefined,
  );
  const lotesDaPlanta = itens.filter((i): i is ItemConstrucao => i.tipo === 'construcao' && (i.construcao === 'farmland' || i.construcao === 'woodland'));
  const { ativos } =
    opcoes.culturas || rvCulturas !== undefined ? rearranjar({ itens, blocos }, dados, escolha, rvCulturas) : { ativos: new Set(lotesDaPlanta) };
  marcarCoringas(itens, opcoes.coringas ?? 0, escolha, ativos);
  repartirCulturas(itens, escolha, ativos);
  acomodarForaDoAmbiente(itens, escolha, ativos, dados.regras);

  const extras = decorar({ largura, altura, blocos, fileiras: porFileira, itens, semente: rv });
  return { rv, verificado: inv.verificado, largura, altura, blocos, itens: [...extras, ...itens] };
}


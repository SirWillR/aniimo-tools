// Posiciona Fazendas e Bosques em volta das construções de ambiente. Os lotes ficam numa malha de
// 2 tiles (o lado da Fazenda; o Bosque ocupa 2×2 células) para o mapa ficar alinhado; o deslocamento
// da malha é escolhido para caber mais lotes úteis. Heurística gulosa, verificada pela geometria. TS puro.
import { type FonteAmbiente, type Retangulo, cobertura, condicaoDoLote, quadrado, sobrepoe, uniao } from './geometria';
import { moedasPorHora } from './inventario';
import type { Ambiente, Produto, RegrasAmbiente } from './modelos-lar';
import { type Sugestoes, type TipoLote, culturaPara, culturasPara } from './sugestao';

export const TAMANHO_LOTE: Readonly<Record<TipoLote, number>> = { farmland: 2, woodland: 4 };
const PASSO = 2;
const DESLOCAMENTOS = [0, 0.5, 1, 1.5];

export interface ConstrucaoAmbiente {
  chave: string;
  area: Retangulo;
  modo: Ambiente;
}

export interface Lote {
  tipo: TipoLote;
  area: Retangulo;
  condicao: Ambiente | null;
  cultura: Produto | undefined;
}

export interface Aglomerado {
  ambientes: ConstrucaoAmbiente[];
  lotes: Lote[];
}

interface Candidato {
  aglomerado: number;
  tipo: TipoLote;
  area: Retangulo;
  condicao: Ambiente;
  cultura: Produto;
  valor: number;
  distancia: number;
}

function fontes(ambientes: readonly ConstrucaoAmbiente[], regras: RegrasAmbiente): FonteAmbiente[] {
  return ambientes.map((a) => ({ area: cobertura(a.area, regras.raioCobertura), modo: a.modo }));
}

/** Todas as posições de lote úteis (condição com cultura liberada) numa malha com o deslocamento dado. */
function candidatos(
  indice: number,
  ambientes: readonly ConstrucaoAmbiente[],
  ox: number,
  oy: number,
  sugestoes: Sugestoes,
  regras: RegrasAmbiente,
): Candidato[] {
  const cobre = fontes(ambientes, regras);
  const limite = uniao(cobre.map((f) => f.area));
  const centro = uniao(ambientes.map((a) => a.area));
  const cx = centro.x + centro.largura / 2;
  const cy = centro.y + centro.altura / 2;
  const saida: Candidato[] = [];
  const x0 = Math.floor((limite.x - 4 - ox) / PASSO) * PASSO + ox;
  const y0 = Math.floor((limite.y - 4 - oy) / PASSO) * PASSO + oy;
  for (const tipo of ['farmland', 'woodland'] as const) {
    const lado = TAMANHO_LOTE[tipo];
    for (let y = y0; y < limite.y + limite.altura; y += PASSO)
      for (let x = x0; x < limite.x + limite.largura; x += PASSO) {
        const area = quadrado(x, y, lado);
        if (ambientes.some((a) => sobrepoe(area, a.area))) continue;
        const condicao = condicaoDoLote(area, cobre, regras);
        const cultura = condicao && culturaPara(sugestoes, tipo, condicao);
        if (!condicao || !cultura) continue;
        const distancia = Math.hypot(x + lado / 2 - cx, y + lado / 2 - cy);
        saida.push({ aglomerado: indice, tipo, area, condicao, cultura, valor: moedasPorHora(cultura), distancia });
      }
  }
  return saida;
}

/** Escolhe o deslocamento da malha de um aglomerado: mais condições distintas, depois mais valor por área. */
export function melhorMalha(ambientes: readonly ConstrucaoAmbiente[], sugestoes: Sugestoes, regras: RegrasAmbiente) {
  let melhor = { ox: 0, oy: 0, nota: -1 };
  for (const oy of DESLOCAMENTOS)
    for (const ox of DESLOCAMENTOS) {
      const cs = candidatos(0, ambientes, ox, oy, sugestoes, regras).filter((c) => c.tipo === 'farmland');
      const nota = new Set(cs.map((c) => c.condicao)).size * 1e6 + cs.reduce((s, c) => s + c.valor, 0);
      if (nota > melhor.nota + 1e-9) melhor = { ox, oy, nota };
    }
  return melhor;
}

/**
 * Quantas culturas escolhidas ganham lote: por (tipo, condição), o mínimo entre os lotes e as culturas
 * que servem ali. É o critério principal na escolha dos modos dos ambientes.
 */
function variedade(escolhidos: readonly Candidato[], sugestoes: Sugestoes): number {
  const lotes = new Map<string, { n: number; tipo: TipoLote; condicao: Ambiente }>();
  for (const c of escolhidos) {
    const k = `${c.tipo}|${c.condicao}`;
    lotes.set(k, { n: (lotes.get(k)?.n ?? 0) + 1, tipo: c.tipo, condicao: c.condicao });
  }
  return [...lotes.values()].reduce((s, g) => s + Math.min(g.n, culturasPara(sugestoes, g.tipo, g.condicao).length), 0);
}

/**
 * Distribui os lotes disponíveis pelos aglomerados. Primeiro garante uma cultura por condição de cada
 * aglomerado (variedade); depois preenche pelo maior valor por área, do centro para fora.
 */
export function distribuir(
  aglomerados: readonly (readonly ConstrucaoAmbiente[])[],
  disponiveis: Readonly<Record<TipoLote, number>>,
  sugestoes: Sugestoes,
  regras: RegrasAmbiente,
): { aglomerados: Aglomerado[]; restantes: Record<TipoLote, number>; valor: number; condicoes: number } {
  const todos = aglomerados.flatMap((ambientes, i) => {
    const { ox, oy } = melhorMalha(ambientes, sugestoes, regras);
    return candidatos(i, ambientes, ox, oy, sugestoes, regras);
  });
  const porArea = (c: Candidato) => c.valor / (c.area.largura * c.area.altura);
  const ordem = (a: Candidato, b: Candidato) => porArea(b) - porArea(a) || a.distancia - b.distancia || a.area.y - b.area.y || a.area.x - b.area.x;

  const restantes = { ...disponiveis };
  const escolhidos: Candidato[] = [];
  const tentar = (c: Candidato) => {
    if (restantes[c.tipo] <= 0) return false;
    const mesmo = escolhidos.filter((e) => e.aglomerado === c.aglomerado);
    if (mesmo.some((e) => sobrepoe(e.area, c.area))) return false;
    escolhidos.push(c);
    restantes[c.tipo]--;
    return true;
  };

  // 1ª passada: o candidato mais central de cada (aglomerado, condição, tipo).
  const vistos = new Set<string>();
  const centrais = [...todos].sort((a, b) => a.distancia - b.distancia || porArea(b) - porArea(a));
  for (const c of [...centrais].sort((a, b) => porArea(b) - porArea(a))) {
    const k = `${c.aglomerado}|${c.condicao}|${c.tipo}`;
    if (vistos.has(k)) continue;
    const primeiro = centrais.find((x) => `${x.aglomerado}|${x.condicao}|${x.tipo}` === k && tentar(x));
    if (primeiro) vistos.add(k);
  }
  // 2ª passada: preenche o resto.
  for (const c of [...todos].sort(ordem)) if (!escolhidos.includes(c)) tentar(c);

  return {
    aglomerados: aglomerados.map((ambientes, i) => ({
      ambientes: [...ambientes],
      lotes: escolhidos
        .filter((c) => c.aglomerado === i)
        .sort((a, b) => a.area.y - b.area.y || a.area.x - b.area.x)
        .map(({ tipo, area, condicao, cultura }) => ({ tipo, area, condicao, cultura })),
    })),
    restantes,
    valor: escolhidos.reduce((s, c) => s + c.valor, 0),
    condicoes: variedade(escolhidos, sugestoes),
  };
}

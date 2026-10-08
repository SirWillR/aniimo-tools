// O que produzir para vender: os produtos finais (receitas de máquina que não viram ingrediente de
// nenhuma outra receita liberada) que mais rendem por hora de máquina. Conta simples, sem plano de
// produção: ganho = venda do produto − o que os ingredientes renderiam vendidos direto; por hora = ganho
// ÷ carga de trabalho (1 por segundo com o Aniimo no nível exigido). No máximo 2 sugestões por máquina,
// para a lista não ficar só com uma. Cada sugestão traz as culturas usadas, seguindo os ingredientes até
// a Fazenda e o Bosque. TS puro.
import { inventario } from './inventario';
import type { DadosConstrucao, Produto } from './modelos-lar';

export interface SugestaoVenda {
  produto: Produto;
  /** Moedas a mais por hora de máquina, comparado a vender os ingredientes. */
  ganhoPorHora: number;
  /** Venda de uma leva (rendimento × preço). */
  venda: number;
  /** Culturas de Fazenda e Bosque usadas, direta ou indiretamente (chaves de família, sem repetir). */
  culturas: string[];
  /** Outros insumos de origem (Poço, Mina, moradias de Aniimo), sem repetir. */
  outros: string[];
  /** Culturas usadas que o jogador não está plantando (só em `paraVender`). */
  faltam: string[];
}

const familia = (chave: string) => chave.replace(/^(quick|premium)_/, '');

/** Desce pelos ingredientes até a origem: culturas (Fazenda/Bosque) e outros insumos brutos. */
function origens(p: Produto, porChave: ReadonlyMap<string, Produto>, visitados = new Set<string>()): { culturas: Set<string>; outros: Set<string> } {
  const culturas = new Set<string>();
  const outros = new Set<string>();
  for (const i of p.ingredientes) {
    if (visitados.has(i.produto)) continue;
    const x = porChave.get(i.produto);
    if (!x) continue;
    if (x.construcao === 'farmland' || x.construcao === 'woodland') culturas.add(familia(x.chave));
    else if (x.ingredientes.length) {
      const r = origens(x, porChave, new Set([...visitados, i.produto]));
      r.culturas.forEach((c) => culturas.add(c));
      r.outros.forEach((o) => outros.add(o));
    } else outros.add(x.chave);
  }
  return { culturas, outros };
}

export function melhoresParaVender(dados: DadosConstrucao, rv: number, quantidade = 10, porMaquina = 2): SugestaoVenda[] {
  const liberados = inventario(dados, rv).produtos;
  const porChave = new Map(liberados.map((p) => [p.chave, p]));
  const maquinas = new Set(dados.construcoes.filter((c) => c.categoria === 'processamento').map((c) => c.chave));
  const receitas = liberados.filter((p) => maquinas.has(p.construcao) && p.ingredientes.length && p.trabalho);
  // Ingrediente de outra receita liberada = produto intermediário, não final.
  const intermediarios = new Set(receitas.flatMap((r) => r.ingredientes.map((i) => i.produto)));

  const todas: SugestaoVenda[] = [];
  for (const p of receitas) {
    if (p.moeda !== 'coins' || p.venda <= 0 || intermediarios.has(p.chave)) continue;
    // Todo ingrediente precisa estar liberado (subprodutos como wood_block não têm preço e valem 0).
    if (p.ingredientes.some((i) => !porChave.has(i.produto) && i.produto !== 'wood_block' && i.produto !== 'mineral_sand')) continue;
    const venda = p.venda * p.rendimento;
    const custo = p.ingredientes.reduce((s, i) => {
      const x = porChave.get(i.produto);
      return s + (x && x.moeda === 'coins' ? x.venda * i.quantidade : 0);
    }, 0);
    const ganhoPorHora = ((venda - custo) / p.trabalho!) * 3600;
    if (ganhoPorHora <= 0) continue;
    const { culturas, outros } = origens(p, porChave);
    todas.push({ produto: p, ganhoPorHora, venda, culturas: [...culturas], outros: [...outros], faltam: [] });
  }
  todas.sort((a, b) => b.ganhoPorHora - a.ganhoPorHora);
  return limitar(todas, quantidade, porMaquina);
}

/** Os primeiros `quantidade`, com no máximo `porMaquina` por máquina. */
function limitar(lista: readonly SugestaoVenda[], quantidade: number, porMaquina: number): SugestaoVenda[] {
  const porConstrucao = new Map<string, number>();
  const saida: SugestaoVenda[] = [];
  for (const s of lista) {
    if (saida.length >= quantidade) break;
    const n = porConstrucao.get(s.produto.construcao) ?? 0;
    if (n >= porMaquina) continue;
    porConstrucao.set(s.produto.construcao, n + 1);
    saida.push(s);
  }
  return saida;
}

/**
 * Separa as sugestões pelo que o jogador planta: `agora` são as que dá para fazer com as culturas
 * plantadas (ou que não usam cultura); `plantandoMais`, as que pedem alguma cultura a mais (em
 * `faltam`). Cada parte ordenada pelo ganho, com no máximo 2 por máquina.
 */
export function paraVender(
  dados: DadosConstrucao,
  rv: number,
  plantadas: ReadonlySet<string>,
  quantidade = { agora: 10, plantandoMais: 5 },
): { agora: SugestaoVenda[]; plantandoMais: SugestaoVenda[] } {
  const todas = melhoresParaVender(dados, rv, Infinity, Infinity).map((s) => ({
    ...s,
    faltam: s.culturas.filter((c) => !plantadas.has(c)),
  }));
  return {
    agora: limitar(todas.filter((s) => !s.faltam.length), quantidade.agora, 2),
    plantandoMais: limitar(todas.filter((s) => s.faltam.length), quantidade.plantandoMais, 2),
  };
}

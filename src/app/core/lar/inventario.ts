// O que um nível do Lar (RV) libera: cada construção no nível máximo e na quantidade máxima, e os
// produtos disponíveis nesse nível. Mesma regra do `simpleSetup` do aniimax. TS puro.
import type { Construcao, DadosConstrucao, Produto } from './modelos-lar';

export interface ItemInventario {
  construcao: Construcao;
  quantidade: number;
  nivel: number;
}

export interface Inventario {
  rv: number;
  /** false acima do RV conferido no jogo (quantidades extrapoladas pelo aniimax). */
  verificado: boolean;
  itens: ItemInventario[];
  /** Produtos liberados: nível da construção, módulo e fora das receitas especiais. */
  produtos: Produto[];
}

export function inventario(dados: DadosConstrucao, rv: number): Inventario {
  if (!Number.isInteger(rv) || rv < 1 || rv > dados.rvMaximo) throw new RangeError(`RV fora de 1–${dados.rvMaximo}: ${rv}`);
  const i = rv - 1;
  const itens = dados.construcoes
    .map((construcao) => ({ construcao, quantidade: construcao.quantidadePorRv[i]!, nivel: construcao.nivelPorRv[i]! }))
    .filter((c) => c.quantidade > 0 && c.nivel > 0);
  const nivelDe = new Map(itens.map((c) => [c.construcao.chave, c.nivel]));
  const produtos = dados.produtos.filter(
    (p) =>
      !p.especial &&
      p.nivel <= (nivelDe.get(p.construcao) ?? 0) &&
      (!p.modulo || p.modulo.nivel <= (dados.modulosPorRv[p.modulo.chave]?.[i] ?? 0)),
  );
  return { rv, verificado: rv <= dados.rvVerificado, itens, produtos };
}

/** Moedas por hora de um lote/instalação produzindo `p` sem parar (sem contar ingredientes). */
export function moedasPorHora(p: Produto): number {
  const segundos = p.tempo ?? p.trabalho ?? 0;
  if (!segundos || p.moeda !== 'coins') return 0;
  return ((p.venda * p.rendimento - p.custo) / segundos) * 3600;
}

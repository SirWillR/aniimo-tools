// Monta os aglomerados de ambiente e escolhe os modos. Com Fornalha e Resfriador, o primeiro par é
// posicionado com as coberturas encostadas/sobrepostas, criando uma zona do meio onde as temperaturas
// se somam (como no aniimax). Os modos e a distância do par são escolhidos por enumeração: vence a
// combinação em que mais culturas escolhidas ganham lote e, no empate, a de mais valor. TS puro.
import { quadrado } from './geometria';
import { type Aglomerado, type ConstrucaoAmbiente, distribuir } from './empacotamento';
import type { ItemInventario } from './inventario';
import type { Ambiente, RegrasAmbiente } from './modelos-lar';
import type { Sugestoes, TipoLote } from './sugestao';

/** Distâncias testadas entre a Fornalha (1×1) e o Resfriador (2×2) do par, em tiles (menor = zona do meio maior). */
const PAR_DX = [3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];

/**
 * Modos do par na montagem da base: Fornalha em Morno e Resfriador em Congelante, cuja sobreposição dá
 * Frio. Assim a base sempre tem lotes nas três zonas ao mesmo tempo, e Frio e Congelante convivem
 * (pedido do usuário: Xarope de Bordo e Rosa juntos). Depois a escolha de culturas pode trocar os modos
 * (reajustarModos em planta.ts); a disposição não muda.
 */
const MODOS_BASE_DO_PAR: Readonly<Record<string, Ambiente[]>> = { 'heat-furnace': ['warm'], 'cooling-unit': ['freeze'] };
const PAR_DY = [0, 0.5, 1];

export interface ResultadoAmbientes {
  aglomerados: Aglomerado[];
  restantes: Record<TipoLote, number>;
}

export function combinacoes<T>(listas: readonly (readonly T[])[]): T[][] {
  return listas.reduce<T[][]>((acc, opcoes) => acc.flatMap((c) => opcoes.map((o) => [...c, o])), [[]]);
}

export function montarAmbientes(
  itens: readonly ItemInventario[],
  disponiveis: Readonly<Record<TipoLote, number>>,
  sugestoes: Sugestoes,
  regras: RegrasAmbiente,
): ResultadoAmbientes {
  // Uma entrada por unidade construída, com o tamanho e os modos possíveis.
  const unidades = itens.flatMap((it) => {
    const r = regras.construcoes[it.construcao.chave];
    return r ? Array.from({ length: it.quantidade }, () => ({ chave: it.construcao.chave, lado: it.construcao.tamanho, modos: r.modos })) : [];
  });
  if (!unidades.length) return { aglomerados: [], restantes: { ...disponiveis } };

  const quente = unidades.findIndex((u) => u.chave === 'heat-furnace');
  const frio = unidades.findIndex((u) => u.chave === 'cooling-unit');
  const temPar = quente >= 0 && frio >= 0;
  const posicoesPar = temPar ? combinacoes([PAR_DX, PAR_DY]) : [[0, 0]];

  let melhor: (ResultadoAmbientes & { valor: number; condicoes: number }) | undefined;
  const opcoesDeModo = unidades.map((u, i) => (temPar && (i === quente || i === frio) ? MODOS_BASE_DO_PAR[u.chave]! : u.modos));
  for (const modos of combinacoes(opcoesDeModo))
    for (const [dx, dy] of posicoesPar) {
      const grupos: ConstrucaoAmbiente[][] = [];
      if (temPar) {
        const q = unidades[quente]!;
        const f = unidades[frio]!;
        grupos.push([
          { chave: q.chave, area: quadrado(0, 0, q.lado), modo: modos[quente] as Ambiente },
          { chave: f.chave, area: quadrado(dx!, dy!, f.lado), modo: modos[frio] as Ambiente },
        ]);
      }
      unidades.forEach((u, i) => {
        if (temPar && (i === quente || i === frio)) return;
        grupos.push([{ chave: u.chave, area: quadrado(0, 0, u.lado), modo: modos[i] as Ambiente }]);
      });
      const r = distribuir(grupos, disponiveis, sugestoes, regras);
      // Empate: mantém a primeira (modos mais brandos, par mais próximo), para o resultado ser estável.
      if (!melhor || r.condicoes > melhor.condicoes || (r.condicoes === melhor.condicoes && r.valor > melhor.valor + 1e-9)) melhor = r;
    }
  return { aglomerados: melhor!.aglomerados, restantes: melhor!.restantes };
}

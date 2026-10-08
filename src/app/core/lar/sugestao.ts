// Culturas por tipo de lote e condição, só entre as que o jogador escolheu cultivar. Variantes quick_ e
// premium_ contam como a mesma cultura (família): fica a melhor liberada de cada família. TS puro.
import { moedasPorHora } from './inventario';
import type { Ambiente, Produto } from './modelos-lar';

/** Construções de cultivo que o mapa distribui pelos ambientes. */
export type TipoLote = 'farmland' | 'woodland';
export const TIPOS_LOTE: readonly TipoLote[] = ['farmland', 'woodland'];

/** (tipo|condição) → culturas possíveis, da mais rentável para a menos. */
export type Sugestoes = ReadonlyMap<string, readonly Produto[]>;

const chave = (tipo: string, condicao: Ambiente | null) => `${tipo}|${condicao ?? ''}`;

/** `quick_strawberry` e `premium_wheat` pertencem às famílias `strawberry` e `wheat`. */
export const familia = (chaveProduto: string) => chaveProduto.replace(/^(quick|premium)_/, '');

/**
 * @param familias culturas escolhidas (famílias). Sem o parâmetro, todas valem. Só filtra Fazenda e
 * Bosque; as demais construções não são afetadas.
 */
export function sugestoes(produtos: readonly Produto[], familias?: ReadonlySet<string>): Sugestoes {
  const melhorPorFamilia = new Map<string, Produto>();
  for (const p of produtos) {
    const lote = p.construcao === 'farmland' || p.construcao === 'woodland';
    if (lote && familias && !familias.has(familia(p.chave))) continue;
    const k = `${chave(p.construcao, p.ambiente)}|${familia(p.chave)}`;
    const atual = melhorPorFamilia.get(k);
    if (!atual || moedasPorHora(p) > moedasPorHora(atual) || (moedasPorHora(p) === moedasPorHora(atual) && p.chave < atual.chave))
      melhorPorFamilia.set(k, p);
  }
  const lista = new Map<string, Produto[]>();
  for (const p of melhorPorFamilia.values()) {
    const k = chave(p.construcao, p.ambiente);
    lista.set(k, [...(lista.get(k) ?? []), p]);
  }
  for (const l of lista.values()) l.sort((a, b) => moedasPorHora(b) - moedasPorHora(a) || a.chave.localeCompare(b.chave));
  return lista;
}

/** Culturas para um lote de `tipo` na condição dada (null = sem ambiente), da mais rentável para a menos. */
export function culturasPara(s: Sugestoes, tipo: string, condicao: Ambiente | null): readonly Produto[] {
  return s.get(chave(tipo, condicao)) ?? [];
}

/** A mais rentável para o lote, ou undefined se nenhuma cultura escolhida serve. */
export function culturaPara(s: Sugestoes, tipo: string, condicao: Ambiente | null): Produto | undefined {
  return culturasPara(s, tipo, condicao)[0];
}

/**
 * Divide os lotes entre as culturas em faixas contínuas (não alternadas), na ordem recebida: com 17
 * lotes e 2 culturas, os 9 primeiros ficam com a mais rentável e os 8 seguintes com a outra.
 */
export function repartir<T>(lotes: readonly T[], culturas: readonly Produto[]): (Produto | null)[] {
  if (!culturas.length) return lotes.map(() => null);
  const usadas = Math.min(culturas.length, lotes.length);
  return lotes.map((_, i) => culturas[Math.floor((i * usadas) / lotes.length)]!);
}

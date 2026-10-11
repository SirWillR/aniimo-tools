// Foco do plantio: o jogador escolhe à mão ("seleção") ou deixa as culturas seguirem um objetivo.
// - Dinheiro: as culturas dos 10 produtos finais que mais rendem por hora de máquina no RV.
// - Nível: nos Bosques, as árvores que dão mais Blocos de Madeira por hora (o que falta para subir de
//   nível); nas Fazendas, as de dinheiro, porque subir também custa moedas. A Areia Mineral vem da
//   Mina, não de cultura.
// - Festival: as culturas dos pratos do Grande Banquete que o jogador já faz, mais as de dinheiro (o
//   banquete pede só 5 de cada prato; o resto dos lotes continua rendendo). As sementes do festival
//   não são culturas: ficam nas Fazendas coringa.
// Todo foco leva ao menos uma cultura de Fazenda e uma de Bosque que não pedem ambiente: os lotes do
// terreno sem ambiente só aceitam essas, e sem elas ficavam vazios (o usuário viu Bosques parados no
// terreno 1). TS puro.
import { culturasDoBanquete } from './festival';
import { inventario, moedasPorHora } from './inventario';
import type { DadosConstrucao, Produto } from './modelos-lar';
import { familia } from './sugestao';
import { melhoresParaVender } from './vendas';

export type Foco = 'selecao' | 'dinheiro' | 'nivel' | 'festival';
export const FOCOS: readonly Foco[] = ['selecao', 'dinheiro', 'nivel', 'festival'];

/** Culturas (famílias) do foco no RV; `null` no foco "seleção" (vale a escolha do jogador). */
export function culturasDoFoco(dados: DadosConstrucao, rv: number, foco: Foco): string[] | null {
  if (foco === 'selecao') return null;
  const liberados = inventario(dados, rv).produtos;
  const blocos = (p: Produto) => (p.subproduto?.produto === 'wood_block' && p.tempo ? (p.subproduto.quantidade / p.tempo) * 3600 : 0);
  const dinheiro = comSemAmbiente(liberados, [...new Set(melhoresParaVender(dados, rv).flatMap((s) => s.culturas))], moedasPorHora);
  if (foco === 'dinheiro') return dinheiro.sort();
  if (foco === 'festival') return [...new Set([...culturasDoBanquete(dados, rv), ...dinheiro])].sort();

  const lote = new Map(liberados.filter((p) => p.construcao === 'farmland' || p.construcao === 'woodland').map((p) => [familia(p.chave), p.construcao]));
  const blocosPorHora = liberados
    .filter((p) => p.construcao === 'woodland' && p.subproduto?.produto === 'wood_block' && p.tempo)
    .map((p) => ({ f: familia(p.chave), taxa: (p.subproduto!.quantidade / p.tempo!) * 3600 }));
  const melhor = Math.max(0, ...blocosPorHora.map((b) => b.taxa));
  const arvores = blocosPorHora.filter((b) => melhor > 0 && b.taxa >= melhor - 1e-9).map((b) => b.f);
  const fazendas = dinheiro.filter((f) => lote.get(f) === 'farmland');
  // No Bosque sem ambiente, a árvore que dá mais Blocos de Madeira (é para isso que o foco existe).
  return comSemAmbiente(liberados, [...new Set([...arvores, ...fazendas])], (p) => (p.construcao === 'woodland' ? blocos(p) : moedasPorHora(p))).sort();
}

/**
 * Garante uma cultura sem ambiente de cada tipo de lote: se nenhuma das escolhidas serve, entra a
 * melhor das liberadas pelo critério do foco.
 */
function comSemAmbiente(liberados: readonly Produto[], culturas: readonly string[], valor: (p: Produto) => number): string[] {
  const saida = [...culturas];
  for (const tipo of ['farmland', 'woodland']) {
    const semAmbiente = liberados.filter((p) => p.construcao === tipo && !p.ambiente);
    if (!semAmbiente.length || semAmbiente.some((p) => saida.includes(familia(p.chave)))) continue;
    const melhor = [...semAmbiente].sort((a, b) => valor(b) - valor(a) || a.chave.localeCompare(b.chave))[0]!;
    saida.push(familia(melhor.chave));
  }
  return saida;
}

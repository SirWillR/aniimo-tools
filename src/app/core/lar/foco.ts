// Foco do plantio: o jogador escolhe à mão ("seleção") ou deixa as culturas seguirem um objetivo.
// - Dinheiro: as culturas dos 10 produtos finais que mais rendem por hora de máquina no RV.
// - Nível: nos Bosques, as árvores que dão mais Blocos de Madeira por hora (o que falta para subir de
//   nível); nas Fazendas, as de dinheiro, porque subir também custa moedas. A Areia Mineral vem da
//   Mina, não de cultura.
// - Festival: as culturas dos pratos do Grande Banquete que o jogador já faz, mais as de dinheiro (o
//   banquete pede só 5 de cada prato; o resto dos lotes continua rendendo). TS puro.
import { culturasDoBanquete } from './festival';
import { inventario } from './inventario';
import type { DadosConstrucao } from './modelos-lar';
import { familia } from './sugestao';
import { melhoresParaVender } from './vendas';

export type Foco = 'selecao' | 'dinheiro' | 'nivel' | 'festival';
export const FOCOS: readonly Foco[] = ['selecao', 'dinheiro', 'nivel', 'festival'];

/** Culturas (famílias) do foco no RV; `null` no foco "seleção" (vale a escolha do jogador). */
export function culturasDoFoco(dados: DadosConstrucao, rv: number, foco: Foco): string[] | null {
  if (foco === 'selecao') return null;
  const dinheiro = [...new Set(melhoresParaVender(dados, rv).flatMap((s) => s.culturas))];
  if (foco === 'dinheiro') return dinheiro.sort();
  if (foco === 'festival') return [...new Set([...culturasDoBanquete(dados, rv), ...dinheiro])].sort();

  const liberados = inventario(dados, rv).produtos;
  const lote = new Map(liberados.filter((p) => p.construcao === 'farmland' || p.construcao === 'woodland').map((p) => [familia(p.chave), p.construcao]));
  const blocosPorHora = liberados
    .filter((p) => p.construcao === 'woodland' && p.subproduto?.produto === 'wood_block' && p.tempo)
    .map((p) => ({ f: familia(p.chave), taxa: (p.subproduto!.quantidade / p.tempo!) * 3600 }));
  const melhor = Math.max(0, ...blocosPorHora.map((b) => b.taxa));
  const arvores = blocosPorHora.filter((b) => melhor > 0 && b.taxa >= melhor - 1e-9).map((b) => b.f);
  const fazendas = dinheiro.filter((f) => lote.get(f) === 'farmland');
  return [...new Set([...arvores, ...fazendas])].sort();
}

// Energia do Lar, só para a recomendação de Aniimo (o mapa continua sem gerador nem postes). Fatos
// informados pelo usuário: cada instalação trabalha com um Aniimo OU com energia; o consumo de cada uma
// (lista de 2026-10-03, no RV 12); o Gerador de Estalos dá 600 W no nível 1 e 800 W no nível 2, e no
// nível 2 pede um Aniimo de Elétrico nível 2 (2026-10-11). TS puro.
import type { Aptidao } from '../data/models';

/** Watts de uma instalação ligada na rede. */
const CONSUMO: Readonly<Record<string, number>> = {
  'mine': 90,
  'well': 60,
  'jukebox-dryer': 60,
  'claw-game-cooker': 60,
  'crafting-table': 60,
  'simmering-pot': 45,
  'phonolfactory-table': 45,
  'woodworking-bench': 15,
  'dance-pad-polisher': 90,
  'aniipod-maker': 90,
};
/** "As demais máquinas", na lista do usuário. */
const CONSUMO_DAS_DEMAIS = 30;

/**
 * Watts da instalação na rede; null quando ela não roda com energia. Suposição nossa, a confirmar: as
 * moradias de Aniimo precisam do Aniimo da família, então não entram.
 */
export function consumoDe(construcao: string, categoria: string): number | null {
  if (categoria === 'materiais-aniimo' || categoria === 'ambiente') return null;
  return CONSUMO[construcao] ?? (categoria === 'processamento' ? CONSUMO_DAS_DEMAIS : null);
}

export interface Energia {
  /** Geradores que o jogador tem. */
  geradores: number;
  /** Watts de cada gerador ligado. */
  watts: number;
  /** O Aniimo que cada gerador ligado ocupa. */
  aptidao: Aptidao;
  nivel: number;
}

export const WATTS_PADRAO = 800;
/** O gerador libera no RV 12 (informado pelo usuário: 1 gerador no RV 12). */
export const RV_DO_GERADOR = 12;
export const MAX_GERADORES = 4;
/** Velocidade de uma instalação na rede (o Aniimo Tools fala em "até 120%", sem dizer do que depende). */
export const VELOCIDADE_NA_REDE = 1;

export const energiaPadrao = (rv: number): Energia => ({ geradores: rv >= RV_DO_GERADOR ? 1 : 0, watts: WATTS_PADRAO, aptidao: 'lightning', nivel: 2 });

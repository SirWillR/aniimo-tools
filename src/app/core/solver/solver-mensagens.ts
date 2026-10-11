// Protocolo entre o SolverService e o solver.worker.
import type { AniimoLar } from '../data/models';
import type { EntradaEquipe } from '../lar/entrada-equipe';
import type { OpcoesEquipe, ResultadoEquipe } from './equipe';

export interface PedidoSolver {
  id: number;
  aniimos: readonly AniimoLar[];
  entrada: EntradaEquipe;
  opcoes: OpcoesEquipe;
}

export type RespostaSolver =
  | { id: number; ok: true; resultado: ResultadoEquipe }
  | { id: number; ok: false; erro: string };

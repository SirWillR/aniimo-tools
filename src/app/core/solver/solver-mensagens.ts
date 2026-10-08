// Protocolo entre o SolverService e o solver.worker.
import type { AniimoLar, VetorAptidoes } from '../data/models';
import type { OpcoesSolver, ResultadoSolver } from './solver';

export interface PedidoSolver {
  id: number;
  aniimos: readonly AniimoLar[];
  requisitos: VetorAptidoes;
  opcoes: OpcoesSolver;
}

export type RespostaSolver =
  | { id: number; ok: true; resultado: ResultadoSolver }
  | { id: number; ok: false; erro: string };

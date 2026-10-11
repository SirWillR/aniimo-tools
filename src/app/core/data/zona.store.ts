import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { MAX_GERADORES, WATTS_PADRAO } from '../lar/energia';
import type { OpcoesEquipe } from '../solver/equipe';
import { gravar, ler } from './armazenamento';
import { APTIDOES, type Aptidao } from './models';
import { RosterService } from './roster.service';

/**
 * v3: a recomendação escolhe produção e Aniimo juntos (cópias sem limite por padrão, energia, quantos
 * Aniimo usar). v2 era um Aniimo por posto; v1, os requisitos digitados.
 */
export const CHAVE_ZONA = 'aniimo.zona.v3';
/** Teto de Aniimo por tarefa dos lotes. */
export const MAX_EQUIPE_LOTES = 10;
const MAX_COPIAS = 20;
const MAX_ANIIMO = 99;
const MAX_WATTS = 5000;

interface EstadoZona {
  soMeus: boolean;
  excluirPrismana: boolean;
  /** Cópias de cada Aniimo fora do modo "só os meus"; null = sem limite. */
  maxCopias: number | null;
  /** Aniimo por tarefa dos lotes fixados pelo jogador; o que não estiver aqui segue a regra de 1 para 8 lotes. */
  equipeLotes: Partial<Record<Aptidao, number>>;
  /** Quantos Aniimo usar; null = o limite do Lar. */
  aniimoAUsar: number | null;
  /** Geradores que o jogador tem; null = o padrão do RV. */
  geradores: number | null;
  wattsPorGerador: number;
}

const INICIAL: EstadoZona = { soMeus: false, excluirPrismana: false, maxCopias: null, equipeLotes: {}, aniimoAUsar: null, geradores: null, wattsPorGerador: WATTS_PADRAO };

const inteiroEntre = (n: unknown, min: number, max: number) => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
const ehEstado = (v: unknown): v is EstadoZona => {
  const e = v as EstadoZona;
  return typeof v === 'object' && v !== null && typeof e.soMeus === 'boolean' && typeof e.excluirPrismana === 'boolean' &&
    (e.maxCopias === null || inteiroEntre(e.maxCopias, 1, MAX_COPIAS)) &&
    (e.aniimoAUsar === null || inteiroEntre(e.aniimoAUsar, 1, MAX_ANIIMO)) &&
    (e.geradores === null || inteiroEntre(e.geradores, 0, MAX_GERADORES)) &&
    inteiroEntre(e.wattsPorGerador, 0, MAX_WATTS) &&
    typeof e.equipeLotes === 'object' && e.equipeLotes !== null &&
    Object.entries(e.equipeLotes).every(([ap, n]) => (APTIDOES as readonly string[]).includes(ap) && inteiroEntre(n, 0, MAX_EQUIPE_LOTES));
};

const limitar = (n: number, max: number) => Math.max(0, Math.min(max, Math.floor(n) || 0));

/** Opções da recomendação de Aniimo (a equipe do Lar), salvas no localStorage. */
@Injectable({ providedIn: 'root' })
export class ZonaStore {
  private readonly roster = inject(RosterService);
  private readonly estado = signal<EstadoZona>(ler(CHAVE_ZONA, INICIAL, ehEstado));

  readonly soMeus = computed(() => this.estado().soMeus);
  readonly excluirPrismana = computed(() => this.estado().excluirPrismana);
  readonly maxCopias = computed(() => this.estado().maxCopias);
  readonly equipeLotes = computed(() => this.estado().equipeLotes);
  readonly aniimoAUsar = computed(() => this.estado().aniimoAUsar);
  readonly geradores = computed(() => this.estado().geradores);
  readonly wattsPorGerador = computed(() => this.estado().wattsPorGerador);

  /** Opções prontas para o solver. */
  readonly opcoes = computed<OpcoesEquipe>(() => {
    const e = this.estado();
    const opcoes: OpcoesEquipe = { excluirPrismana: e.excluirPrismana };
    // No modo "só os meus" o limite de cópias é a quantidade que o usuário possui.
    if (e.soMeus) opcoes.roster = this.roster.itens();
    else if (e.maxCopias !== null) opcoes.maxCopias = e.maxCopias;
    return opcoes;
  });

  constructor() {
    effect(() => gravar(CHAVE_ZONA, this.estado()));
  }

  alternar(campo: 'soMeus' | 'excluirPrismana', valor: boolean): void {
    this.estado.update((e) => ({ ...e, [campo]: valor }));
  }

  /** Vazio, zero ou inválido = sem limite. */
  definirMaxCopias(valor: number | null): void {
    const n = limitar(valor ?? 0, MAX_COPIAS);
    this.estado.update((e) => ({ ...e, maxCopias: n || null }));
  }

  /** null devolve a tarefa à regra de 1 para 8 lotes. */
  definirEquipeLotes(aptidao: Aptidao, quantidade: number | null): void {
    this.estado.update((e) => {
      const { [aptidao]: _, ...resto } = e.equipeLotes;
      return { ...e, equipeLotes: quantidade === null ? resto : { ...resto, [aptidao]: limitar(quantidade, MAX_EQUIPE_LOTES) } };
    });
  }

  /** Vazio, zero ou inválido = o limite do Lar. */
  definirAniimoAUsar(valor: number | null): void {
    const n = limitar(valor ?? 0, MAX_ANIIMO);
    this.estado.update((e) => ({ ...e, aniimoAUsar: n || null }));
  }

  /** null = o padrão do RV. */
  definirGeradores(valor: number | null): void {
    this.estado.update((e) => ({ ...e, geradores: valor === null ? null : limitar(valor, MAX_GERADORES) }));
  }

  definirWattsPorGerador(valor: number): void {
    this.estado.update((e) => ({ ...e, wattsPorGerador: limitar(valor, MAX_WATTS) }));
  }
}

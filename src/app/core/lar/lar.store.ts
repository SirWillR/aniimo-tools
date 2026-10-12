import { Injectable, computed, effect, signal } from '@angular/core';
import { gravar, ler } from '../data/armazenamento';
import { EQUILIBRIOS, type Equilibrio } from './decoracao';
import { FOCOS, type Foco } from './foco';

export const CHAVE_LAR = 'aniimo.lar.v1';

interface EstadoLar {
  /** Quantidade informada pelo usuário: nenhuma fonte diz quantas chocadeiras cada RV libera. */
  chocadeiras: number;
  /** Unidades de armazenamento; a quantidade por RV não é conhecida, o usuário informa. */
  armazens: number;
  /** Nível atual do jogador: destaca o que já dá para construir na base do RV 20. */
  rvAtual: number;
  /** Fazendas coringa (sem cultura fixa, para sementes de evento). */
  coringas: number;
  /** Culturas (famílias) que o jogador quer cultivar; null = todas. */
  culturas: string[] | null;
  /** Foco do plantio: a seleção do jogador, ou culturas escolhidas para dinheiro ou para subir de nível. */
  foco: Foco;
  /** Quanto decorar: sem enfeites, o meio-termo, ou o mais enfeitado. */
  equilibrio: Equilibrio;
}

const INICIAL: EstadoLar = { chocadeiras: 0, armazens: 1, rvAtual: 20, coringas: 0, culturas: null, foco: 'selecao', equilibrio: 'equilibrado' };
export const MAX_CHOCADEIRAS = 20;
export const MAX_ARMAZENS = 12;
/** Teto do campo; o motor ainda limita ao número de Fazendas da base. */
export const MAX_CORINGAS = 40;

// Aceita estados antigos (sem os campos novos): o que faltar entra com o valor inicial.
const ehEstado = (v: unknown): v is Partial<EstadoLar> => {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Partial<EstadoLar>;
  return (
    (e.chocadeiras === undefined || (Number.isInteger(e.chocadeiras) && e.chocadeiras >= 0 && e.chocadeiras <= MAX_CHOCADEIRAS)) &&
    (e.armazens === undefined || (Number.isInteger(e.armazens) && e.armazens >= 0 && e.armazens <= MAX_ARMAZENS)) &&
    (e.rvAtual === undefined || (Number.isInteger(e.rvAtual) && e.rvAtual >= 1 && e.rvAtual <= 20)) &&
    (e.coringas === undefined || (Number.isInteger(e.coringas) && e.coringas >= 0 && e.coringas <= MAX_CORINGAS)) &&
    (e.culturas === undefined || e.culturas === null || (Array.isArray(e.culturas) && e.culturas.every((c) => typeof c === 'string'))) &&
    (e.foco === undefined || FOCOS.includes(e.foco)) &&
    (e.equilibrio === undefined || EQUILIBRIOS.includes(e.equilibrio))
  );
};

/**
 * Completa estados antigos; o toggle `paraVender` (versão anterior) vira o foco "dinheiro"; os campos
 * de energia (`geradores`, `postes`), o giro do mapa (`rotacao`) e os replantios por dia das coringas
 * (`plantiosPorDia`: são os Aniimo que replantam), que saíram da página, são descartados.
 */
function migrar(lido: Partial<EstadoLar> & { paraVender?: unknown; geradores?: unknown; postes?: unknown; rotacao?: unknown; plantiosPorDia?: unknown }): EstadoLar {
  const { paraVender, geradores: _g, postes: _p, rotacao: _r, plantiosPorDia: _d, ...resto } = lido;
  return { ...INICIAL, ...(paraVender === true && !resto.foco ? { foco: 'dinheiro' as const } : {}), ...resto };
}

/** Preferências da construção do Lar, salvas no localStorage. */
@Injectable({ providedIn: 'root' })
export class LarStore {
  private readonly estado = signal<EstadoLar>(migrar(ler<Partial<EstadoLar>>(CHAVE_LAR, INICIAL, ehEstado)));

  readonly chocadeiras = computed(() => this.estado().chocadeiras);
  readonly armazens = computed(() => this.estado().armazens);
  readonly rvAtual = computed(() => this.estado().rvAtual);
  readonly coringas = computed(() => this.estado().coringas);
  readonly culturas = computed(() => this.estado().culturas);
  readonly foco = computed(() => this.estado().foco);
  readonly equilibrio = computed(() => this.estado().equilibrio);

  constructor() {
    effect(() => gravar(CHAVE_LAR, this.estado()));
  }

  definirChocadeiras(n: number): void {
    const valor = Math.max(0, Math.min(MAX_CHOCADEIRAS, Math.floor(n) || 0));
    this.estado.update((e) => ({ ...e, chocadeiras: valor }));
  }

  definirArmazens(n: number): void {
    const valor = Math.max(0, Math.min(MAX_ARMAZENS, Math.floor(n) || 0));
    this.estado.update((e) => ({ ...e, armazens: valor }));
  }

  definirRvAtual(rv: number): void {
    const valor = Math.max(1, Math.min(20, Math.floor(rv) || 20));
    this.estado.update((e) => ({ ...e, rvAtual: valor }));
  }

  definirCoringas(n: number): void {
    const valor = Math.max(0, Math.min(MAX_CORINGAS, Math.floor(n) || 0));
    this.estado.update((e) => ({ ...e, coringas: valor }));
  }

  /** null volta para "todas". */
  definirCulturas(culturas: readonly string[] | null): void {
    this.estado.update((e) => ({ ...e, culturas: culturas ? [...new Set(culturas)].sort() : null }));
  }

  definirFoco(foco: Foco): void {
    this.estado.update((e) => ({ ...e, foco }));
  }

  definirEquilibrio(equilibrio: Equilibrio): void {
    this.estado.update((e) => ({ ...e, equilibrio }));
  }
}

import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { OpcoesSolver } from '../solver/solver';
import { ehContagem, gravar, ler } from './armazenamento';
import { APTIDOES, type Aptidao } from './models';
import { RosterService } from './roster.service';

export const CHAVE_ZONA = 'aniimo.zona.v1';

interface EstadoZona {
  requisitos: number[];
  atual: number[];
  complementar: boolean;
  alocados: Record<string, number>;
  soMeus: boolean;
  excluirPrismana: boolean;
  maxCopias: number;
}

const zeros = () => APTIDOES.map(() => 0);
const INICIAL: EstadoZona = {
  requisitos: zeros(), atual: zeros(), complementar: false, alocados: {}, soMeus: false, excluirPrismana: false, maxCopias: 1,
};

const ehVetor = (v: unknown) => Array.isArray(v) && v.length === APTIDOES.length && v.every((n) => Number.isInteger(n) && n >= 0);
const ehEstado = (v: unknown): v is EstadoZona => {
  const e = v as EstadoZona;
  return typeof v === 'object' && v !== null && ehVetor(e.requisitos) && ehVetor(e.atual) && ehContagem(e.alocados) &&
    typeof e.complementar === 'boolean' && typeof e.soMeus === 'boolean' && typeof e.excluirPrismana === 'boolean' &&
    Number.isInteger(e.maxCopias) && e.maxCopias >= 1;
};

const limitar = (n: number, max: number) => Math.max(0, Math.min(max, Math.floor(n) || 0));

/** Estado da Zona de Produção (entrada + opções do solver), salvo no localStorage. */
@Injectable({ providedIn: 'root' })
export class ZonaStore {
  private readonly roster = inject(RosterService);
  private readonly estado = signal<EstadoZona>(ler(CHAVE_ZONA, INICIAL, ehEstado));

  readonly requisitos = computed(() => this.estado().requisitos);
  readonly atual = computed(() => this.estado().atual);
  readonly complementar = computed(() => this.estado().complementar);
  readonly alocados = computed(() => this.estado().alocados);
  readonly soMeus = computed(() => this.estado().soMeus);
  readonly excluirPrismana = computed(() => this.estado().excluirPrismana);
  readonly maxCopias = computed(() => this.estado().maxCopias);

  readonly temRequisitos = computed(() => this.requisitos().some((n) => n > 0));

  /** Opções prontas para o solver. */
  readonly opcoes = computed<OpcoesSolver>(() => {
    const e = this.estado();
    const opcoes: OpcoesSolver = { excluirPrismana: e.excluirPrismana };
    // No modo "só os meus" o limite de cópias é a quantidade que o usuário possui.
    if (e.soMeus) opcoes.roster = this.roster.itens();
    else opcoes.maxCopias = e.maxCopias;
    if (e.complementar)
      // Distribuição zerada = "não informei": o solver calcula a partir dos alocados.
      opcoes.complementar = { alocados: e.alocados, ...(e.atual.some((n) => n > 0) ? { atual: e.atual } : {}) };
    return opcoes;
  });

  constructor() {
    effect(() => gravar(CHAVE_ZONA, this.estado()));
  }

  definirRequisito(aptidao: Aptidao, valor: number): void {
    this.definirVetor('requisitos', aptidao, valor);
  }

  definirAtual(aptidao: Aptidao, valor: number): void {
    this.definirVetor('atual', aptidao, valor);
  }

  definirRequisitos(valores: readonly number[]): void {
    if (valores.length === APTIDOES.length) this.estado.update((e) => ({ ...e, requisitos: valores.map((n) => limitar(n, 99)) }));
  }

  definirAlocado(id: string, quantidade: number): void {
    const n = limitar(quantidade, 99);
    this.estado.update((e) => {
      const { [id]: _, ...resto } = e.alocados;
      return { ...e, alocados: n > 0 ? { ...resto, [id]: n } : resto };
    });
  }

  alternar(campo: 'complementar' | 'soMeus' | 'excluirPrismana', valor: boolean): void {
    this.estado.update((e) => ({ ...e, [campo]: valor }));
  }

  definirMaxCopias(valor: number): void {
    this.estado.update((e) => ({ ...e, maxCopias: Math.max(1, limitar(valor, 20)) }));
  }

  limpar(): void {
    this.estado.update((e) => ({ ...e, requisitos: zeros(), atual: zeros(), alocados: {} }));
  }

  private definirVetor(campo: 'requisitos' | 'atual', aptidao: Aptidao, valor: number): void {
    const j = APTIDOES.indexOf(aptidao);
    this.estado.update((e) => ({ ...e, [campo]: e[campo].map((n, i) => (i === j ? limitar(valor, 99) : n)) }));
  }
}

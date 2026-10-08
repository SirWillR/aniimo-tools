import { Injectable, computed, effect, signal } from '@angular/core';
import { ehContagem, gravar, ler } from './armazenamento';

export const CHAVE_ROSTER = 'aniimo.roster.v1';

/** Os Aniimo que o usuário possui (id → quantidade), salvos no localStorage. */
@Injectable({ providedIn: 'root' })
export class RosterService {
  private readonly _itens = signal<Record<string, number>>(ler(CHAVE_ROSTER, {}, ehContagem));

  readonly itens = this._itens.asReadonly();
  /** Total de Aniimo (somando quantidades). */
  readonly total = computed(() => Object.values(this._itens()).reduce((s, n) => s + n, 0));
  readonly distintos = computed(() => Object.keys(this._itens()).length);

  constructor() {
    effect(() => gravar(CHAVE_ROSTER, this._itens()));
  }

  quantidade(id: string): number {
    return this._itens()[id] ?? 0;
  }

  definir(id: string, quantidade: number): void {
    const n = Math.max(0, Math.min(99, Math.floor(quantidade) || 0));
    this._itens.update(({ [id]: _, ...resto }) => (n > 0 ? { ...resto, [id]: n } : resto));
  }

  limpar(): void {
    this._itens.set({});
  }
}

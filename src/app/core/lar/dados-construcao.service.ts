import { httpResource } from '@angular/common/http';
import { Injectable, computed } from '@angular/core';
import type { Construcao, DadosConstrucao, Produto } from './modelos-lar';

/** Carrega src/assets/data/lar-construcao.json (gerado por `npm run data:lar`). */
@Injectable({ providedIn: 'root' })
export class DadosConstrucaoService {
  private readonly recurso = httpResource<DadosConstrucao>(() => 'assets/data/lar-construcao.json');

  readonly carregando = this.recurso.isLoading;
  readonly erro = this.recurso.error;
  readonly dados = computed(() => this.recurso.value());
  readonly construcoes = computed<readonly Construcao[]>(() => this.recurso.value()?.construcoes ?? []);
  readonly produtos = computed<readonly Produto[]>(() => this.recurso.value()?.produtos ?? []);
  readonly construcaoPorChave = computed(() => new Map(this.construcoes().map((c) => [c.chave, c])));
}

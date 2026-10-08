import { httpResource } from '@angular/common/http';
import { Injectable, computed } from '@angular/core';
import type { AniimoLar, Aptidao, AptidaoInfo, DadosLar } from './models';

/** Carrega src/assets/data/aniimo-home-abilities.json (gerado por `npm run data`). */
@Injectable({ providedIn: 'root' })
export class DadosLarService {
  private readonly recurso = httpResource<DadosLar>(() => 'assets/data/aniimo-home-abilities.json');

  readonly carregando = this.recurso.isLoading;
  readonly erro = this.recurso.error;
  readonly fonte = computed(() => this.recurso.value()?.fonte);
  readonly aniimos = computed<readonly AniimoLar[]>(() => this.recurso.value()?.aniimos ?? []);
  readonly aptidoes = computed<readonly AptidaoInfo[]>(() => this.recurso.value()?.aptidoes ?? []);
  readonly porId = computed(() => new Map(this.aniimos().map((a) => [a.id, a])));
  readonly infoAptidao = computed(() => new Map<Aptidao, AptidaoInfo>(this.aptidoes().map((a) => [a.chave, a])));
}

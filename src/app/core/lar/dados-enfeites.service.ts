import { httpResource } from '@angular/common/http';
import { Injectable, computed } from '@angular/core';
import type { DadosEnfeites, Enfeite } from './modelos-lar';

/** Carrega src/assets/data/lar-enfeites.json (gerado por `npm run data:enfeites`). */
@Injectable({ providedIn: 'root' })
export class DadosEnfeitesService {
  private readonly recurso = httpResource<DadosEnfeites>(() => 'assets/data/lar-enfeites.json');

  readonly dados = computed(() => this.recurso.value());
  readonly enfeites = computed<readonly Enfeite[]>(() => this.recurso.value()?.enfeites ?? []);
  readonly porId = computed(() => new Map(this.enfeites().map((e) => [e.id, e])));
}

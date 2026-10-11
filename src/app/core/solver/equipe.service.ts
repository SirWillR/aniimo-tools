import { Injectable, computed, inject, resource } from '@angular/core';
import { DadosLarService } from '../data/dados-lar.service';
import { ZonaStore } from '../data/zona.store';
import { energiaPadrao } from '../lar/energia';
import { entradaDaEquipe } from '../lar/entrada-equipe';
import { LarStore } from '../lar/lar.store';
import { PlanoLarService } from '../lar/plano-lar.service';
import { SolverService } from './solver.service';

/**
 * A equipe do Lar no nível, no foco e com as opções do jogador: o que cada instalação faz e quem
 * colocar. Um cálculo só, que a página da equipe e a do Lar leem, para as duas dizerem a mesma coisa.
 */
@Injectable({ providedIn: 'root' })
export class EquipeService {
  private readonly dados = inject(DadosLarService);
  private readonly plano = inject(PlanoLarService);
  private readonly lar = inject(LarStore);
  private readonly zona = inject(ZonaStore);
  private readonly solver = inject(SolverService);

  /** Geradores em uso: os que o jogador informou, ou o padrão do nível. */
  readonly energia = computed(() => {
    const padrao = energiaPadrao(this.plano.rvAtual());
    return { ...padrao, geradores: this.zona.geradores() ?? padrao.geradores, watts: this.zona.wattsPorGerador() };
  });

  readonly entrada = computed(() => {
    const d = this.plano.dadosVenda();
    const oferta = this.plano.ofertaDosLotes();
    if (!d || !oferta) return undefined;
    return entradaDaEquipe(d, this.plano.rvAtual(), this.plano.focoAtual(), {
      oferta,
      lotes: this.plano.lotesLiberados(),
      armazens: this.lar.armazens(),
      energia: this.energia(),
      equipeLotes: this.zona.equipeLotes(),
      aniimoAUsar: this.zona.aniimoAUsar(),
    });
  });

  readonly resultado = resource({
    params: () => {
      const aniimos = this.dados.aniimos();
      const entrada = this.entrada();
      return aniimos.length && entrada ? { aniimos, entrada, opcoes: this.zona.opcoes() } : undefined;
    },
    loader: ({ params }) => this.solver.montarEquipe(params.aniimos, params.entrada, params.opcoes),
  });

  /** O último plano calculado (fica o anterior enquanto um novo é calculado). */
  readonly equipe = computed(() => (this.resultado.hasValue() ? this.resultado.value() : undefined));
}

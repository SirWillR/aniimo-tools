import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DadosLarService } from '../../core/data/dados-lar.service';
import { APTIDOES, type Aptidao } from '../../core/data/models';
import { ZonaStore } from '../../core/data/zona.store';
import { SolverService } from '../../core/solver/solver.service';
import { AptidaoIcone } from '../../shared/aptidao-icone/aptidao-icone';

/** Acima disso a cobertura vira barra em vez de pips. */
const MAX_PIPS = 14;

type Pip = 'atual' | 'novo' | 'falta' | 'extra';

@Component({
  selector: 'app-resultado-page',
  imports: [AptidaoIcone, RouterLink],
  templateUrl: './resultado-page.html',
  styleUrl: './resultado-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultadoPage {
  protected readonly dados = inject(DadosLarService);
  protected readonly zona = inject(ZonaStore);
  private readonly solver = inject(SolverService);

  protected readonly resultado = resource({
    params: () => {
      const aniimos = this.dados.aniimos();
      if (!aniimos.length || !this.zona.temRequisitos()) return undefined;
      return { aniimos, requisitos: this.zona.requisitos(), opcoes: this.zona.opcoes() };
    },
    loader: ({ params }) => this.solver.resolver(params.aniimos, params.requisitos, params.opcoes),
  });

  private readonly requeridas = computed(() => {
    const req = this.zona.requisitos();
    return new Set(APTIDOES.filter((_, j) => req[j]! > 0));
  });

  protected readonly escolhidos = computed(() => {
    const r = this.resultado.hasValue() ? this.resultado.value() : undefined;
    if (!r) return [];
    const req = this.requeridas();
    return r.escolhidos
      .map((e) => ({
        ...e,
        aptidoes: APTIDOES.flatMap((chave) =>
          e.aniimo.aptidoes[chave] ? [{ chave, nivel: e.aniimo.aptidoes[chave], requerida: req.has(chave) }] : [],
        ),
      }))
      .map((e) => ({ ...e, cobre: e.aptidoes.filter((a) => a.requerida).length }))
      .sort((a, b) => b.cobre - a.cobre || a.aniimo.nome.localeCompare(b.aniimo.nome));
  });

  protected readonly cobertura = computed(() => {
    const r = this.resultado.hasValue() ? this.resultado.value() : undefined;
    if (!r) return [];
    const info = this.dados.infoAptidao();
    return r.cobertura.map((c) => {
      const total = Math.max(c.requerido, c.atingido);
      const pips: Pip[] = [];
      if (total <= MAX_PIPS)
        for (let i = 0; i < total; i++)
          pips.push(i >= c.requerido ? 'extra' : i < c.atual ? 'atual' : i < c.atingido ? 'novo' : 'falta');
      return { ...c, nome: info.get(c.aptidao)?.pt ?? c.aptidao, pips, total };
    });
  });

  protected readonly atendidas = computed(() => this.cobertura().filter((c) => c.requerido > 0 && c.atendido).length);
  protected readonly requeridasTotal = computed(() => this.requeridas().size);

  protected nomeAptidao(ap: Aptidao): string {
    return this.dados.infoAptidao().get(ap)?.pt ?? ap;
  }

  protected escondeImagem(evento: Event): void {
    (evento.target as HTMLImageElement).style.visibility = 'hidden';
  }
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DadosLarService } from './core/data/dados-lar.service';
import { RosterService } from './core/data/roster.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly dados = inject(DadosLarService);
  protected readonly roster = inject(RosterService);

  protected readonly extraidoEm = computed(() => {
    const data = this.dados.fonte()?.extraidoEm;
    return data ? new Date(data).toLocaleDateString('pt-BR') : null;
  });
  protected readonly erroDados = this.dados.erro;
}

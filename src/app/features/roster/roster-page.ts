import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DadosLarService } from '../../core/data/dados-lar.service';
import { RosterService } from '../../core/data/roster.service';
import { ZonaStore } from '../../core/data/zona.store';
import { AniimoPicker, type MudancaQuantidade } from '../../shared/aniimo-picker/aniimo-picker';

@Component({
  selector: 'app-roster-page',
  imports: [AniimoPicker, RouterLink],
  template: `
    <section class="cabecalho">
      <div>
        <p class="sobretitulo">Seu roster</p>
        <h1>Meus Aniimo</h1>
        <p class="lede">
          Marque os Aniimo que você tem e quantos. Com <strong>"Só os meus"</strong> ligado nos requisitos,
          o otimizador usa apenas estes. Fica salvo neste navegador.
        </p>
      </div>
      <div class="placar folha">
        <span class="placar-num num">{{ roster.total() }}</span>
        <span class="placar-rotulo">Aniimo<br />{{ roster.distintos() }} formas</span>
        @if (roster.total()) {
          <button type="button" class="btn discreto" (click)="limpar()">Limpar</button>
        }
      </div>
    </section>

    @if (roster.total() && !zona.soMeus()) {
      <p class="dica folha">
        O modo <strong>"Só os meus"</strong> está desligado: o otimizador está considerando todos os Aniimo.
        <button type="button" class="btn discreto" (click)="zona.alternar('soMeus', true)">Ligar agora</button>
      </p>
    }

    @if (dados.carregando()) {
      <p class="carregando">Carregando Aniimo…</p>
    } @else {
      <app-aniimo-picker
        [aniimos]="dados.aniimos()"
        [aptidoes]="dados.aptidoes()"
        [quantidades]="roster.itens()"
        rotuloQuantidade="Quantos você tem"
        (mudar)="mudar($event)"
      />
    }

    <div class="rodape-acao">
      <a class="btn primario" routerLink="/requisitos">Voltar aos requisitos</a>
    </div>
  `,
  styleUrl: './roster-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RosterPage {
  protected readonly dados = inject(DadosLarService);
  protected readonly roster = inject(RosterService);
  protected readonly zona = inject(ZonaStore);

  protected mudar({ id, quantidade }: MudancaQuantidade): void {
    this.roster.definir(id, quantidade);
  }

  protected limpar(): void {
    if (confirm('Remover todos os Aniimo do seu roster?')) this.roster.limpar();
  }
}

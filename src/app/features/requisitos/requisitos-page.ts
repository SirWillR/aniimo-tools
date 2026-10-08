import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DadosLarService } from '../../core/data/dados-lar.service';
import { APTIDOES, type Aptidao } from '../../core/data/models';
import { RosterService } from '../../core/data/roster.service';
import { ZonaStore } from '../../core/data/zona.store';
import { AniimoPicker, type MudancaQuantidade } from '../../shared/aniimo-picker/aniimo-picker';
import { AptidaoIcone } from '../../shared/aptidao-icone/aptidao-icone';

@Component({
  selector: 'app-requisitos-page',
  imports: [AptidaoIcone, AniimoPicker, RouterLink],
  templateUrl: './requisitos-page.html',
  styleUrl: './requisitos-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequisitosPage {
  protected readonly dados = inject(DadosLarService);
  protected readonly zona = inject(ZonaStore);
  protected readonly roster = inject(RosterService);

  protected readonly linhas = computed(() => {
    const info = this.dados.infoAptidao();
    const req = this.zona.requisitos();
    const atual = this.zona.atual();
    return APTIDOES.map((chave, j) => ({
      chave,
      nome: info.get(chave)?.pt ?? chave,
      requisito: req[j]!,
      atual: atual[j]!,
    }));
  });

  protected readonly totalRequisitos = computed(() => this.zona.requisitos().reduce((s, n) => s + n, 0));
  protected readonly totalAlocados = computed(() => Object.values(this.zona.alocados()).reduce((s, n) => s + n, 0));

  protected readonly colagem = signal('');
  protected readonly erroColagem = signal('');

  protected definir(campo: 'requisito' | 'atual', aptidao: Aptidao, evento: Event): void {
    const n = Number((evento.target as HTMLInputElement).value);
    const valor = Number.isFinite(n) ? n : 0;
    if (campo === 'requisito') this.zona.definirRequisito(aptidao, valor);
    else this.zona.definirAtual(aptidao, valor);
  }

  /** Aceita "4, 5, 7, 10, …" ou "[4 5 7 …]": 13 números na ordem do jogo. */
  protected aplicarColagem(): void {
    const numeros = this.colagem().match(/\d+/g)?.map(Number) ?? [];
    if (numeros.length !== APTIDOES.length) {
      this.erroColagem.set(`Encontrei ${numeros.length} números; preciso de ${APTIDOES.length}, na ordem da tabela.`);
      return;
    }
    this.zona.definirRequisitos(numeros);
    this.colagem.set('');
    this.erroColagem.set('');
  }

  protected mudarAlocado({ id, quantidade }: MudancaQuantidade): void {
    this.zona.definirAlocado(id, quantidade);
  }

  protected selecionarTudo(evento: FocusEvent): void {
    (evento.target as HTMLInputElement).select();
  }
}

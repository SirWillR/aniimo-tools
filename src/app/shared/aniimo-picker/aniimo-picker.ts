import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { APTIDOES, type AniimoLar, type Aptidao, type AptidaoInfo } from '../../core/data/models';
import { AptidaoIcone } from '../aptidao-icone/aptidao-icone';

export interface MudancaQuantidade {
  id: string;
  quantidade: number;
}

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Busca e seleção de Aniimo com quantidade. Não guarda estado: quem usa decide onde salvar. */
@Component({
  selector: 'app-aniimo-picker',
  imports: [AptidaoIcone],
  templateUrl: './aniimo-picker.html',
  styleUrl: './aniimo-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AniimoPicker {
  readonly aniimos = input.required<readonly AniimoLar[]>();
  readonly aptidoes = input.required<readonly AptidaoInfo[]>();
  readonly quantidades = input.required<Readonly<Record<string, number>>>();
  /** Rótulo do contador, ex.: "tenho" ou "alocados". */
  readonly rotuloQuantidade = input('Quantidade');
  readonly mudar = output<MudancaQuantidade>();

  protected readonly busca = signal('');
  protected readonly filtroAptidao = signal<Aptidao | null>(null);
  protected readonly soSelecionados = signal(false);
  protected readonly semPrismana = signal(false);

  protected readonly infoAptidao = computed(() => new Map(this.aptidoes().map((a) => [a.chave, a])));

  protected readonly filtrados = computed(() => {
    const termos = normalizar(this.busca().trim()).split(/\s+/).filter(Boolean);
    const ap = this.filtroAptidao();
    const qtd = this.quantidades();
    return this.aniimos().filter((a) => {
      if (this.soSelecionados() && !qtd[a.id]) return false;
      if (this.semPrismana() && a.prismana) return false;
      if (ap && !a.aptidoes[ap]) return false;
      if (!termos.length) return true;
      const alvo = normalizar(`${a.nome} ${a.nomeEn} ${a.forma} ${a.formaEn}`);
      return termos.every((t) => alvo.includes(t));
    });
  });

  /** Aptidões do Aniimo na ordem do jogo. */
  protected aptidoesDe(a: AniimoLar): { chave: Aptidao; nivel: number }[] {
    return APTIDOES.flatMap((chave) => (a.aptidoes[chave] ? [{ chave, nivel: a.aptidoes[chave] }] : []));
  }

  protected alterar(id: string, quantidade: number): void {
    this.mudar.emit({ id, quantidade: Math.max(0, Math.min(99, quantidade)) });
  }

  protected digitar(id: string, evento: Event): void {
    const n = Number((evento.target as HTMLInputElement).value);
    this.alterar(id, Number.isFinite(n) ? Math.floor(n) : 0);
  }

  protected alternarFiltro(ap: Aptidao): void {
    this.filtroAptidao.update((atual) => (atual === ap ? null : ap));
  }

  protected escondeImagem(evento: Event): void {
    (evento.target as HTMLImageElement).style.visibility = 'hidden';
  }
}

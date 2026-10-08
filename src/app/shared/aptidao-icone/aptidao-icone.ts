import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Aptidao } from '../../core/data/models';

// Glifos simples (viewBox 24, traço), desenhados para o app; cores oficiais da wiki em styles.scss.
const GLIFOS: Record<Aptidao, string> = {
  fire: 'M12 3c.8 3.2 5 5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.6 2.2-4.6.3 1.7 1.2 2.7 2.4 3C11 8.5 11.2 5.5 12 3z',
  grass: 'M5 19C5 11 10 6 19 5c-1 9-6 14-14 14zM5 19l7-7',
  water: 'M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z',
  rock: 'M3.5 17 7 8.5l6-3.5 7.5 5-2 8.5H6.5zM7 8.5l4 4 9.5-2M11 12.5l-4.5 6',
  lightning: 'M13.5 2.5 5.5 14h6l-1.5 7.5 8.5-12h-6z',
  ice: 'M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5',
  wind: 'M3 9h11a3 3 0 1 0-3-3M3 15h14a3 3 0 1 1-3 3M3 12h7',
  dark: 'M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z',
  light: 'M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8',
  hauling: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
  artisanship: 'M14.5 4.5l5 5-2.5 2.5-5-5zM12.5 9.5 4 18l2 2 8.5-8.5',
  leisure: 'M9 17.5V5.5l10-2v12M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 15.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM9 9.5l10-2',
  perfumery: 'M10 3h4v3h-4zM8 9a2.5 2.5 0 0 1 2-3h4a2.5 2.5 0 0 1 2 3v9.5a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2zM8 12.5h8',
};

@Component({
  selector: 'app-aptidao-icone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--cor]': 'cor()',
    '[style.--tam.px]': 'tamanho()',
    '[attr.title]': 'titulo() || null',
    '[attr.aria-label]': 'titulo() || null',
    '[attr.role]': 'titulo() ? "img" : null',
    '[attr.aria-hidden]': 'titulo() ? null : "true"',
  },
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path [attr.d]="glifo()" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: var(--tam);
      height: var(--tam);
      border-radius: 32%;
      background: var(--cor);
      box-shadow: inset 0 -2px 0 rgb(0 0 0 / 18%), inset 0 1px 0 rgb(255 255 255 / 25%);
    }
    svg {
      width: 64%;
      height: 64%;
      fill: none;
      stroke: #fff;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      filter: drop-shadow(0 1px 0 rgb(0 0 0 / 20%));
    }
  `,
})
export class AptidaoIcone {
  readonly aptidao = input.required<Aptidao>();
  readonly tamanho = input(28);
  /** Texto acessível; vazio = decorativo. */
  readonly titulo = input('');

  protected readonly glifo = computed(() => GLIFOS[this.aptidao()]);
  protected readonly cor = computed(() => `var(--ap-${this.aptidao()})`);
}

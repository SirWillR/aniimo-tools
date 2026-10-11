import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { sobrepoe } from '../../core/lar/geometria';
import type { Construcao } from '../../core/lar/modelos-lar';
import type { ItemMapa, PlantaLar } from '../../core/lar/planta';
import { COR_AMBIENTE, camadas, chaoDoTema, desenhoDaConstrucao, desenhosDosEnfeites } from './desenho';

type ItemConstrucao = Extract<ItemMapa, { tipo: 'construcao' }>;

/** Miniatura de um terreno (só desenho, sem interação). Precisa de um `<app-mapa-simbolos>` na página. */
@Component({
  selector: 'app-mini-terreno',
  template: `
    @let t = terreno();
    @let c = camadas();
    <svg [attr.viewBox]="t.area.x + ' ' + t.area.y + ' ' + t.area.largura + ' ' + t.area.altura" aria-hidden="true" focusable="false">
      <rect [attr.x]="t.area.x" [attr.y]="t.area.y" [attr.width]="t.area.largura" [attr.height]="t.area.altura"
        [attr.fill]="'url(#ml-' + chao() + ')'" />
      @for (r of c.ruas; track $index) {
        <rect [attr.x]="r.area.x" [attr.y]="r.area.y" [attr.width]="r.area.largura" [attr.height]="r.area.altura" fill="url(#ml-pedras)" />
      }
      @for (p of c.pisos; track $index) {
        <rect [attr.x]="p.area.x" [attr.y]="p.area.y" [attr.width]="p.area.largura" [attr.height]="p.area.altura" rx=".12" fill="url(#ml-piso)" />
      }
      @for (a of c.coberturas; track $index) {
        <rect class="aura" [attr.x]="a.area.x" [attr.y]="a.area.y" [attr.width]="a.area.largura" [attr.height]="a.area.altura"
          rx="1.4" [attr.fill]="cores[a.modo]" [attr.stroke]="cores[a.modo]" />
      }
      @for (d of c.decoracao; track $index) {
        <use [class.reservada]="d.item.rv > rvAtual() || t.rv > rvAtual()" [attr.href]="'#ml-' + d.simbolo" [attr.x]="d.x" [attr.y]="d.y"
          [attr.width]="d.largura" [attr.height]="d.altura" [attr.transform]="d.giro" [style.color]="d.cor" />
      }
      @for (d of c.construcoes; track $index) {
        <use [class.reservada]="d.reservada" [attr.href]="'#ml-' + d.simbolo" [attr.x]="d.area.x" [attr.y]="d.area.y"
          [attr.width]="d.area.largura" [attr.height]="d.area.altura" [style.color]="d.cor" [style.--cor-2]="d.cor2" />
      }
    </svg>
  `,
  styles: `
    :host { display: block; }
    svg { display: block; width: 100%; height: auto; border-radius: 8px; }
    .aura { fill-opacity: 0.3; stroke-width: 0.12; stroke-opacity: 0.9; stroke-dasharray: 0.45 0.3; }
    .reservada { opacity: 0.35; filter: grayscale(0.75); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiniTerreno {
  readonly planta = input.required<PlantaLar>();
  /** Número do terreno. */
  readonly n = input.required<number>();
  readonly construcoes = input<ReadonlyMap<string, Construcao>>(new Map());
  /** RV em que cada construção libera e o RV atual do jogador: o que ainda não libera fica apagado. */
  readonly liberacao = input<ReadonlyMap<ItemConstrucao, number>>(new Map());
  readonly rvAtual = input(20);

  protected readonly cores = COR_AMBIENTE;
  protected readonly terreno = computed(() => this.planta().terrenos[this.n() - 1]!);
  protected readonly chao = computed(() => chaoDoTema(this.terreno().tema));

  protected readonly camadas = computed(() => {
    const area = this.terreno().area;
    const c = camadas(this.planta());
    const aqui = <T extends ItemMapa>(itens: readonly T[]) => itens.filter((i) => sobrepoe(i.area, area));
    const nomes = this.construcoes();
    const lib = this.liberacao();
    return {
      ruas: aqui(c.caminhos),
      pisos: aqui(c.pisos),
      coberturas: aqui(c.coberturas),
      decoracao: desenhosDosEnfeites(aqui(c.decoracao)),
      construcoes: aqui(c.construcoes).map((i) => ({
        ...desenhoDaConstrucao(i, nomes.get(i.construcao)),
        reservada: (lib.get(i) ?? 0) > this.rvAtual() || this.terreno().rv > this.rvAtual(),
      })),
    };
  });
}

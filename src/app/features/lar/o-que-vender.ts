import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Um produto final sugerido para vender. */
export interface LinhaVenda {
  chave: string;
  nome: string;
  maquina: string;
  ganho: string;
  culturas: { nome: string; cor: readonly [string, string] }[];
  outros: string;
  faltam: string;
}

/** Card "O que vender": o que dá para fazer com o que se planta, e o que pede plantar mais. */
@Component({
  selector: 'app-o-que-vender',
  imports: [NgTemplateOutlet],
  templateUrl: './o-que-vender.html',
  styleUrl: './o-que-vender.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OQueVender {
  readonly vendas = input.required<{ agora: LinhaVenda[]; plantandoMais: LinhaVenda[] }>();
  readonly rvAtual = input.required<number>();
}

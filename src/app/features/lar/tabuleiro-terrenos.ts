import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Construcao } from '../../core/lar/modelos-lar';
import type { ItemMapa, PlantaLar } from '../../core/lar/planta';
import { MiniTerreno } from '../../shared/mapa-lar/mini-terreno';

/** Um produto na lista "Produz por dia". */
export interface LinhaProducao {
  chave: string;
  nome: string;
  porDia: number;
  quantidade: string;
  /** Cor da cultura (Fazenda e Bosque); null nos produtos de máquina e de coleta. */
  cor: string | null;
}

/** O que o cartão de um terreno mostra. */
export interface CartaoTerreno {
  n: number;
  rv: number;
  preco: string;
  /** Posição no tabuleiro do jogo, a partir de 1. */
  coluna: number;
  linha: number;
  tema: string;
  livre: boolean;
  /** Ainda não abriu no RV do jogador. */
  fechado: boolean;
  producao: LinhaProducao[];
  noCartao: LinhaProducao[];
  aMais: number;
}

/** Visão geral do Lar: um cartão por terreno, com a miniatura e o que ele produz por dia. */
@Component({
  selector: 'app-tabuleiro-terrenos',
  imports: [MiniTerreno],
  templateUrl: './tabuleiro-terrenos.html',
  styleUrl: './tabuleiro-terrenos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabuleiroTerrenos {
  readonly cartoes = input.required<readonly CartaoTerreno[]>();
  readonly planta = input.required<PlantaLar>();
  readonly construcoes = input<ReadonlyMap<string, Construcao>>(new Map());
  readonly liberacao = input<ReadonlyMap<Extract<ItemMapa, { tipo: 'construcao' }>, number>>(new Map());
  readonly rvAtual = input(20);
  /** Número do terreno que o jogador abriu. */
  readonly abrir = output<number>();
}

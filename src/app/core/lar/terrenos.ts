// Os terrenos do Lar: o jogo divide o Lar em 16 terrenos de 20×15 tiles, num tabuleiro 4×4 contíguo, e
// libera um por nível (o terreno n no RV n). Fora da wiki e do aniimax. Exceção aprovada pelo usuário
// (2026-10-10): quantidade, tamanho, RV e preço lidos do planejador do Aniidex (aniidex.com/pt/homeland,
// nessa data); a posição de cada terreno no tabuleiro vem de uma captura de tela do Lar do usuário.
// Só esses fatos; nada mais vem do Aniidex. TS puro.
import type { Retangulo } from './geometria';

export const LARGURA_TERRENO = 20;
export const ALTURA_TERRENO = 15;

export interface Terreno {
  /** Número do terreno no jogo (1 a 16). */
  n: number;
  /** Nível do Lar em que libera. */
  rv: number;
  /** Preço em Moeda do Lar. */
  preco: number;
  /** Posição no tabuleiro (0 = esquerda / em cima). */
  coluna: number;
  linha: number;
}

/** Tabuleiro como aparece no jogo, de cima para baixo. */
const TABULEIRO: readonly (readonly number[])[] = [
  [13, 14, 15, 16],
  [12, 7, 8, 9],
  [11, 4, 3, 6],
  [10, 2, 1, 5],
];
const PRECOS = [0, 2000, 4000, 6000, 14000, 19000, 38000, 46000, 72000, 80000, 110000, 170000, 200000, 240000, 270000, 390000];

export const TERRENOS: readonly Terreno[] = TABULEIRO.flatMap((fila, linha) =>
  fila.map((n, coluna) => ({ n, rv: n, preco: PRECOS[n - 1]!, coluna, linha })),
).sort((a, b) => a.n - b.n);

export const LARGURA_TABULEIRO = TABULEIRO[0]!.length * LARGURA_TERRENO;
export const ALTURA_TABULEIRO = TABULEIRO.length * ALTURA_TERRENO;

export const terreno = (n: number): Terreno => TERRENOS[n - 1]!;

/** Área do terreno em tiles, nas coordenadas do tabuleiro. */
export const areaDoTerreno = (t: Terreno): Retangulo => ({
  x: t.coluna * LARGURA_TERRENO,
  y: t.linha * ALTURA_TERRENO,
  largura: LARGURA_TERRENO,
  altura: ALTURA_TERRENO,
});

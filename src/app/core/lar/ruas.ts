// Ruas do Lar, em peças de piso de 2×2 (o tamanho do piso no jogo, informado pelo usuário). Os limites
// dos terrenos são só visuais (informado pelo usuário): terrenos vizinhos da mesma área se unem, sem rua
// entre eles, e a rua fica só na divisa entre duas áreas diferentes e em toda a borda do tabuleiro
// (decisões do usuário, 2026-10-10).
//
// Todas as peças caem numa malha única de 2×2 que começa no canto do tabuleiro, então nunca se sobrepõem
// nem deixam fresta nos cruzamentos nem na borda. Por causa da malha, a rua nem sempre fica meio a meio
// em cima da divisa: a de cima a baixo fica inteira no terreno da direita, e a de lado a lado fica em
// cima da divisa quando ela cai numa linha ímpar e inteira no terreno de baixo quando cai numa linha par.
// TS puro.
import { type Retangulo, quadrado } from './geometria';
import { ALTURA_TERRENO, LARGURA_TERRENO, type Terreno } from './terrenos';

/** Lado de uma peça de piso do jogo, em tiles. */
export const PECA_DE_PISO = 2;

type Lado = 'esq' | 'dir' | 'topo' | 'base';

/** Quanto a rua ocupa em cada lado de um terreno, em tiles, e de que lados ele se une a um vizinho. */
export interface Margens extends Record<Lado, number> {
  unido: Record<Lado, boolean>;
}

/** Onde começa a faixa de 2 tiles da rua na divisa `v`: na peça da malha que contém a divisa ou começa nela. */
const faixa = (v: number) => (v % PECA_DE_PISO ? v - 1 : v);

export interface MalhaDeRuas {
  pecas: Retangulo[];
  margens(t: Terreno): Margens;
}

/**
 * As ruas do tabuleiro: em toda a borda de fora, e na divisa entre dois vizinhos quando `mesma` diz que
 * não são a mesma área.
 */
export function malhaDeRuas(terrenos: readonly Terreno[], mesma: (a: Terreno, b: Terreno) => boolean): MalhaDeRuas {
  const em = (coluna: number, linha: number) => terrenos.find((t) => t.coluna === coluna && t.linha === linha);
  const colunas = Math.max(...terrenos.map((t) => t.coluna)) + 1;
  const linhas = Math.max(...terrenos.map((t) => t.linha)) + 1;
  const largura = colunas * LARGURA_TERRENO;
  const altura = linhas * ALTURA_TERRENO;
  const rua = (a?: Terreno, b?: Terreno) => !!a && !!b && !mesma(a, b);
  const unidos = (a?: Terreno, b?: Terreno) => !!a && !!b && mesma(a, b);
  /** Rua de cima a baixo na divisa à esquerda da coluna, na linha; e de lado a lado acima da linha, na coluna. */
  const vertical = (coluna: number, linha: number) => rua(em(coluna - 1, linha), em(coluna, linha));
  const horizontal = (coluna: number, linha: number) => rua(em(coluna, linha - 1), em(coluna, linha));
  /** Cruzamento no canto de cima à esquerda do terreno (coluna, linha): há peça se alguma rua chega nele. */
  const cruzamento = (coluna: number, linha: number) =>
    coluna > 0 && coluna < colunas && linha > 0 && linha < linhas &&
    (vertical(coluna, linha - 1) || vertical(coluna, linha) || horizontal(coluna - 1, linha) || horizontal(coluna, linha));

  const pecas: Retangulo[] = [];
  // A borda do tabuleiro, por dentro.
  for (let x = 0; x + PECA_DE_PISO <= largura; x += PECA_DE_PISO) pecas.push(quadrado(x, 0, PECA_DE_PISO), quadrado(x, altura - PECA_DE_PISO, PECA_DE_PISO));
  for (let y = PECA_DE_PISO; y + PECA_DE_PISO <= altura - PECA_DE_PISO; y += PECA_DE_PISO)
    pecas.push(quadrado(0, y, PECA_DE_PISO), quadrado(largura - PECA_DE_PISO, y, PECA_DE_PISO));
  // As ruas de dentro: cada trecho vai de uma faixa (ou da borda) até a seguinte.
  for (let linha = 0; linha < linhas; linha++)
    for (let coluna = 0; coluna < colunas; coluna++) {
      const x = coluna * LARGURA_TERRENO;
      const y = linha * ALTURA_TERRENO;
      if (cruzamento(coluna, linha)) pecas.push(quadrado(faixa(x), faixa(y), PECA_DE_PISO));
      if (coluna > 0 && vertical(coluna, linha)) {
        const inicio = linha > 0 ? faixa(y) + PECA_DE_PISO : PECA_DE_PISO;
        const fim = linha < linhas - 1 ? faixa(y + ALTURA_TERRENO) : altura - PECA_DE_PISO;
        for (let py = inicio; py + PECA_DE_PISO <= fim; py += PECA_DE_PISO) pecas.push(quadrado(faixa(x), py, PECA_DE_PISO));
      }
      if (linha > 0 && horizontal(coluna, linha)) {
        const inicio = coluna > 0 ? faixa(x) + PECA_DE_PISO : PECA_DE_PISO;
        const fim = coluna < colunas - 1 ? faixa(x + LARGURA_TERRENO) : largura - PECA_DE_PISO;
        for (let px = inicio; px + PECA_DE_PISO <= fim; px += PECA_DE_PISO) pecas.push(quadrado(px, faixa(y), PECA_DE_PISO));
      }
    }

  const margens = (t: Terreno): Margens => {
    const { coluna, linha } = t;
    const [esq, topo] = [coluna * LARGURA_TERRENO, linha * ALTURA_TERRENO];
    const [dir, base] = [esq + LARGURA_TERRENO, topo + ALTURA_TERRENO];
    /** Quanto da faixa da rua de cada divisa fica dentro deste terreno. */
    const parte = { esq: faixa(esq) + PECA_DE_PISO - esq, dir: dir - faixa(dir), topo: faixa(topo) + PECA_DE_PISO - topo, base: base - faixa(base) };
    const m: Margens = {
      esq: coluna === 0 ? PECA_DE_PISO : vertical(coluna, linha) ? parte.esq : 0,
      dir: coluna === colunas - 1 ? PECA_DE_PISO : vertical(coluna + 1, linha) ? parte.dir : 0,
      topo: linha === 0 ? PECA_DE_PISO : horizontal(coluna, linha) ? parte.topo : 0,
      base: linha === linhas - 1 ? PECA_DE_PISO : horizontal(coluna, linha + 1) ? parte.base : 0,
      unido: {
        esq: unidos(em(coluna - 1, linha), t),
        dir: unidos(t, em(coluna + 1, linha)),
        topo: unidos(em(coluna, linha - 1), t),
        base: unidos(t, em(coluna, linha + 1)),
      },
    };
    // A peça de um cruzamento entra um pouco no terreno mesmo quando nenhuma rua passa pelos lados dele
    // (três vizinhos iguais e um diferente): reserva esse lado.
    for (const [lado, dc] of [['esq', 0], ['dir', 1]] as const)
      for (const [vert, dl] of [['topo', 0], ['base', 1]] as const)
        if (cruzamento(coluna + dc, linha + dl) && parte[lado] > 0 && parte[vert] > 0 && !m[lado] && !m[vert]) m[lado] = parte[lado];
    return m;
  };
  return { pecas, margens };
}

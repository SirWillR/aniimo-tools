// Posiciona as unidades de armazenamento espalhadas pela planta. Os Aniimo levam o que é produzido
// até o armazém mais próximo, então cada armazém fica num espaço livre na beira de um caminho, e as
// posições são escolhidas uma a uma (k-medianas guloso) para diminuir a soma das distâncias de cada
// construção produtiva ao armazém mais perto. Determinístico. TS puro.
import { type Retangulo, contem, expandir, quadrado, sobrepoe } from './geometria';

export interface Ponto {
  x: number;
  y: number;
}

const centro = (r: Retangulo): Ponto => ({ x: r.x + r.largura / 2, y: r.y + r.altura / 2 });
/** Distância andando pelo grid (sem diagonais). */
const distancia = (a: Ponto, b: Ponto) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function posicionarArmazens(
  quantidade: number,
  lado: number,
  mapa: { largura: number; altura: number },
  bloqueios: readonly Retangulo[],
  caminhos: readonly Retangulo[],
  alvos: readonly Ponto[],
  /** Área de dentro do anel de caminho: preferida; a borda de árvores só é usada se faltar espaço. */
  interior?: Retangulo,
): Retangulo[] {
  if (quantidade <= 0) return [];
  // Candidatos: tiles inteiros, livres, sem invadir caminho e encostados em algum caminho.
  const candidatos: Retangulo[] = [];
  for (let y = 0; y + lado <= mapa.altura; y++)
    for (let x = 0; x + lado <= mapa.largura; x++) {
      const r = quadrado(x, y, lado);
      if (bloqueios.some((b) => sobrepoe(b, r)) || caminhos.some((c) => sobrepoe(c, r))) continue;
      if (caminhos.some((c) => sobrepoe(c, expandir(r, 1)))) candidatos.push(r);
    }

  const escolhidos: Retangulo[] = [];
  // Distância de cada alvo ao armazém mais perto até agora.
  const melhor = alvos.map(() => Infinity);
  while (escolhidos.length < quantidade) {
    let vencedor: { r: Retangulo; custo: number; dentro: boolean } | undefined;
    for (const r of candidatos) {
      // Um tile de folga entre armazéns, para não virarem um bloco só.
      if (escolhidos.some((e) => sobrepoe(expandir(e, 1), r))) continue;
      const dentro = !interior || contem(interior, r);
      if (vencedor?.dentro && !dentro) continue;
      const c = centro(r);
      let custo = 0;
      for (let i = 0; i < alvos.length; i++) custo += Math.min(melhor[i]!, distancia(alvos[i]!, c));
      if (!vencedor || (dentro && !vencedor.dentro) || custo < vencedor.custo - 1e-9) vencedor = { r, custo, dentro };
    }
    if (!vencedor) break; // sem espaço livre (não acontece com a borda do mapa livre)
    escolhidos.push(vencedor.r);
    const c = centro(vencedor.r);
    alvos.forEach((a, i) => (melhor[i] = Math.min(melhor[i]!, distancia(a, c))));
  }
  return escolhidos;
}

// Camada visual da planta: caminhos, cercas e jardinagem, com vinhetas temáticas por bloco (cultivo,
// oficina, minas, moradias, ninhal) e praças nos espaços livres (fonte, lago, piquenique, estátuas). Só
// enfeite; nunca ocupa espaço de construção, pátio, trilha nem sub-região de cultivo (os lotes se movem
// dentro delas). Aleatória mas determinística (RNG com semente). TS puro.
import { type Retangulo, expandir, sobrepoe } from './geometria';
import type { Bloco, FormaDecoracao, ItemMapa } from './planta';

// Repetidas de planta.ts para evitar import circular de valores.
const MARGEM = 1;
const CAMINHO = 2;
const BORDA = 3;
/** Distância entre postes de luz ao longo dos caminhos, em tiles. */
const PASSO_POSTE = 6;

export interface EntradaDecoracao {
  largura: number;
  altura: number;
  blocos: readonly Bloco[];
  fileiras: readonly number[];
  itens: readonly ItemMapa[];
  semente: number;
}

/** mulberry32: pequeno, rápido e suficiente para enfeites. */
function rng(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Grade de ocupação em tiles inteiros. */
class Ocupacao {
  private readonly celulas: Uint8Array;
  constructor(readonly largura: number, readonly altura: number) {
    this.celulas = new Uint8Array(largura * altura);
  }
  marcar(r: Retangulo) {
    for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(this.altura, Math.ceil(r.y + r.altura)); y++)
      for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(this.largura, Math.ceil(r.x + r.largura)); x++)
        this.celulas[y * this.largura + x] = 1;
  }
  livre(x: number, y: number, l = 1, a = 1) {
    if (x < 0 || y < 0 || x + l > this.largura || y + a > this.altura) return false;
    for (let j = y; j < y + a; j++) for (let i = x; i < x + l; i++) if (this.celulas[j * this.largura + i]) return false;
    return true;
  }
}

/** Caminhos da planta: um anel interno, uma faixa abaixo de cada fileira e corredores entre blocos. */
export function tracarCaminhos(e: Pick<EntradaDecoracao, 'largura' | 'altura' | 'blocos' | 'fileiras'>): Retangulo[] {
  const x0 = BORDA;
  const x1 = e.largura - BORDA;
  const y0 = BORDA;
  const y1 = e.altura - BORDA;
  const caminhos: Retangulo[] = [
    { x: x0, y: y0, largura: x1 - x0, altura: CAMINHO },
    { x: x0, y: y1 - CAMINHO, largura: x1 - x0, altura: CAMINHO },
    { x: x0, y: y0, largura: CAMINHO, altura: y1 - y0 },
    { x: x1 - CAMINHO, y: y0, largura: CAMINHO, altura: y1 - y0 },
  ];
  let i = 0;
  for (const n of e.fileiras) {
    const fila = e.blocos.slice(i, i + n);
    i += n;
    const topo = fila[0]!.area.y;
    const alturaFila = Math.max(...fila.map((b) => b.area.altura));
    // Faixa horizontal abaixo da fileira (a de cima é a anterior ou o anel).
    caminhos.push({ x: x0, y: topo + alturaFila, largura: x1 - x0, altura: CAMINHO });
    for (const [a, b] of fila.slice(0, -1).map((b, k) => [b, fila[k + 1]!] as const))
      caminhos.push({ x: a.area.x + a.area.largura, y: topo, largura: b.area.x - (a.area.x + a.area.largura), altura: alturaFila });
  }
  return caminhos;
}

export function decorar(e: EntradaDecoracao): ItemMapa[] {
  const aleatorio = rng(e.semente * 7919 + 17);
  const saida: ItemMapa[] = [];
  const ocupado = new Ocupacao(e.largura, e.altura);
  for (const b of e.blocos) ocupado.marcar(b.area);
  // Construções fora dos blocos (unidades de armazenamento) também não recebem enfeite.
  for (const it of e.itens) if (it.tipo === 'construcao') ocupado.marcar(it.area);

  const caminhos = tracarCaminhos(e);
  for (const c of caminhos) {
    saida.push({ tipo: 'caminho', area: c });
    ocupado.marcar(c);
  }

  // ---- cercas ----
  for (const b of e.blocos) {
    if (!b.cercado) continue;
    const cerca = expandir(b.area, -MARGEM / 2);
    // Portão no lado de cima, que sempre dá para um caminho.
    const meio = Math.round(cerca.x + cerca.largura / 2);
    saida.push({ tipo: 'cerca', area: cerca, portao: { x: meio - 1, y: cerca.y - MARGEM / 2, largura: 2, altura: MARGEM } });
  }

  const enfeite = (forma: FormaDecoracao, x: number, y: number, l = 1, a = 1) => {
    const area = { x, y, largura: l, altura: a };
    saida.push({ tipo: 'decoracao', area, forma, variante: Math.floor(aleatorio() * 4) });
    ocupado.marcar(area);
  };

  // ---- postes ao longo das faixas horizontais, do lado de baixo ----
  for (const c of caminhos.filter((c) => c.largura > c.altura))
    for (let x = c.x + 2; x < c.x + c.largura - 1; x += PASSO_POSTE) {
      const y = c.y + c.altura;
      if (ocupado.livre(x, y)) enfeite('poste', x, y);
    }

  // ---- dentro dos blocos: vinhetas do tema de cada um ----
  // `estrutura` marca o que é funcional (construções, pátios, trilhas e sub-regiões de cultivo); os
  // enfeites só vão no resto da área interna de cada bloco (a cerca fica na margem).
  const estrutura = new Ocupacao(e.largura, e.altura);
  for (const it of e.itens) if (it.tipo === 'construcao' || it.tipo === 'piso' || it.tipo === 'trilha') estrutura.marcar(it.area);
  for (const b of e.blocos) for (const r of b.regioes ?? []) estrutura.marcar(r);
  const encostado = (x: number, y: number, l: number, a: number) =>
    !estrutura.livre(x - 1, y, 1, a) || !estrutura.livre(x + l, y, 1, a) || !estrutura.livre(x, y - 1, l, 1) || !estrutura.livre(x, y + a, l, 1);
  for (const b of e.blocos) {
    const dentro = expandir(b.area, -MARGEM);
    const pecas: ItemMapa[] = [];
    const por = (forma: FormaDecoracao, x: number, y: number, l = 1, a = 1) => {
      const area = { x, y, largura: l, altura: a };
      pecas.push({ tipo: 'decoracao', area, forma, variante: Math.floor(aleatorio() * 4) });
      estrutura.marcar(area);
    };
    const cabe = (x: number, y: number, l = 1, a = 1) =>
      x >= dentro.x && y >= dentro.y && x + l <= dentro.x + dentro.largura && y + a <= dentro.y + dentro.altura && estrutura.livre(x, y, l, a);
    for (let y = Math.ceil(dentro.y); y < dentro.y + dentro.altura; y++)
      for (let x = Math.ceil(dentro.x); x < dentro.x + dentro.largura; x++) {
        if (!cabe(x, y)) continue;
        const r = aleatorio();
        const junto = encostado(x, y, 1, 1);
        switch (b.tipo) {
          case 'cultivo':
            if (r < 0.025) por('espantalho', x, y);
            else if (r < 0.06) por('feno', x, y);
            else if (r < 0.075 && cabe(x, y, 2, 1)) por('bebedouro', x, y, 2, 1);
            else if (r < 0.085) por('carrinho-mao', x, y);
            else if (r < 0.16) por('flores', x, y);
            else if (r < 0.2) por('arbusto', x, y);
            break;
          case 'oficina':
            if (junto && r < 0.06) por('caixote', x, y);
            else if (junto && r < 0.1) por('barril', x, y);
            else if (junto && r < 0.13) por('sacos', x, y);
            else if (junto && r < 0.18) por('vaso', x, y);
            else if (junto && r < 0.2) por('lanterna', x, y);
            else if (!junto && r < 0.08 && cabe(x, y, 2, 2)) por('arvore', x, y, 2, 2);
            else if (!junto && r < 0.2) por('flores', x, y);
            else if (!junto && r < 0.26 && cabe(x, y, 2, 1)) por('banco', x, y, 2, 1);
            break;
          case 'recursos':
            if (junto && r < 0.04 && cabe(x, y, 2, 1)) por('carrinho-minerio', x, y, 2, 1);
            else if (junto && r < 0.1) por('pedras-minerio', x, y);
            else if (junto && r < 0.13) por('lanterna', x, y);
            else if (r < 0.1) por('pedra', x, y);
            else if (r < 0.18) por('arbusto', x, y);
            break;
          case 'moradias':
            if (r < 0.08 && cabe(x, y, 2, 1)) por('arco-florido', x, y, 2, 1);
            else if (r < 0.14) por('casinha-passaro', x, y);
            else if (r < 0.38) por('flores', x, y);
            else if (r < 0.43 && cabe(x, y, 2, 1)) por('banco', x, y, 2, 1);
            else if (r < 0.52) por('arbusto', x, y);
            break;
          case 'ninhal':
            if (r < 0.22) por('feno', x, y);
            else if (r < 0.4) por('flores', x, y);
            break;
        }
      }
    saida.push(...pecas);
  }

  // ---- praças nos espaços livres: fonte perto do centro, lago longe dela, piquenique e estátuas ----
  const naBordaDoMapa = (x: number, y: number, l: number, a: number) =>
    x < BORDA || y < BORDA || x + l > e.largura - BORDA || y + a > e.altura - BORDA;
  const vaga = (l: number, a: number, nota: (x: number, y: number) => number) => {
    let melhor: { x: number; y: number; n: number } | undefined;
    for (let y = 0; y + a <= e.altura; y++)
      for (let x = 0; x + l <= e.largura; x++) {
        if (naBordaDoMapa(x, y, l, a) || !ocupado.livre(x - 1, y - 1, l + 2, a + 2)) continue;
        const n = nota(x, y);
        if (!melhor || n < melhor.n) melhor = { x, y, n };
      }
    return melhor;
  };
  const cx = e.largura / 2;
  const cy = e.altura / 2;
  const fonte = vaga(3, 3, (x, y) => Math.hypot(x + 1.5 - cx, y + 1.5 - cy));
  if (fonte) {
    enfeite('fonte', fonte.x, fonte.y, 3, 3);
    for (const [dx, dy] of [[-1, 1], [3, 1]] as const) if (ocupado.livre(fonte.x + dx, fonte.y + dy)) enfeite('estatua', fonte.x + dx, fonte.y + dy);
  }
  const lago = vaga(4, 3, (x, y) => (fonte ? -Math.hypot(x - fonte.x, y - fonte.y) : 0));
  if (lago) {
    enfeite('lago', lago.x, lago.y, 4, 3);
    const piquenique = vaga(2, 2, (x, y) => Math.hypot(x - lago.x, y - lago.y));
    if (piquenique) enfeite('piquenique', piquenique.x, piquenique.y, 2, 2);
  }

  // ---- jardim: árvores na borda; canteiros e bancos só na beira dos caminhos; gramado com moitas ----
  const trilha = new Ocupacao(e.largura, e.altura);
  for (const c of caminhos) trilha.marcar(c);
  const beiraDoCaminho = (x: number, y: number, l: number) =>
    [...Array(l).keys()].some((k) => !trilha.livre(x + k, y - 1) || !trilha.livre(x + k, y + 1));
  const naBorda = (x: number, y: number) => x < BORDA || y < BORDA || x >= e.largura - BORDA || y >= e.altura - BORDA;
  for (let y = 0; y < e.altura; y++)
    for (let x = 0; x < e.largura; x++) {
      if (!ocupado.livre(x, y)) continue;
      const r = aleatorio();
      if (naBorda(x, y)) {
        if (r < 0.7 && ocupado.livre(x, y, 2, 2)) enfeite('arvore', x, y, 2, 2);
        else if (r < 0.85) enfeite('arbusto', x, y);
        continue;
      }
      if (beiraDoCaminho(x, y, 2) && ocupado.livre(x, y, 2, 1)) {
        if (r < 0.3) enfeite('canteiro', x, y, 2, 1);
        else if (r < 0.36) enfeite('banco', x, y, 2, 1);
        continue;
      }
      if (r < 0.07 && ocupado.livre(x, y, 2, 2)) enfeite('arvore', x, y, 2, 2);
      else if (r < 0.17) enfeite('flores', x, y);
      else if (r < 0.25) enfeite('arbusto', x, y);
      else if (r < 0.27) enfeite('pedra', x, y);
    }
  return saida;
}

/** Verdadeiro se alguma decoração invade uma área funcional (usado nos testes). */
export function decoracaoInvade(itens: readonly ItemMapa[], areas: readonly Retangulo[]): boolean {
  return itens.some((i) => i.tipo === 'decoracao' && areas.some((a) => sobrepoe(a, i.area)));
}

import { ChangeDetectionStrategy, Component, ElementRef, computed, input, linkedSignal, model, viewChild } from '@angular/core';
import type { Construcao } from '../../core/lar/modelos-lar';
import { AMBIENTE_PT, nomeConstrucao, nomeProduto } from '../../core/lar/nomes-pt';
import type { ItemMapa, PlantaLar } from '../../core/lar/planta';
import { COR_AMBIENTE, camadas, cerca, chaoDoBloco, desenhoDaConstrucao } from './desenho';

export type ItemConstrucao = Extract<ItemMapa, { tipo: 'construcao' }>;

interface Vista {
  x: number;
  y: number;
  l: number;
  a: number;
}

/** Cores das decorações por variante. */
const VARIANTES: Readonly<Record<string, readonly string[]>> = {
  arvore: ['#4f8f45', '#5f9e4a', '#3f7f3f', '#d98a3a'],
  arbusto: ['#5a9a4a', '#4f8a42', '#6aa652', '#3f7a3a'],
  flores: ['#f28ab2', '#f6d04d', '#fdfbf5', '#b58be0'],
  canteiro: ['#f28ab2', '#f6d04d', '#e8604f', '#b58be0'],
  pedra: ['#a9a397', '#b8b1a4', '#9c968a', '#c2bcb0'],
  poste: ['#ffd98a', '#ffd98a', '#ffd98a', '#ffd98a'],
  banco: ['#9a6a40', '#8a5a34', '#a8784c', '#8a5a34'],
  caixote: ['#b98a55', '#a8784c', '#c99a62', '#9a6a40'],
  barril: ['#8a5a34', '#9a6a40', '#7a4c2d', '#a8784c'],
  vaso: ['#f28ab2', '#f6d04d', '#e8604f', '#b58be0'],
  'arco-florido': ['#f28ab2', '#f2a3c0', '#fdfbf5', '#e8604f'],
  'casinha-passaro': ['#c9503f', '#4f86c6', '#5f9a4a', '#d98a3a'],
};

const ZOOM_MIN = 0.2;

@Component({
  selector: 'app-mapa-lar',
  templateUrl: './mapa-lar.html',
  styleUrl: './mapa-lar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapaLar {
  readonly planta = input.required<PlantaLar>();
  /** Liga a camada técnica: grade de tiles e contorno das coberturas. */
  readonly grade = input(false);
  readonly construcoes = input<ReadonlyMap<string, Construcao>>(new Map());
  readonly selecionado = model<ItemConstrucao | null>(null);
  /** RV em que cada construção libera (ver core/lar/liberacao.ts) e o RV atual do jogador. */
  readonly liberacao = input<ReadonlyMap<ItemConstrucao, number>>(new Map());
  readonly rvAtual = input(20);
  /** Giro do mapa em graus (sentido horário), em volta do centro. */
  readonly rotacao = input(0);

  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  protected readonly cores = COR_AMBIENTE;
  /** Centro da planta (eixo do giro). */
  protected readonly centro = computed(() => ({ x: this.planta().largura / 2, y: this.planta().altura / 2 }));
  protected readonly transformacao = computed(() => {
    const { x, y } = this.centro();
    return `rotate(${this.rotacao()} ${x} ${y})`;
  });

  /**
   * Quadro inteiro (sem zoom): mantém a proporção da planta, para a moldura não mudar de tamanho ao
   * girar, e cresce o bastante para caber o mapa girado inteiro (sobra grama nos cantos).
   */
  protected readonly caixa = computed<Vista>(() => {
    const p = this.planta();
    const r = (this.rotacao() * Math.PI) / 180;
    const cos = Math.abs(Math.cos(r));
    const sen = Math.abs(Math.sin(r));
    const escala = Math.max((p.largura * cos + p.altura * sen) / p.largura, (p.largura * sen + p.altura * cos) / p.altura);
    const l = p.largura * escala;
    const a = p.altura * escala;
    const { x, y } = this.centro();
    return { x: x - l / 2, y: y - a / 2, l, a };
  });

  protected readonly vista = linkedSignal<Vista>(() => this.caixa());
  protected readonly viewBox = computed(() => {
    const v = this.vista();
    return `${v.x} ${v.y} ${v.l} ${v.a}`;
  });
  protected readonly ampliado = computed(() => this.vista().l < this.caixa().l - 1e-6);

  protected readonly camadas = computed(() => {
    const p = this.planta();
    const c = camadas(p);
    const nomes = this.construcoes();
    return {
      chao: p.blocos.map((b) => ({ area: b.area, chao: chaoDoBloco(b) })),
      caminhos: c.caminhos,
      pisos: c.pisos,
      trilhas: c.trilhas,
      cercas: c.cercas.map((i) => cerca(i.area, i.portao)),
      coberturas: c.coberturas,
      construcoes: c.construcoes.map((i) => desenhoDaConstrucao(i, nomes.get(i.construcao))),
      decoracao: c.decoracao.map((d) => ({ ...d, cor: VARIANTES[d.forma]?.[d.variante] ?? '#5a9a4a' })),
    };
  });

  /** Espaço reservado: faz parte da base final, mas ainda não liberado no RV atual. */
  protected reservado(i: ItemConstrucao): boolean {
    return (this.liberacao().get(i) ?? 0) > this.rvAtual();
  }

  protected rotulo(i: ItemConstrucao): string {
    const nome = nomeConstrucao(i.construcao, this.construcoes().get(i.construcao)?.nomeEn ?? i.construcao);
    const partes = [nome];
    if (i.coringa) partes.push('coringa (sementes de evento)');
    if (i.cultura) partes.push(nomeProduto(i.cultura.chave, i.cultura.nomeEn));
    if (i.condicao) partes.push(AMBIENTE_PT[i.condicao]);
    if (i.eficiencia) partes.push(`fora da temperatura ideal, ~${Math.round(i.eficiencia * 100)}%`);
    const rv = this.liberacao().get(i);
    if (rv && rv > this.rvAtual()) partes.push(`espaço reservado, libera no RV ${rv}`);
    return partes.join(' · ');
  }

  protected selecionar(i: ItemConstrucao, evento: Event): void {
    evento.stopPropagation();
    if (this.arrastou) return;
    this.selecionado.set(this.selecionado() === i ? null : i);
  }

  // ---- zoom e arraste ----

  zoom(fator: number, cx?: number, cy?: number): void {
    const k = this.caixa();
    const v = this.vista();
    const l = Math.min(k.l, Math.max(k.l * ZOOM_MIN, v.l / fator));
    const a = (l / k.l) * k.a;
    const px = cx ?? v.x + v.l / 2;
    const py = cy ?? v.y + v.a / 2;
    this.vista.set(this.limitar({ x: px - ((px - v.x) * l) / v.l, y: py - ((py - v.y) * a) / v.a, l, a }));
  }

  restaurar(): void {
    this.vista.set(this.caixa());
  }

  private limitar(v: Vista): Vista {
    const k = this.caixa();
    return {
      ...v,
      x: Math.min(Math.max(k.x, v.x), k.x + k.l - v.l),
      y: Math.min(Math.max(k.y, v.y), k.y + k.a - v.a),
    };
  }

  /** Converte coordenadas de tela para tiles. */
  private paraMapa(clienteX: number, clienteY: number) {
    const r = this.svg().nativeElement.getBoundingClientRect();
    const v = this.vista();
    return { x: v.x + ((clienteX - r.left) / r.width) * v.l, y: v.y + ((clienteY - r.top) / r.height) * v.a };
  }

  private readonly ponteiros = new Map<number, { x: number; y: number }>();
  private distanciaPinca = 0;
  private arrastou = false;

  protected rodinha(e: WheelEvent): void {
    // Sem Ctrl/⌘ a rodinha rola a página normalmente.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const { x, y } = this.paraMapa(e.clientX, e.clientY);
    this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, x, y);
  }

  protected apertar(e: PointerEvent): void {
    this.ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.arrastou = false;
    if (this.ponteiros.size === 2) this.distanciaPinca = this.distancia();
  }

  protected mover(e: PointerEvent): void {
    const anterior = this.ponteiros.get(e.pointerId);
    if (!anterior) return;
    if (this.ponteiros.size === 2) {
      const antes = this.distanciaPinca;
      this.ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const agora = this.distancia();
      if (antes > 0 && agora > 0) {
        const [a, b] = [...this.ponteiros.values()];
        const c = this.paraMapa((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
        this.zoom(agora / antes, c.x, c.y);
      }
      this.distanciaPinca = agora;
      this.arrastou = true;
      return;
    }
    if (!this.ampliado()) return;
    const dx = e.clientX - anterior.x;
    const dy = e.clientY - anterior.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      this.arrastou = true;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
    this.ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = this.svg().nativeElement.getBoundingClientRect();
    const v = this.vista();
    this.vista.set(this.limitar({ ...v, x: v.x - (dx / r.width) * v.l, y: v.y - (dy / r.height) * v.a }));
  }

  protected soltar(e: PointerEvent): void {
    this.ponteiros.delete(e.pointerId);
    if (this.ponteiros.size < 2) this.distanciaPinca = 0;
    // O clique que termina um arraste não seleciona nada.
    setTimeout(() => (this.arrastou = false));
  }

  private distancia(): number {
    const [a, b] = [...this.ponteiros.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}

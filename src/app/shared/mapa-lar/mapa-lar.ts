import { ChangeDetectionStrategy, Component, ElementRef, computed, input, linkedSignal, model, output, viewChild } from '@angular/core';
import type { Construcao } from '../../core/lar/modelos-lar';
import { AMBIENTE_PT, nomeConstrucao, nomeProduto } from '../../core/lar/nomes-pt';
import type { ItemMapa, PlantaLar } from '../../core/lar/planta';
import { areaDoTerreno, terreno } from '../../core/lar/terrenos';
import { COR_AMBIENTE, camadas, cerca, chaoDoTema, desenhoDaConstrucao, desenhosDosEnfeites } from './desenho';

export type ItemConstrucao = Extract<ItemMapa, { tipo: 'construcao' }>;
export type ItemDecoracao = Extract<ItemMapa, { tipo: 'decoracao' }>;

interface Vista {
  x: number;
  y: number;
  l: number;
  a: number;
}

const ZOOM_MIN = 0.12;
/** Com a vista mais larga que isto (em tiles), as peças ficam pequenas demais para o selo de nível. */
const LARGURA_DOS_SELOS = 46;

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
  /** Enfeite clicado (selecionar uma construção limpa o enfeite, e vice-versa). */
  readonly enfeite = model<ItemDecoracao | null>(null);
  /** RV em que cada construção libera (ver core/lar/liberacao.ts) e o RV atual do jogador. */
  readonly liberacao = input<ReadonlyMap<ItemConstrucao, number>>(new Map());
  readonly rvAtual = input(20);
  /** Terreno em que o mapa abre enquadrado (null = tabuleiro inteiro). */
  readonly foco = input<number | null>(null);
  /** Visão geral: em vez de selecionar peças, clicar num terreno pede para abri-lo. */
  readonly geral = input(false);
  readonly abrirTerreno = output<number>();

  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  protected readonly cores = COR_AMBIENTE;

  /** Quadro inteiro (sem zoom): o tabuleiro. Só muda se o tamanho da planta mudar. */
  protected readonly caixa = computed<Vista>(() => ({ x: 0, y: 0, l: this.planta().largura, a: this.planta().altura }), {
    equal: (a, b) => a.l === b.l && a.a === b.a,
  });

  /** Enquadramento inicial: o terreno em foco com um tile de vizinhança, na proporção do tabuleiro. */
  private readonly inicial = computed<Vista>(() => {
    const k = this.caixa();
    const n = this.foco();
    if (!n) return k;
    const area = areaDoTerreno(terreno(n));
    const l = area.largura + 2;
    const a = (l * k.a) / k.l;
    return this.limitar({ x: area.x - 1, y: area.y - (a - area.altura) / 2, l, a });
  });

  protected readonly vista = linkedSignal<Vista>(() => this.inicial());
  protected readonly viewBox = computed(() => {
    const v = this.vista();
    return `${v.x} ${v.y} ${v.l} ${v.a}`;
  });
  protected readonly ampliado = computed(() => this.vista().l < this.caixa().l - 1e-6);
  protected readonly comSelos = computed(() => this.vista().l <= LARGURA_DOS_SELOS);
  protected readonly rotuloDoMapa = computed(() => {
    const n = this.foco();
    return (n ? `Terreno ${n} do Lar` : 'Mapa do Lar com os 16 terrenos') + '. Setas movem, + e − dão zoom, Home volta ao enquadramento inicial.';
  });

  protected readonly camadas = computed(() => {
    const p = this.planta();
    const c = camadas(p);
    const nomes = this.construcoes();
    return {
      terrenos: p.terrenos.map((t) => ({ ...t, chao: chaoDoTema(t.tema), preco: t.preco.toLocaleString('pt-BR') })),
      ruas: c.caminhos,
      pisos: c.pisos,
      cercas: c.cercas.map((i) => cerca(i.area, i.portao)),
      coberturas: c.coberturas,
      construcoes: c.construcoes.map((i) => ({
        ...desenhoDaConstrucao(i, nomes.get(i.construcao)),
        selo: this.selo(i),
        fonte: Math.min(0.62, 0.34 + 0.05 * i.area.largura),
      })),
      decoracao: desenhosDosEnfeites(c.decoracao),
    };
  });

  /** Terreno que o jogador ainda não tem no RV atual. */
  protected fechado(t: { rv: number }): boolean {
    return t.rv > this.rvAtual();
  }

  /** Enfeite que a loja ainda não libera no RV atual, ou em terreno fechado. */
  protected apagado(d: ItemDecoracao): boolean {
    return d.rv > this.rvAtual() || terreno(d.terreno).rv > this.rvAtual();
  }

  /** Selo da peça: o nível da construção no RV atual, ou o RV em que o espaço libera. Peças de 1 tile ficam sem. */
  private selo(i: ItemConstrucao): string | null {
    if (i.area.largura < 2) return null;
    const rv = this.liberacao().get(i);
    if (rv && rv > this.rvAtual()) return `RV ${rv}`;
    const nivel = this.construcoes().get(i.construcao)?.nivelPorRv[this.rvAtual() - 1];
    return nivel ? `Nv. ${nivel}` : null;
  }

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
    this.enfeite.set(null);
    this.selecionado.set(this.selecionado() === i ? null : i);
  }

  protected selecionarEnfeite(d: ItemDecoracao, evento: Event): void {
    evento.stopPropagation();
    if (this.arrastou) return;
    this.selecionado.set(null);
    this.enfeite.set(this.enfeite() === d ? null : d);
  }

  protected abrir(n: number, evento: Event): void {
    evento.stopPropagation();
    if (!this.arrastou) this.abrirTerreno.emit(n);
  }

  protected limpar(): void {
    this.selecionado.set(null);
    this.enfeite.set(null);
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
    this.vista.set(this.inicial());
  }

  protected tecla(e: KeyboardEvent): void {
    const passo = this.vista().l / 8;
    const desloc = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key];
    const v = this.vista();
    if (desloc) this.vista.set(this.limitar({ ...v, x: v.x + desloc[0]!, y: v.y + desloc[1]! }));
    else if (e.key === '+' || e.key === '=') this.zoom(1.25);
    else if (e.key === '-' || e.key === '_') this.zoom(1 / 1.25);
    else if (e.key === 'Home') this.restaurar();
    else return;
    e.preventDefault();
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

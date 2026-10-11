import { DestroyRef, Injectable, inject } from '@angular/core';
import type { AniimoLar } from '../data/models';
import type { EntradaEquipe } from '../lar/entrada-equipe';
import type { OpcoesEquipe, ResultadoEquipe } from './equipe';
import type { PedidoSolver, RespostaSolver } from './solver-mensagens';

/** Fachada do solver: roda no Web Worker e, sem suporte a workers, na thread principal. */
@Injectable({ providedIn: 'root' })
export class SolverService {
  private worker?: Worker;
  private proximoId = 0;
  private readonly pendentes = new Map<number, { resolve: (r: ResultadoEquipe) => void; reject: (e: Error) => void }>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.worker?.terminate());
  }

  montarEquipe(aniimos: readonly AniimoLar[], entrada: EntradaEquipe, opcoes: OpcoesEquipe): Promise<ResultadoEquipe> {
    if (typeof Worker === 'undefined') return this.naThreadPrincipal(aniimos, entrada, opcoes);
    return this.enviar({ id: ++this.proximoId, aniimos, entrada, opcoes });
  }

  private enviar(pedido: PedidoSolver): Promise<ResultadoEquipe> {
    return new Promise((resolve, reject) => {
      this.pendentes.set(pedido.id, { resolve, reject });
      this.obterWorker().postMessage(pedido);
    });
  }

  private obterWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL('./solver.worker', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }: MessageEvent<RespostaSolver>) => {
      const p = this.pendentes.get(data.id);
      this.pendentes.delete(data.id);
      if (data.ok) p?.resolve(data.resultado);
      else p?.reject(new Error(data.erro));
    };
    this.worker.onerror = (e) => {
      // Worker quebrado (ex.: falha ao carregar o WASM): rejeita tudo e recria no próximo pedido.
      for (const p of this.pendentes.values()) p.reject(new Error(e.message || 'Falha no worker do solver'));
      this.pendentes.clear();
      this.worker?.terminate();
      this.worker = undefined;
    };
    return this.worker;
  }

  private async naThreadPrincipal(aniimos: readonly AniimoLar[], entrada: EntradaEquipe, opcoes: OpcoesEquipe) {
    const [{ carregarHighsBrowser }, { montarEquipe }] = await Promise.all([import('./highs-browser'), import('./equipe')]);
    return montarEquipe(await carregarHighsBrowser(), aniimos, entrada, opcoes);
  }
}

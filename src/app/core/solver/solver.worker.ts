/// <reference lib="webworker" />
// Roda o solver fora da thread da UI: o HiGHS (WASM) é síncrono e bloquearia a página.
import { carregarHighsBrowser } from './highs-browser';
import { montarEquipe } from './equipe';
import type { PedidoSolver, RespostaSolver } from './solver-mensagens';

addEventListener('message', async ({ data }: MessageEvent<PedidoSolver>) => {
  let resposta: RespostaSolver;
  try {
    const highs = await carregarHighsBrowser();
    resposta = { id: data.id, ok: true, resultado: montarEquipe(highs, data.aniimos, data.entrada, data.opcoes) };
  } catch (e) {
    resposta = { id: data.id, ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
  postMessage(resposta);
});

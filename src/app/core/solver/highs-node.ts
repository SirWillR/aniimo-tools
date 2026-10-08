// Carrega o HiGHS fora do browser (testes e scripts). No app, o worker usa highs-browser.ts.
import loadHighs from 'highs';
import type { IlpBackend } from './solver';

export async function carregarHighsNode(): Promise<IlpBackend> {
  return loadHighs();
}

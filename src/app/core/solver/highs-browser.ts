// Carrega o HiGHS no browser. O highs.wasm é copiado para /wasm pelo angular.json (assets).
import loadHighs from 'highs';
import type { IlpBackend } from './solver';

let carregando: Promise<IlpBackend> | undefined;

/** Carrega o WASM uma vez só; relativo ao script atual, então funciona com qualquer base href. */
export function carregarHighsBrowser(): Promise<IlpBackend> {
  carregando ??= loadHighs({ locateFile: (arquivo: string) => new URL(`wasm/${arquivo}`, self.location.href).href });
  return carregando;
}

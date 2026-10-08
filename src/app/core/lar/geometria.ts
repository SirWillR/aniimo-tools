// Geometria do grid do Lar, em tiles. Regras do aniimax (src/coverage.rs): uma construção de ambiente
// cobre um quadrado de 2 × raio centrado no seu centro exato; um lote está coberto quando a sua área
// se sobrepõe à cobertura com área positiva (encostar a borda ou a quina não conta). TS puro.
import type { Ambiente, RegrasAmbiente } from './modelos-lar';

const EPS = 1e-6;

export interface Retangulo {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export const quadrado = (x: number, y: number, lado: number): Retangulo => ({ x, y, largura: lado, altura: lado });

/** Sobreposição com área positiva; bordas e quinas encostadas não contam. */
export function sobrepoe(a: Retangulo, b: Retangulo): boolean {
  return (
    a.x < b.x + b.largura - EPS && a.x + a.largura > b.x + EPS &&
    a.y < b.y + b.altura - EPS && a.y + a.altura > b.y + EPS
  );
}

export function contem(fora: Retangulo, dentro: Retangulo): boolean {
  return (
    dentro.x >= fora.x - EPS && dentro.y >= fora.y - EPS &&
    dentro.x + dentro.largura <= fora.x + fora.largura + EPS && dentro.y + dentro.altura <= fora.y + fora.altura + EPS
  );
}

export function uniao(rs: readonly Retangulo[]): Retangulo {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return {
    x, y,
    largura: Math.max(...rs.map((r) => r.x + r.largura)) - x,
    altura: Math.max(...rs.map((r) => r.y + r.altura)) - y,
  };
}

export const transladar = (r: Retangulo, dx: number, dy: number): Retangulo => ({ ...r, x: r.x + dx, y: r.y + dy });

export const expandir = (r: Retangulo, m: number): Retangulo => ({
  x: r.x - m, y: r.y - m, largura: r.largura + 2 * m, altura: r.altura + 2 * m,
});

/** O quadrado coberto por uma construção de ambiente que ocupa `r`. */
export function cobertura(r: Retangulo, raio: number): Retangulo {
  const cx = r.x + r.largura / 2;
  const cy = r.y + r.altura / 2;
  return { x: cx - raio, y: cy - raio, largura: 2 * raio, altura: 2 * raio };
}

export interface FonteAmbiente {
  area: Retangulo;
  modo: Ambiente;
}

/**
 * Condição de um lote: as temperaturas das coberturas que ele toca se somam (Fornalha + Resfriador dá
 * a zona do meio). `null` = fora de qualquer cobertura (ou soma zero). `adequate` só vale sem temperatura.
 */
export function condicaoDoLote(lote: Retangulo, fontes: readonly FonteAmbiente[], regras: RegrasAmbiente): Ambiente | null {
  let soma = 0;
  let temperatura = false;
  let adequado = false;
  for (const f of fontes) {
    if (!sobrepoe(lote, f.area)) continue;
    if (f.modo === 'adequate') adequado = true;
    else {
      temperatura = true;
      soma += regras.temperatura[f.modo];
    }
  }
  if (temperatura) return ambienteDaTemperatura(soma);
  return adequado ? 'adequate' : null;
}

export function ambienteDaTemperatura(t: number): Ambiente | null {
  const limitada = Math.max(-2, Math.min(2, t));
  return (['freeze', 'cool', null, 'warm', 'scorching'] as const)[limitada + 2]!;
}

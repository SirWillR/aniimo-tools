// localStorage tolerante a falhas: modo privado, cota cheia ou JSON corrompido não quebram o app.

export function ler<T>(chave: string, padrao: T, valido: (v: unknown) => v is T): T {
  try {
    const bruto = localStorage.getItem(chave);
    if (bruto === null) return padrao;
    const v: unknown = JSON.parse(bruto);
    return valido(v) ? v : padrao;
  } catch {
    return padrao;
  }
}

export function gravar(chave: string, valor: unknown): void {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // sem persistência; o estado continua em memória
  }
}

export const ehContagem = (v: unknown): v is Record<string, number> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) &&
  Object.values(v).every((n) => Number.isInteger(n) && (n as number) > 0);

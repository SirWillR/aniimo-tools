// Velocidade de trabalho de um Aniimo conforme o nível da aptidão dele e o nível que a receita pede.
// Fatos do Aniimo Tools (aniimotools.dev/pt-br/systems/homeland/aniimo-at-work/), escritos à mão
// (exceção de fonte aprovada pelo usuário em 2026-10-11: só as regras de velocidade e a equipe de 1
// Aniimo para 8 lotes). Os valores são carga de trabalho por minuto; 60 = 100% (1 por segundo, a base
// das cargas de trabalho dos nossos dados). TS puro.

/** `processamento`: cozinhas, oficinas e perfumaria. `outro`: Mina, Poço, moradias e Fabricante de Aniicápsula. */
export type TabelaDeVelocidade = 'processamento' | 'outro';

/** Linha = nível do Aniimo (1 a 4); coluna = nível que a receita pede (1 a 3). */
const POR_MINUTO: Readonly<Record<TabelaDeVelocidade, readonly (readonly number[])[]>> = {
  processamento: [
    [60, 45, 30],
    [180, 60, 45],
    [240, 180, 60],
    [300, 240, 180],
  ],
  outro: [
    [60, 45, 30],
    [90, 75, 60],
    [120, 105, 90],
    [150, 135, 120],
  ],
};

/**
 * O usuário acha que o nível da receita é o mínimo para trabalhar nela ("não tenho certeza"); o Aniimo
 * Tools diz que abaixo do nível o Aniimo só fica mais lento. Em `false`, vale a tabela inteira.
 */
export const NIVEL_MINIMO_OBRIGATORIO = true;

/** Um Aniimo dos lotes dá conta de uma tarefa em até 8 Fazendas ou Bosques. */
export const LOTES_POR_ANIIMO = 8;

/** Construções da tabela `outro`; as demais máquinas usam `processamento`. */
const CONSTRUCOES_DA_TABELA_OUTRO: readonly string[] = ['aniipod-maker'];

export function tabelaDaConstrucao(chave: string, categoria: string): TabelaDeVelocidade {
  return categoria !== 'processamento' || CONSTRUCOES_DA_TABELA_OUTRO.includes(chave) ? 'outro' : 'processamento';
}

/** Fração da velocidade base (1 = 100%); 0 quando o Aniimo não tem a aptidão ou não alcança o nível obrigatório. */
export function velocidade(tabela: TabelaDeVelocidade, nivelDoAniimo: number, nivelDaReceita: number): number {
  if (nivelDoAniimo < 1 || (NIVEL_MINIMO_OBRIGATORIO && nivelDoAniimo < nivelDaReceita)) return 0;
  const linha = POR_MINUTO[tabela][Math.min(nivelDoAniimo, 4) - 1]!;
  return linha[Math.max(1, Math.min(nivelDaReceita, 3)) - 1]! / 60;
}

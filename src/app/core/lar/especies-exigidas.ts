// Produtos das moradias de Aniimo que só uma família de Aniimo faz. Informado pelo usuário
// (2026-10-11): Pérola = família Conchita, Estrela = família Celéstis, Lã = família Nimbi, Sal Marinho =
// família Timilontra, Aromatista = família Orval, Pétalas = família Íris, Escamas = Irisális, Borbossono
// e Sonhovino (os três nomes vieram dele). Nas outras, quem é de cada família é dedução nossa (a wiki
// não publica a linha evolutiva): números vizinhos com as mesmas aptidões.
// A chave é a família do produto (`quick_wool` conta como `wool`); cada espécie é o número dela na
// wiki (o começo do `id` do Aniimo, ex.: "001").
export const ESPECIE_DO_PRODUTO: Readonly<Record<string, readonly string[]>> = {
  pearl: ['053', '054', '055'], // Conchita, Constela, Conchastro
  star: ['005', '006'], // Celéstis, Esteláris
  wool: ['017', '018'], // Nimbi, Turbo
  sea_salt: ['049', '050', '051', '052'], // Timilontra, Conchilontra, Marilontra, Musculontra
  aromathyst: ['038', '039'], // Orval, Odoran
  petals: ['011', '012', '10001'], // Íris, Irisal, Irisális
  scales: ['10001', '030', '019'], // Irisális, Borbossono, Sonhovino
};

/**
 * Aniimo que a conta só tem um, entre as espécies do grupo (usuário, 2026-10-11: o jogo faz escolher
 * entre Lunara e Hélion; não dá para ter os dois). A recomendação nunca pede mais que `maximo` do grupo
 * inteiro, mesmo sem limite de cópias.
 */
export const ESCOLHAS_POR_CONTA: readonly { especies: readonly string[]; maximo: number }[] = [
  { especies: ['99996', '99998'], maximo: 1 }, // Lunara ou Hélion
];

/** Número da espécie de um Aniimo (`001-basic-form` → `001`). */
export const especieDe = (idAniimo: string) => idAniimo.split('-')[0]!;

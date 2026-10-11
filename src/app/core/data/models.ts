// Modelos dos dados de habilidades de lar. TS puro: usado pelo solver, pelo worker e pela UI.

/** As 13 aptidões na ordem da tabela "Zona de Produção" do jogo. */
export const APTIDOES = [
  'fire', 'grass', 'water', 'rock', 'lightning', 'ice', 'wind', 'dark', 'light',
  'hauling', 'artisanship', 'leisure', 'perfumery',
] as const;

export type Aptidao = (typeof APTIDOES)[number];

export interface AniimoLar {
  /** `{numero}-{forma}`, ex.: `001-basic-form`. */
  id: string;
  nome: string;
  nomeEn: string;
  forma: string;
  formaEn: string;
  prismana: boolean;
  elementos: string[];
  /** URL da imagem no CDN oficial (pode ser vazia). */
  imagem: string;
  /** Aptidão → nível (1 a 4). */
  aptidoes: Partial<Record<Aptidao, number>>;
}

export interface AptidaoInfo {
  chave: Aptidao;
  codigo: string;
  en: string;
  pt: string;
  tipo: 'elemental' | 'trabalho';
}

export interface DadosLar {
  fonte: { site: string; endpoint: string; extraidoEm: string; formas: number; nota: string };
  aptidoes: AptidaoInfo[];
  aniimos: AniimoLar[];
}

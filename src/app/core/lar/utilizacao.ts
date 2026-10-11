// O que os lotes do jogador rendem, para a recomendação de Aniimo saber com que material conta. TS puro.
import { FESTIVAL, SEMENTES_FESTIVAL_CHAVES, sementesPorDia } from './festival';
import type { ItemMapa, PlantaLar } from './planta';
import { familia } from './sugestao';

type ItemConstrucao = Extract<ItemMapa, { tipo: 'construcao' }>;

/**
 * O que os lotes que o jogador já tem colhem por hora, por família de produto (Blocos de Madeira dos
 * Bosques incluídos). Com o festival, as Fazendas coringa dão as duas sementes dele, até onde o Trigo
 * do Luar do dia compra.
 */
export function ofertaDosLotes(planta: PlantaLar, liberacao: ReadonlyMap<ItemConstrucao, number>, rvAtual: number, festival: boolean): Map<string, number> {
  const oferta = new Map<string, number>();
  const somar = (chave: string, porHora: number) => oferta.set(chave, (oferta.get(chave) ?? 0) + porHora);
  let coringas = 0;
  for (const i of planta.itens) {
    if (i.tipo !== 'construcao' || (liberacao.get(i) ?? 0) > rvAtual) continue;
    if (i.coringa) coringas++;
    const c = i.cultura;
    if (!c?.tempo) continue;
    const colheitas = (3600 / c.tempo) * (i.eficiencia ?? 1);
    somar(familia(c.chave), c.rendimento * colheitas);
    if (c.subproduto) somar(c.subproduto.produto, c.subproduto.quantidade * colheitas);
  }
  if (festival && coringas) {
    const dosLotes = (coringas * FESTIVAL.rendimento * 60) / FESTIVAL.crescimentoMin;
    const doTrigo = (sementesPorDia(FESTIVAL.trigoPorDia) * FESTIVAL.rendimento) / 24;
    for (const s of SEMENTES_FESTIVAL_CHAVES) somar(s, Math.min(dosLotes, doTrigo) / SEMENTES_FESTIVAL_CHAVES.length);
  }
  return oferta;
}

/** Fazendas e Bosques que o jogador já tem e que estão plantados (com cultura ou coringa). */
export function lotesLiberados(planta: PlantaLar, liberacao: ReadonlyMap<ItemConstrucao, number>, rvAtual: number): number {
  return planta.itens.filter((i) => i.tipo === 'construcao' && (i.cultura || i.coringa) && (liberacao.get(i) ?? 0) <= rvAtual).length;
}

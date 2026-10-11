// O que cada unidade de máquina (e de coleta) deve produzir no RV do jogador, conforme o foco. TS puro.
// - Dinheiro / Minha seleção: percorre os produtos finais que mais rendem (`melhoresParaVender`) e que
//   dá para fazer com as culturas plantadas; cada um ocupa a próxima unidade livre da sua máquina. Se
//   ele pede um intermediário feito em outra máquina (ex.: Açúcar Cristal para Tanghulu), essa máquina
//   recebe o intermediário antes; sem unidade livre para o intermediário, o final fica de fora. Repete
//   em rodadas até as unidades acabarem.
// - Nível: Bancada de Marcenaria e Forno com Chaminé fazem o material de subir para o próximo RV
//   (`custoPorRv`) e, nas outras unidades, os degraus de baixo da mesma cadeia; a Mina tira o minério
//   com mais Areia Mineral por hora. O resto como em Dinheiro, porque subir também custa moedas.
// - Festival: os pratos do Grande Banquete que o jogador já faz ocupam uma unidade cada (com os seus
//   intermediários) antes de tudo; o resto como em Dinheiro.
// - Coleta (Mina, Poço, moradias de Aniimo): o item com mais moedas por hora.
// - Unidade que sobra sem nada: Bancada e Forno com Chaminé fazem a cadeia de nível; as demais, o
//   produto da máquina com mais moedas por hora (Jogo de Dança Lapidador e Fabricante de Aniicápsula,
//   que não rendem moedas: o que mais rende na moeda deles).
// Tempo: carga de trabalho ÷ 1 por segundo (Aniimo no nível exigido, sem bônus de personalidade).
import { FESTIVAL } from './festival';
import type { Foco } from './foco';
import { inventario, moedasPorHora } from './inventario';
import type { DadosConstrucao, Produto } from './modelos-lar';
import { familia } from './sugestao';
import { melhoresParaVender, origens } from './vendas';

/** `outra-moeda`: máquinas que rendem XP de Aniimo ou Aniicápsulas em vez de moedas. */
export type Finalidade = 'vender' | 'banquete' | 'ingrediente' | 'nivel' | 'coleta' | 'outra-moeda';

export interface Producao {
  produto: Produto;
  finalidade: Finalidade;
  /** Itens por hora de uma unidade (rendimento ÷ carga de trabalho). */
  porHora: number;
  /** Moedas a mais por hora (venda) ou moedas por hora (coleta); 0 quando não se vende. */
  moedasPorHora: number;
  /** No que o produto vira (ingrediente ou degrau da cadeia de nível). */
  vira: Produto | null;
}

/** Máquinas da cadeia de subir de nível (produtos sem preço de venda). */
export const MAQUINAS_DE_NIVEL = ['woodworking-bench', 'chimney-kiln'] as const;

const rendePorHora = (p: Produto) => (p.venda * p.rendimento * 3600) / (p.trabalho ?? p.tempo ?? Infinity);
const porHora = (p: Produto) => {
  const s = p.trabalho ?? p.tempo ?? 0;
  return s ? (p.rendimento / s) * 3600 : 0;
};

/**
 * Receita de cada unidade liberada no RV, por construção: `saida.get(chave)[k]` é o que a unidade k
 * (na ordem de liberação) faz. Fica de fora quem não tem Aniimo fixo (Fazenda, Bosque, ambientes).
 */
export function producaoPorUnidade(
  dados: DadosConstrucao,
  rv: number,
  foco: Foco,
  plantadas: ReadonlySet<string>,
): Map<string, Producao[]> {
  const inv = inventario(dados, rv);
  const porChave = new Map(inv.produtos.map((p) => [p.chave, p]));
  const doProduto = (chave: string) => porChave.get(chave) ?? dados.produtos.find((p) => p.chave === chave);
  const saida = new Map<string, (Producao | null)[]>();
  const categoria = new Map(dados.construcoes.map((c) => [c.chave, c.categoria]));
  for (const { construcao, quantidade } of inv.itens) {
    if (construcao.categoria !== 'processamento' && construcao.categoria !== 'materiais' && construcao.categoria !== 'materiais-aniimo') continue;
    if (construcao.chave === 'farmland' || construcao.chave === 'woodland') continue;
    if (!inv.produtos.some((p) => p.construcao === construcao.chave)) continue;
    saida.set(construcao.chave, Array.from({ length: quantidade }, () => null));
  }
  /** Unidades ainda sem receita. */
  const vagas = (c: string) => (saida.get(c) ?? []).flatMap((u, k) => (u === null ? [k] : []));
  const livres = (c: string) => vagas(c).length;
  const por = (p: Produto, finalidade: Finalidade, vira: Produto | null = null, moedas = 0) => {
    saida.get(p.construcao)![vagas(p.construcao)[0]!] = { produto: p, finalidade, porHora: porHora(p), moedasPorHora: moedas, vira };
  };
  const fazendo = (p: Produto) => saida.get(p.construcao)?.some((u) => u?.produto.chave === p.chave) ?? false;

  // ---- Nível: cadeias da Bancada e do Forno com Chaminé, e Areia Mineral na Mina ----
  const cadeia = (maquina: string, alvo: Produto | undefined) => {
    const degraus: Produto[] = [];
    for (let p = alvo; p && p.construcao === maquina; ) {
      degraus.push(p);
      p = p.ingredientes.map((i) => porChave.get(i.produto)).find((x) => x?.construcao === maquina);
    }
    return degraus;
  };
  const encherComCadeia = (maquina: string, alvoChave: string | undefined) => {
    if (!saida.has(maquina)) return;
    // Alvo liberado; senão o degrau mais alto que a máquina já faz.
    const liberadas = inv.produtos.filter((p) => p.construcao === maquina).sort((a, b) => b.nivel - a.nivel);
    const alvo = (alvoChave && porChave.get(alvoChave)?.construcao === maquina ? porChave.get(alvoChave) : undefined) ?? liberadas[0];
    const degraus = cadeia(maquina, alvo);
    if (!degraus.length) return;
    // Cada degrau pede 4 a 8 do de baixo: a 1ª unidade faz o alvo, as outras descem pela cadeia e voltam.
    for (let k = 0; livres(maquina) > 0; k++) {
      const d = k === 0 ? 0 : 1 + ((k - 1) % Math.max(1, degraus.length - 1));
      const p = degraus[Math.min(d, degraus.length - 1)]!;
      por(p, 'nivel', d === 0 ? null : degraus[d - 1]!);
    }
  };
  const materialDoProximoRv = (maquina: string) => {
    const custo = dados.custoPorRv?.[Math.min(rv + 1, dados.rvMaximo) - 1];
    return custo?.itens.map((i) => i.produto).find((c) => doProduto(c)?.construcao === maquina);
  };
  if (foco === 'nivel') {
    for (const m of MAQUINAS_DE_NIVEL) encherComCadeia(m, materialDoProximoRv(m));
    const minerios = inv.produtos.filter((p) => p.construcao === 'mine' && p.subproduto?.produto === 'mineral_sand');
    const areia = (p: Produto) => (p.subproduto!.quantidade / (p.trabalho ?? p.tempo ?? Infinity)) * 3600;
    const melhor = minerios.sort((a, b) => areia(b) - areia(a))[0];
    if (melhor) while (livres('mine') > 0) por(melhor, 'nivel');
  }

  // ---- Venda: produtos finais em rodadas, com os intermediários antes ----
  const finais = melhoresParaVender(dados, rv, Infinity, Infinity).filter((s) => s.culturas.every((c) => plantadas.has(c)));
  const reservar = (p: Produto, visitados = new Set<string>()): Produto[] | null => {
    // Intermediários que faltam, feitos em máquina (não em coleta nem cultivo).
    const pedidos: Produto[] = [];
    for (const i of p.ingredientes) {
      const x = porChave.get(i.produto);
      if (!x || visitados.has(x.chave) || categoria.get(x.construcao) !== 'processamento' || !x.ingredientes.length) continue;
      if (fazendo(x) || pedidos.some((o) => o.chave === x.chave)) continue;
      const abaixo = reservar(x, new Set([...visitados, p.chave]));
      if (!abaixo) return null;
      pedidos.push(...abaixo, x);
    }
    // Cabe tudo (contando duas na mesma máquina)?
    const precisa = new Map<string, number>();
    for (const x of [...pedidos, p]) precisa.set(x.construcao, (precisa.get(x.construcao) ?? 0) + 1);
    for (const [m, n] of precisa) if (vagas(m).length < n) return null;
    return pedidos;
  };
  /** Põe o final numa unidade livre, com os intermediários que faltam antes; false se não couber. */
  const colocar = (p: Produto, finalidade: Finalidade, moedas = 0): boolean => {
    if (livres(p.construcao) <= 0) return false;
    const pedidos = reservar(p);
    if (!pedidos) return false;
    for (const x of pedidos) {
      const destino = [...pedidos, p].find((o) => o.ingredientes.some((i) => i.produto === x.chave)) ?? p;
      por(x, 'ingrediente', destino);
    }
    por(p, finalidade, null, moedas);
    return true;
  };
  // Festival: os pratos do Grande Banquete primeiro, uma unidade cada.
  if (foco === 'festival')
    for (const { chave } of FESTIVAL.banquete.pratos) {
      const p = chave ? porChave.get(chave) : undefined;
      if (p && saida.has(p.construcao) && [...origens(p, porChave).culturas].every((c) => plantadas.has(c))) colocar(p, 'banquete');
    }
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (const s of finais) if (colocar(s.produto, 'vender', s.ganhoPorHora)) mudou = true;
  }

  // ---- Coleta e sobras ----
  for (const [maquina] of saida) {
    if (!livres(maquina)) continue;
    if ((MAQUINAS_DE_NIVEL as readonly string[]).includes(maquina)) {
      encherComCadeia(maquina, materialDoProximoRv(maquina));
      continue;
    }
    const coleta = categoria.get(maquina) !== 'processamento';
    const possiveis = inv.produtos
      .filter((p) => p.construcao === maquina && p.moeda !== 'none' && (p.trabalho || p.tempo))
      .filter((p) => p.ingredientes.every((i) => {
        const x = porChave.get(i.produto);
        if (!x) return true;
        if (x.construcao === 'farmland' || x.construcao === 'woodland') return plantadas.has(familia(x.chave));
        // Intermediário de outra máquina só se alguém já o faz.
        return categoria.get(x.construcao) !== 'processamento' || fazendo(x);
      }))
      .sort((a, b) => rendePorHora(b) - rendePorHora(a));
    const melhor = possiveis.find((p) => p.moeda === 'coins') ?? possiveis[0];
    if (!melhor) continue;
    const finalidade: Finalidade = melhor.moeda !== 'coins' ? 'outra-moeda' : coleta ? 'coleta' : 'vender';
    while (livres(maquina) > 0) por(melhor, finalidade, null, moedasPorHora(melhor));
  }

  return new Map([...saida].map(([c, us]) => [c, us.filter((u): u is Producao => u !== null)]));
}

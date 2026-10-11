import json from '../../../assets/data/lar-construcao.json';
import { inventario } from './inventario';
import type { DadosConstrucao } from './modelos-lar';
import { producaoPorUnidade } from './producao';
import { familia } from './sugestao';

const dados = json as unknown as DadosConstrucao;
const todas = new Set(dados.produtos.filter((p) => p.construcao === 'farmland' || p.construcao === 'woodland').map((p) => familia(p.chave)));

describe('producaoPorUnidade', () => {
  it('cada máquina liberada tem uma receita por unidade, só com produtos liberados', () => {
    for (const rv of [3, 10, 20]) {
      const inv = inventario(dados, rv);
      const liberados = new Set(inv.produtos.map((p) => p.chave));
      const r = producaoPorUnidade(dados, rv, 'dinheiro', todas);
      for (const [chave, unidades] of r) {
        const qtd = inv.itens.find((i) => i.construcao.chave === chave)!.quantidade;
        expect(unidades.length, `${chave} no RV ${rv}`).toBe(qtd);
        for (const u of unidades) {
          expect(liberados.has(u.produto.chave)).toBe(true);
          expect(u.produto.construcao).toBe(chave);
        }
      }
      expect(r.has('farmland')).toBe(false);
      expect(r.has('woodland')).toBe(false);
    }
  });

  it('intermediário vem antes: quem faz um final que pede produto de outra máquina tem essa máquina fazendo o ingrediente', () => {
    const r = producaoPorUnidade(dados, 20, 'dinheiro', todas);
    const feitos = new Set([...r.values()].flat().map((u) => u.produto.chave));
    const porChave = new Map(dados.produtos.map((p) => [p.chave, p]));
    const maquinas = new Set(dados.construcoes.filter((c) => c.categoria === 'processamento').map((c) => c.chave));
    let finais = 0;
    for (const u of [...r.values()].flat().filter((u) => u.finalidade === 'vender')) {
      finais++;
      for (const i of u.produto.ingredientes) {
        const x = porChave.get(i.produto);
        if (x && maquinas.has(x.construcao) && x.ingredientes.length) expect(feitos.has(x.chave), `${u.produto.chave} ← ${x.chave}`).toBe(true);
      }
    }
    expect(finais).toBeGreaterThan(0);
    // Todo intermediário diz no que vira.
    for (const u of [...r.values()].flat().filter((u) => u.finalidade === 'ingrediente')) expect(u.vira).not.toBeNull();
  });

  it('sem culturas plantadas, nada que dependa de cultura', () => {
    const r = producaoPorUnidade(dados, 20, 'selecao', new Set());
    const porChave = new Map(dados.produtos.map((p) => [p.chave, p]));
    const usaCultura = (chave: string, visitados = new Set<string>()): boolean => {
      const p = porChave.get(chave);
      if (!p || visitados.has(chave)) return false;
      if (p.construcao === 'farmland' || p.construcao === 'woodland') return true;
      return p.ingredientes.some((i) => usaCultura(i.produto, new Set([...visitados, chave])));
    };
    for (const u of [...r.values()].flat()) expect(usaCultura(u.produto.chave), u.produto.chave).toBe(false);
  });

  it('foco Nível: Bancada e Forno com Chaminé fazem o material do próximo RV; a Mina, a maior Areia Mineral', () => {
    // RV 10 → 11 pede Tábuas Padrão e Tijolo de Minério Sinterizado.
    const r = producaoPorUnidade(dados, 10, 'nivel', todas);
    expect(r.get('woodworking-bench')![0]!.produto.chave).toBe('standard_planks');
    expect(r.get('chimney-kiln')![0]!.produto.chave).toBe('sintered_ore_brick');
    // As outras unidades descem pela cadeia (Madeira Bruta vira Tábuas).
    const bancada = r.get('woodworking-bench')!;
    if (bancada.length > 1) {
      expect(bancada[1]!.produto.chave).toBe('rough_lumber');
      expect(bancada[1]!.vira?.chave).toBe('standard_planks');
    }
    const mina = r.get('mine')!;
    const areia = (chave: string) => {
      const p = dados.produtos.find((x) => x.chave === chave)!;
      return p.subproduto!.quantidade / p.trabalho!;
    };
    const melhor = Math.max(...inventario(dados, 10).produtos.filter((p) => p.construcao === 'mine').map((p) => areia(p.chave)));
    for (const u of mina) expect(areia(u.produto.chave)).toBe(melhor);
  });
});

describe('foco Festival', () => {
  it('RV 20: cada prato comum do banquete tem uma unidade, e o que ele pede de outra máquina também', () => {
    const r = producaoPorUnidade(dados, 20, 'festival', todas);
    const banquete = [...r.values()].flat().filter((u) => u.finalidade === 'banquete').map((u) => u.produto.chave);
    expect(banquete.sort()).toEqual(['lavender_cookies', 'maple_candy_apple_jam', 'tanghulu']);
    const feitos = new Set([...r.values()].flat().map((u) => u.produto.chave));
    for (const i of ['rock_candy', 'lavender_powder', 'wheatmeal']) expect(feitos.has(i), i).toBe(true);
  });

  it('as unidades continuam todas ocupadas, como em Dinheiro', () => {
    const festival = producaoPorUnidade(dados, 20, 'festival', todas);
    const dinheiro = producaoPorUnidade(dados, 20, 'dinheiro', todas);
    for (const [chave, unidades] of dinheiro) expect(festival.get(chave)!.length, chave).toBe(unidades.length);
  });

  it('sem as culturas plantadas, o prato fica de fora', () => {
    const r = producaoPorUnidade(dados, 20, 'festival', new Set());
    expect([...r.values()].flat().some((u) => u.finalidade === 'banquete')).toBe(false);
  });
});

import json from '../../../assets/data/lar-construcao.json';
import { energiaPadrao } from './energia';
import { type OpcoesEntrada, entradaDaEquipe } from './entrada-equipe';
import { comFestival } from './festival';
import { inventario } from './inventario';
import type { DadosConstrucao } from './modelos-lar';
import { LOTES_POR_ANIIMO, velocidade } from './velocidade';

const dados = json as unknown as DadosConstrucao;
const opcoes = (rv: number, extra: Partial<OpcoesEntrada> = {}): OpcoesEntrada => ({ oferta: new Map([['wheat', 10]]), lotes: 20, armazens: 1, energia: energiaPadrao(rv), ...extra });

describe('entradaDaEquipe', () => {
  it('uma instalação para cada construção com Aniimo, com todas as receitas liberadas no RV', () => {
    for (const rv of [3, 14, 20]) {
      const inv = inventario(dados, rv);
      const e = entradaDaEquipe(dados, rv, 'dinheiro', opcoes(rv));
      for (const i of e.instalacoes) {
        const item = inv.itens.find((x) => x.construcao.chave === i.chave)!;
        expect(i.unidades).toBe(item.quantidade);
        expect(i.receitas.map((r) => r.chave).sort()).toEqual(inv.produtos.filter((p) => p.construcao === i.chave).map((p) => p.chave).sort());
      }
      const chaves = e.instalacoes.map((i) => i.chave);
      for (const fora of ['farmland', 'woodland', 'heat-furnace', 'cooling-unit', 'sunlamp']) expect(chaves, `${fora} no RV ${rv}`).not.toContain(fora);
    }
  });

  it('a receita traz a aptidão, o nível, os ciclos por hora e o que entra e sai (subproduto incluído)', () => {
    const e = entradaDaEquipe(dados, 20, 'dinheiro', opcoes(20));
    const receitas = new Map(e.instalacoes.flatMap((i) => i.receitas).map((r) => [r.chave, r]));
    const tanghulu = dados.produtos.find((p) => p.chave === 'tanghulu')!;
    expect(receitas.get('tanghulu')).toMatchObject({ aptidao: 'fire', nivel: tanghulu.aniimo!.nivel, tabela: 'processamento', consome: { strawberry: 8, rock_candy: 1 }, produz: { tanghulu: 1 } });
    expect(receitas.get('tanghulu')!.ciclosPorHora).toBeCloseTo(3600 / tanghulu.trabalho!, 6);
    // Variante rápida: o produto é o da família; a Mina também dá Areia Mineral.
    expect(Object.keys(receitas.get('quick_fresh_water')!.produz)).toEqual(['fresh_water']);
    expect(receitas.get('gem')!.produz['mineral_sand']).toBeGreaterThan(0);
    expect(receitas.get('gem')!.tabela).toBe('outro');
  });

  it('produtos de moradia: só a família informada faz; moradia não roda com energia', () => {
    const e = entradaDaEquipe(dados, 20, 'dinheiro', opcoes(20));
    const receitas = new Map(e.instalacoes.flatMap((i) => i.receitas).map((r) => [r.chave, r]));
    expect(receitas.get('pearl')).toMatchObject({ familia: ['053', '054', '055'], familiaPendente: false, watts: null });
    expect(receitas.get('quick_sea_salt')!.familia).toEqual(['049', '050', '051', '052']);
    expect(receitas.get('quick_aromathyst')!.familia).toEqual(['038', '039']);
    expect(receitas.get('petals')!.familia).toEqual(['011', '012', '10001']);
    expect(receitas.get('scales')).toMatchObject({ familia: ['10001', '030', '019'], familiaPendente: false });
    // Todo produto de moradia tem a família informada.
    expect(e.instalacoes.flatMap((i) => i.receitas).some((r) => r.familiaPendente)).toBe(false);
    expect(receitas.get('tanghulu')).toMatchObject({ familia: null, familiaPendente: false, watts: 30 });
    expect(receitas.get('gem')!.watts).toBe(90);
  });

  it('postos fixos: os ambientes que a planta usa e os armazéns', () => {
    const e = entradaDaEquipe(dados, 20, 'dinheiro', opcoes(20, { armazens: 2 }));
    expect(e.fixos.map((f) => f.id)).toEqual(['heat-furnace#1', 'heat-furnace#2', 'cooling-unit#1', 'sunlamp#1', 'armazem#1', 'armazem#2']);
    expect(e.fixos.filter((f) => f.tipo === 'armazem').every((f) => f.aptidao === 'hauling')).toBe(true);
    expect(entradaDaEquipe(dados, 3, 'dinheiro', opcoes(3)).fixos.map((f) => f.id)).toEqual(['armazem#1']);
  });

  it('equipe dos lotes: 1 Aniimo por tarefa para cada 8 lotes, ou o que o jogador fixar', () => {
    expect(LOTES_POR_ANIIMO).toBe(8);
    const e = entradaDaEquipe(dados, 20, 'dinheiro', opcoes(20, { lotes: 17, equipeLotes: { grass: 1 } }));
    expect(new Set(e.tarefas.map((t) => t.aptidao))).toEqual(new Set(['rock', 'grass', 'dark', 'water']));
    expect(e.tarefas.find((t) => t.aptidao === 'rock')).toMatchObject({ quantidade: 3, manual: false });
    expect(e.tarefas.find((t) => t.aptidao === 'grass')).toMatchObject({ quantidade: 1, manual: true });
    expect(e.tarefas.find((t) => t.aptidao === 'water')!.etapas).toEqual(['Watering']);
    expect(entradaDaEquipe(dados, 20, 'dinheiro', opcoes(20, { lotes: 0 })).tarefas).toEqual([]);
  });

  it('o limite é o do Lar, ou menos se o jogador pedir', () => {
    expect(entradaDaEquipe(dados, 14, 'dinheiro', opcoes(14)).limite).toBe(dados.aniimoPorRv[13]);
    expect(entradaDaEquipe(dados, 14, 'dinheiro', opcoes(14, { aniimoAUsar: 20 })).limite).toBe(20);
    expect(entradaDaEquipe(dados, 14, 'dinheiro', opcoes(14, { aniimoAUsar: 99 })).limite).toBe(dados.aniimoPorRv[13]);
    expect(entradaDaEquipe(dados, 1, 'dinheiro', opcoes(1)).limite).toBeNull();
  });

  it('a oferta dos lotes e os preços entram por família de produto', () => {
    const e = entradaDaEquipe(dados, 14, 'dinheiro', opcoes(14));
    expect(e.oferta).toEqual({ wheat: 10 });
    expect(e.precos['tanghulu']).toBe(dados.produtos.find((p) => p.chave === 'tanghulu')!.venda);
    expect(Object.keys(e.precos).some((k) => /^(quick|premium)_/.test(k))).toBe(false);
    // Moedas que não são do Lar não contam.
    expect(e.precos['aniipod']).toBeUndefined();
  });

  it('metas: no foco Nível, os itens que o próximo RV custa; nos outros focos, nenhuma', () => {
    expect(entradaDaEquipe(dados, 14, 'dinheiro', opcoes(14))).toMatchObject({ metas: [], tetoDoRitmo: null });
    const e = entradaDaEquipe(dados, 14, 'nivel', opcoes(14));
    expect(e.metas).toEqual(dados.custoPorRv[14]!.itens.map((i) => ({ produto: i.produto, peso: i.quantidade })));
    expect(e.tetoDoRitmo).toBeNull();
    expect(entradaDaEquipe(dados, 20, 'nivel', opcoes(20)).metas).toEqual([]);
  });

  it('metas: no foco Festival, os pratos do banquete que dá para fazer, no ritmo do prazo', () => {
    const comFesta = comFestival(dados);
    const antes = entradaDaEquipe(comFesta, 20, 'festival', opcoes(20, { hoje: new Date(2026, 9, 11) }));
    expect(antes.metas.map((m) => m.produto).sort()).toEqual(['harvest_platter', 'lavender_cookies', 'maple_candy_apple_jam', 'tanghulu', 'umbral_casserole', 'umbral_pickle']);
    // 5 de cada até o fim do dia 16: 6 dias.
    expect(antes.metas[0]!.peso).toBeCloseTo(5 / (6 * 24), 6);
    expect(antes.tetoDoRitmo).toBe(1);
    expect(entradaDaEquipe(comFesta, 20, 'festival', opcoes(20, { hoje: new Date(2026, 9, 20) })).metas).toEqual([]);
  });
});

describe('velocidade', () => {
  it('100% no nível da receita; acima, mais rápido; abaixo ou sem a aptidão, não trabalha', () => {
    expect(velocidade('processamento', 2, 2)).toBe(1);
    expect(velocidade('processamento', 2, 1)).toBe(3);
    expect(velocidade('processamento', 4, 1)).toBe(5);
    expect(velocidade('outro', 4, 3)).toBe(2);
    expect(velocidade('outro', 3, 1)).toBe(2);
    expect(velocidade('processamento', 1, 2)).toBe(0);
    expect(velocidade('outro', 0, 1)).toBe(0);
  });
});

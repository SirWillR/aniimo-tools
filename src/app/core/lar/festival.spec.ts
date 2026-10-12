import json from '../../../assets/data/lar-construcao.json';
import { COLHEITAS_POR_DIA, FESTIVAL, PRODUTOS_DO_FESTIVAL, RECEITAS_DO_FESTIVAL, comFestival, coringasSugeridas, festivalAtivo, pratosDoBanquete, sementesPorDia, usoDasCoringas } from './festival';
import { rvDoProduto } from './liberacao';
import type { DadosConstrucao } from './modelos-lar';

const dados = json as unknown as DadosConstrucao;

describe('festivalAtivo', () => {
  it('vale do primeiro ao último dia, inclusive', () => {
    expect(festivalAtivo(new Date(2026, 8, 15, 23, 59))).toBe(false);
    expect(festivalAtivo(new Date(2026, 8, 16))).toBe(true);
    expect(festivalAtivo(new Date(2026, 9, 10))).toBe(true);
    expect(festivalAtivo(new Date(2026, 9, 27, 23, 59))).toBe(true);
    expect(festivalAtivo(new Date(2026, 9, 28))).toBe(false);
  });
});

describe('coringasSugeridas', () => {
  it('600 Trigo do Luar compram 150 sementes; a 40 min cada, com os Aniimo replantando, 5 Fazendas bastam', () => {
    expect(sementesPorDia(600)).toBe(150);
    expect(COLHEITAS_POR_DIA).toBe(36);
    expect(coringasSugeridas(600, 40)).toBe(5);
  });

  it('nunca passa das Fazendas que o jogador tem', () => {
    expect(coringasSugeridas(600, 3)).toBe(3);
    expect(coringasSugeridas(600, 0)).toBe(0);
  });
});

describe('usoDasCoringas', () => {
  it('5 coringas plantam as 150 sementes do dia, ocupadas 83% do tempo', () => {
    const r = usoDasCoringas(600, 5)!;
    expect(r).toMatchObject({ sementes: 150, sobram: 0 });
    expect(r.ocupacao).toBeCloseTo(150 / 180, 6);
  });

  it('coringas de menos: plantam sem parar e ainda sobram sementes', () => {
    expect(usoDasCoringas(600, 2)).toEqual({ sementes: 72, sobram: 78, ocupacao: 1 });
  });

  it('coringas de mais: ficam paradas boa parte do tempo', () => {
    expect(usoDasCoringas(600, 19)!.ocupacao).toBeCloseTo(150 / (19 * 36), 6);
  });

  it('sem coringas, nada a calcular', () => {
    expect(usoDasCoringas(600, 0)).toBeNull();
  });
});

const doFestival = new Set(RECEITAS_DO_FESTIVAL.map((r) => r.chave));

describe('Grande Banquete', () => {
  it('três pratos são receitas comuns do Lar e três são do festival', () => {
    const chaves = new Set(dados.produtos.map((p) => p.chave));
    const comuns = FESTIVAL.banquete.pratos.filter((p) => !doFestival.has(p.chave));
    expect(comuns).toHaveLength(3);
    for (const p of comuns) expect(chaves.has(p.chave), p.nome).toBe(true);
    expect(FESTIVAL.banquete.pratos).toHaveLength(6);
  });
});

describe('receitas do festival', () => {
  const d = comFestival(dados);
  const porChave = new Map(d.produtos.map((p) => [p.chave, p]));

  it('só entram com comFestival, uma vez', () => {
    expect(dados.produtos.some((p) => doFestival.has(p.chave))).toBe(false);
    expect(d.produtos).toHaveLength(dados.produtos.length + PRODUTOS_DO_FESTIVAL.length);
    expect(comFestival(d)).toBe(d);
  });

  it('toda máquina e todo ingrediente existem nos dados', () => {
    const construcoes = new Set(dados.construcoes.map((c) => c.chave));
    for (const r of RECEITAS_DO_FESTIVAL) {
      expect(construcoes.has(r.construcao), r.chave).toBe(true);
      for (const i of r.ingredientes) expect(porChave.has(i.produto), `${r.chave} ← ${i.produto}`).toBe(true);
    }
  });

  it('o Aniimo da receita tem a aptidão da máquina', () => {
    for (const r of RECEITAS_DO_FESTIVAL) expect(r.aniimo?.aptidao, r.chave).toBe(dados.construcoes.find((c) => c.chave === r.construcao)!.aptidao);
  });

  it('os totais do banquete batem com os insumos que a fonte soma', () => {
    const pratos = new Set<string>(FESTIVAL.banquete.pratos.map((p) => p.chave));
    const total = new Map<string, number>();
    const somar = (chave: string, vezes: number) => {
      for (const i of porChave.get(chave)!.ingredientes) {
        if (doFestival.has(i.produto)) somar(i.produto, vezes * i.quantidade);
        else total.set(i.produto, (total.get(i.produto) ?? 0) + vezes * i.quantidade);
      }
    };
    for (const r of RECEITAS_DO_FESTIVAL) if (pratos.has(r.chave)) somar(r.chave, FESTIVAL.banquete.porPrato);
    expect(total.get('sea_salt')).toBe(115);
    expect(total.get('fresh_water')).toBe(40);
    expect(total.get('cider_vinegar')).toBe(5);
    expect(total.get('rock_candy')).toBe(5);
  });

  it('todas têm carga de trabalho e preço (capturas do usuário)', () => {
    for (const r of RECEITAS_DO_FESTIVAL) {
      expect(r.trabalho, r.chave).toBeGreaterThan(0);
      expect(r.venda, r.chave).toBeGreaterThan(0);
    }
  });
});

describe('pratosDoBanquete', () => {
  it('RV 20: os três pratos comuns liberados, com as culturas que pedem', () => {
    const r = pratosDoBanquete(dados, 20);
    expect(r).toHaveLength(6);
    const porChave = new Map(r.map((p) => [p.prato.chave, p]));
    expect(porChave.get('tanghulu')!.liberado).toBe(true);
    expect(porChave.get('tanghulu')!.culturas).toContain('strawberry');
    expect(porChave.get('maple_candy_apple_jam')!.culturas).toEqual(['apple', 'maple_syrup']);
    expect(porChave.get('lavender_cookies')!.culturas).toEqual(['lavender', 'wheat']);
  });

  it('RV 1: os pratos comuns ainda fechados dizem quando liberam e o que vão pedir', () => {
    for (const p of pratosDoBanquete(dados, 1)) {
      expect(p.liberado, p.prato.nome).toBe(false);
      expect(p.rvLibera, p.prato.nome).toBeGreaterThan(1);
      if (!p.doFestival) expect(p.culturas.length, p.prato.nome).toBeGreaterThan(0);
    }
  });

  it('os pratos do festival pedem as sementes dele, que não contam como cultura', () => {
    const r = new Map(pratosDoBanquete(dados, 20).map((p) => [p.prato.chave, p]));
    expect(r.get('umbral_pickle')).toMatchObject({ doFestival: true, liberado: true, culturas: ['apple'], sementes: ['crescent_pepper', 'moon_radish'] });
    expect(r.get('umbral_casserole')).toMatchObject({ doFestival: true, liberado: true, culturas: [], sementes: ['crescent_pepper', 'moon_radish'] });
    expect(r.get('harvest_platter')).toMatchObject({ doFestival: true, liberado: true, sementes: ['crescent_pepper', 'moon_radish'] });
    expect(r.get('tanghulu')).toMatchObject({ doFestival: false, sementes: [] });
  });

  it('o prato só libera quando o que ele pede também libera', () => {
    // A Conserva é do nível 1 do Pote de Conservas, mas pede o Vinagre de Cidra, do nível 2.
    const d = comFestival(dados);
    const vinagre = rvDoProduto(d.produtos.find((p) => p.chave === 'cider_vinegar')!, d)!;
    const pote = d.construcoes.find((c) => c.chave === 'pickling-jar')!.nivelPorRv.findIndex((n) => n >= 1) + 1;
    expect(vinagre).toBeGreaterThan(pote);
    const conserva = (rv: number) => pratosDoBanquete(dados, rv).find((p) => p.prato.chave === 'umbral_pickle')!;
    expect(conserva(pote)).toMatchObject({ liberado: false, rvLibera: vinagre });
    expect(conserva(vinagre).liberado).toBe(true);
  });
});

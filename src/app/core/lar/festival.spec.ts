import json from '../../../assets/data/lar-construcao.json';
import { FESTIVAL, MAX_PLANTIOS_POR_DIA, coringasSugeridas, festivalAtivo, plantiosNecessarios, pratosDoBanquete, sementesPorDia } from './festival';
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
  it('600 Trigo do Luar compram 150 sementes; com 8 plantios por dia, 19 Fazendas', () => {
    expect(sementesPorDia(600)).toBe(150);
    expect(coringasSugeridas(600, 8, 40)).toBe(19);
  });

  it('replantando sem parar (36 ciclos de 40 min), 5 Fazendas bastam', () => {
    expect(MAX_PLANTIOS_POR_DIA).toBe(36);
    expect(coringasSugeridas(600, 36, 40)).toBe(5);
    expect(coringasSugeridas(600, 99, 40)).toBe(5);
  });

  it('nunca passa das Fazendas que o jogador tem', () => {
    expect(coringasSugeridas(600, 1, 40)).toBe(40);
    expect(coringasSugeridas(600, 8, 6)).toBe(6);
  });

  it('plantios inválidos contam como 1', () => {
    expect(coringasSugeridas(600, 0, 200)).toBe(150);
    expect(coringasSugeridas(600, Number.NaN, 200)).toBe(150);
  });
});

describe('plantiosNecessarios', () => {
  it('19 coringas: 8 plantios por dia, um a cada 3 h', () => {
    expect(plantiosNecessarios(600, 19)).toEqual({ plantios: 8, intervaloMin: 180, sementes: 150 });
  });

  it('150 coringas ou mais: um plantio por dia', () => {
    expect(plantiosNecessarios(600, 150)!.plantios).toBe(1);
    expect(plantiosNecessarios(600, 400)!.plantios).toBe(1);
  });

  it('coringas de menos: replantando sem parar, só parte das sementes', () => {
    expect(plantiosNecessarios(600, 2)).toEqual({ plantios: 36, intervaloMin: 40, sementes: 72 });
  });

  it('sem coringas, nada a calcular', () => {
    expect(plantiosNecessarios(600, 0)).toBeNull();
  });
});

describe('Grande Banquete', () => {
  it('os pratos com chave existem nos dados do Lar', () => {
    const chaves = new Set(dados.produtos.map((p) => p.chave));
    const comChave = FESTIVAL.banquete.pratos.filter((p) => p.chave);
    expect(comChave).toHaveLength(3);
    for (const p of comChave) expect(chaves.has(p.chave!), p.nome).toBe(true);
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
    for (const p of pratosDoBanquete(dados, 1).filter((x) => x.prato.chave)) {
      expect(p.liberado, p.prato.nome).toBe(false);
      expect(p.rvLibera, p.prato.nome).toBeGreaterThan(1);
      expect(p.culturas.length, p.prato.nome).toBeGreaterThan(0);
    }
  });

  it('os pratos do festival não têm receita', () => {
    const doFestival = pratosDoBanquete(dados, 20).filter((p) => !p.prato.chave);
    expect(doFestival).toHaveLength(3);
    for (const p of doFestival) expect(p).toMatchObject({ produto: null, liberado: false, culturas: [] });
  });
});

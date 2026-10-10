import { TestBed } from '@angular/core/testing';
import json from '../../../assets/data/lar-construcao.json';
import catalogo from '../../../assets/data/lar-enfeites.json';
import { CALCADA, USOS, decoracaoInvade, slugsUsados } from './decoracao';
import { contem, expandir, sobrepoe, uniao } from './geometria';
import type { DadosConstrucao, DadosEnfeites } from './modelos-lar';
import { type ItemMapa, plantaDoLar } from './planta';
import { MapaSimbolos } from '../../shared/mapa-lar/mapa-simbolos';

const dados = json as unknown as DadosConstrucao;
const enfeites = (catalogo as unknown as DadosEnfeites).enfeites;
type Decoracao = Extract<ItemMapa, { tipo: 'decoracao' }>;
const decoracoes = (itens: readonly ItemMapa[]) => itens.filter((i): i is Decoracao => i.tipo === 'decoracao');

describe('catálogo de enfeites', () => {
  it('todo enfeite tem desenho, tamanho e ao menos um uso conhecido', () => {
    const simbolos: HTMLElement = TestBed.createComponent(MapaSimbolos).nativeElement;
    for (const e of enfeites) {
      expect(simbolos.querySelector(`symbol#ml-${e.forma}`), e.slug).not.toBeNull();
      expect(e.largura > 0 && e.altura > 0, e.slug).toBe(true);
      expect(e.usos.length, e.slug).toBeGreaterThan(0);
      for (const u of e.usos) expect(USOS).toContain(u);
    }
  });

  it('ids e slugs não se repetem, e todo uso tem ao menos um item', () => {
    expect(new Set(enfeites.map((e) => e.id)).size).toBe(enfeites.length);
    expect(new Set(enfeites.map((e) => e.slug)).size).toBe(enfeites.length);
    for (const u of USOS) expect(enfeites.some((e) => e.usos.includes(u)), u).toBe(true);
  });

  it('todo item que o motor de decoração usa existe no catálogo', () => {
    const slugs = new Set(enfeites.map((e) => e.slug));
    expect([...slugsUsados()].filter((s) => !slugs.has(s))).toEqual([]);
  });
});

describe('decoração da planta', () => {
  for (const equilibrio of ['equilibrado', 'bonito'] as const)
    describe(equilibrio, () => {
      const p = plantaDoLar(dados, 20, { enfeites, equilibrio, armazens: 3, chocadeiras: 4, rvCulturas: 20 });
      const enfeitados = decoracoes(p.itens);

      it('põe enfeites em todos os terrenos com tema', () => {
        for (const t of p.terrenos) if (t.tema) expect(enfeitados.some((d) => d.terreno === t.n), `terreno ${t.n}`).toBe(true);
      });

      it('nenhum enfeite invade construção ou pátio, sai do terreno ou sobrepõe outro', () => {
        const funcionais = p.itens.filter((i) => i.tipo === 'construcao' || i.tipo === 'piso').map((i) => i.area);
        expect(decoracaoInvade(p.itens, funcionais)).toBe(false);
        // Dentro do seu terreno; no jardim grande, dentro dos dois terrenos unidos.
        for (const d of enfeitados) {
          const t = p.terrenos[d.terreno - 1]!;
          const area = t.unidoA ? uniao([t.area, p.terrenos[t.unidoA - 1]!.area]) : t.area;
          expect(contem(area, d.area)).toBe(true);
        }
        for (let i = 0; i < enfeitados.length; i++)
          for (let j = i + 1; j < enfeitados.length; j++) expect(sobrepoe(enfeitados[i]!.area, enfeitados[j]!.area)).toBe(false);
      });

      it('fora a cerca, os enfeites deixam meio tile de respiro em volta das construções', () => {
        const construcoes = p.itens.filter((i) => i.tipo === 'construcao').map((i) => expandir(i.area, 0.5));
        const semCerca = enfeitados.filter((d) => d.forma !== 'cerca-jardim');
        expect(decoracaoInvade(semCerca, construcoes)).toBe(false);
      });

      it('todo terreno sem construção vira jardim: um jardim grande em dois terrenos e os outros avulsos', () => {
        expect(p.terrenos.every((t) => t.tema)).toBe(true);
        const tipos = p.terrenos.filter((t) => t.tema === 'jardim').map((t) => t.jardim);
        expect(tipos.filter((t) => t === 'jardinagem')).toHaveLength(2);
        expect(tipos).toContain('lazer');
      });

      it('o jardim grande une dois terrenos lado a lado, sem rua no meio e com enfeites cruzando a divisa', () => {
        const [a, b] = p.terrenos.filter((t) => t.jardim === 'jardinagem').sort((x, y) => x.coluna - y.coluna);
        expect([a!.unidoA, b!.unidoA]).toEqual([b!.n, a!.n]);
        expect([b!.linha, b!.coluna]).toEqual([a!.linha, a!.coluna + 1]);
        const divisa = { x: b!.area.x - CALCADA, y: a!.area.y + CALCADA, largura: 2 * CALCADA, altura: a!.area.altura - 2 * CALCADA };
        expect(p.itens.some((i) => i.tipo === 'caminho' && sobrepoe(i.area, divisa))).toBe(false);
        expect(enfeitados.some((d) => d.area.x < b!.area.x && d.area.x + d.area.largura > b!.area.x && sobrepoe(d.area, divisa))).toBe(true);
      });

      it('os caminhos dos jardins chegam à rua nos quatro lados', () => {
        const chao = enfeitados.filter((d) => d.forma === 'cascalho-chao' || d.forma === 'laje');
        for (const t of p.terrenos.filter((x) => x.tema === 'jardim')) {
          const area = t.unidoA ? uniao([t.area, p.terrenos[t.unidoA - 1]!.area]) : t.area;
          const toca = (lado: { x: number; y: number; largura: number; altura: number }) => chao.some((d) => sobrepoe(d.area, lado));
          const faixa = 1.5;
          expect(toca({ x: area.x, y: area.y, largura: faixa, altura: area.altura }) || t.jardim === 'lago', `oeste do ${t.n}`).toBe(true);
          expect(toca({ x: area.x + area.largura - faixa, y: area.y, largura: faixa, altura: area.altura }), `leste do ${t.n}`).toBe(true);
          expect(toca({ x: area.x, y: area.y, largura: area.largura, altura: faixa + 0.5 }), `norte do ${t.n}`).toBe(true);
          expect(toca({ x: area.x, y: area.y + area.altura - faixa - 0.5, largura: area.largura, altura: faixa + 0.5 }), `sul do ${t.n}`).toBe(true);
        }
      });

      it('só chão e cerca ficam em cima da calçada', () => {
        const ruas = p.itens.filter((i) => i.tipo === 'caminho').map((i) => i.area);
        const outros = enfeitados.filter((d) => !['cascalho-chao', 'laje', 'cerca-jardim'].includes(d.forma));
        expect(decoracaoInvade(outros, ruas)).toBe(false);
      });

      it('cada enfeite aponta para um item do catálogo, com o tamanho e o RV dele', () => {
        const porId = new Map(enfeites.map((e) => [e.id, e]));
        for (const d of enfeitados) {
          const e = porId.get(d.enfeite)!;
          expect(e).toBeDefined();
          expect([d.area.largura, d.area.altura].sort()).toEqual([e.largura, e.altura].sort());
          expect(d.rv).toBe(e.rv);
        }
      });

      it('é determinística', () => {
        expect(plantaDoLar(dados, 20, { enfeites, equilibrio, armazens: 3, chocadeiras: 4, rvCulturas: 20 })).toEqual(p);
      });
    });

  it('todo terreno em uso tem calçada na borda, e nenhuma construção nem pátio fica em cima dela', () => {
    for (const opcoes of [{}, { enfeites, armazens: 12, chocadeiras: 20 }]) {
      const p = plantaDoLar(dados, 20, opcoes);
      const ruas = p.itens.filter((i) => i.tipo === 'caminho').map((i) => i.area);
      for (const t of p.terrenos.filter((x) => x.tema)) {
        const topo = { x: t.area.x, y: t.area.y, largura: t.area.largura, altura: CALCADA };
        expect(ruas.some((r) => contem(r, topo)), `terreno ${t.n}`).toBe(true);
      }
      for (const i of p.itens) if (i.tipo === 'construcao' || i.tipo === 'piso') expect(ruas.some((r) => sobrepoe(r, i.area))).toBe(false);
    }
  });

  it('no RV 20 sobram quatro terrenos: o jardim grande em dois, o lazer e a praça', () => {
    const p = plantaDoLar(dados, 20, { enfeites });
    expect(p.terrenos.filter((t) => t.tema === 'jardim').map((t) => t.jardim).sort()).toEqual(['jardinagem', 'jardinagem', 'lazer', 'praca']);
  });

  it('em "eficiente", ou sem catálogo, não há enfeites nem jardins', () => {
    for (const opcoes of [{ enfeites, equilibrio: 'eficiente' as const }, {}]) {
      const p = plantaDoLar(dados, 20, opcoes);
      expect(decoracoes(p.itens)).toEqual([]);
      expect(p.terrenos.some((t) => t.tema === 'jardim')).toBe(false);
    }
  });

  it('"bonito" tem mais enfeites que "equilibrado" e cerca os terrenos de cultivo', () => {
    const conta = (equilibrio: 'equilibrado' | 'bonito') => decoracoes(plantaDoLar(dados, 20, { enfeites, equilibrio }).itens);
    expect(conta('bonito').length).toBeGreaterThan(conta('equilibrado').length);
    expect(conta('bonito').some((d) => d.forma === 'cerca-jardim')).toBe(true);
    expect(conta('equilibrado').some((d) => d.forma === 'cerca-jardim')).toBe(false);
  });

  it('o controle e o catálogo não mexem em construções, pátios nem terrenos produtivos', () => {
    const fixos = (opcoes: Parameters<typeof plantaDoLar>[2]) =>
      JSON.stringify(plantaDoLar(dados, 20, { armazens: 2, ...opcoes }).itens.filter((i) => i.tipo === 'construcao' || i.tipo === 'piso'));
    const base = fixos({});
    for (const equilibrio of ['eficiente', 'equilibrado', 'bonito'] as const) expect(fixos({ enfeites, equilibrio })).toBe(base);
  });

  it('num RV baixo, só os terrenos já abertos viram jardim', () => {
    const p = plantaDoLar(dados, 6, { enfeites });
    for (const t of p.terrenos) if (t.tema === 'jardim') expect(t.rv).toBeLessThanOrEqual(6);
    for (const d of decoracoes(p.itens)) expect(p.terrenos[d.terreno - 1]!.rv).toBeLessThanOrEqual(6);
  });
});

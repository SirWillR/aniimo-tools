import { TestBed } from '@angular/core/testing';
import json from '../../../assets/data/lar-construcao.json';
import catalogo from '../../../assets/data/lar-enfeites.json';
import { USOS, decoracaoInvade, slugsUsados } from './decoracao';
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
        // Só o que foi posto de propósito fica em cima do chão do jardim (o gazebo no largo, a fonte na praça).
        const chao = (d: (typeof enfeitados)[number]) => d.forma === 'cascalho-chao' || d.forma === 'laje';
        for (let i = 0; i < enfeitados.length; i++)
          for (let j = i + 1; j < enfeitados.length; j++)
            if (chao(enfeitados[i]!) === chao(enfeitados[j]!)) expect(sobrepoe(enfeitados[i]!.area, enfeitados[j]!.area)).toBe(false);
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
      });

      it('o jardim grande une dois terrenos lado a lado, sem rua no meio e com enfeites cruzando a divisa', () => {
        const [a, b] = p.terrenos.filter((t) => t.jardim === 'jardinagem').sort((x, y) => x.coluna - y.coluna);
        expect([a!.unidoA, b!.unidoA]).toEqual([b!.n, a!.n]);
        expect([b!.linha, b!.coluna]).toEqual([a!.linha, a!.coluna + 1]);
        // O miolo da divisa, longe da rua de cima e da de baixo.
        const divisa = { x: b!.area.x - 2, y: a!.area.y + 4, largura: 4, altura: a!.area.altura - 8 };
        expect(p.itens.some((i) => i.tipo === 'caminho' && sobrepoe(i.area, divisa))).toBe(false);
        expect(enfeitados.some((d) => d.area.x < b!.area.x && d.area.x + d.area.largura > b!.area.x && sobrepoe(d.area, divisa))).toBe(true);
      });

      it('os caminhos dos jardins encostam na rua nos quatro lados, sem fresta', () => {
        const ruas = p.itens.filter((i) => i.tipo === 'caminho').map((i) => i.area);
        for (const t of p.terrenos.filter((x) => x.tema === 'jardim')) {
          const area = t.unidoA ? uniao([t.area, p.terrenos[t.unidoA - 1]!.area]) : t.area;
          const chao = enfeitados.filter((d) => (d.forma === 'cascalho-chao' || d.forma === 'laje') && contem(area, d.area)).map((d) => d.area);
          // Uma peça do jardim com um lado inteiro colado numa peça da rua.
          const colada = (lado: 'oeste' | 'leste' | 'norte' | 'sul') =>
            chao.some((d) =>
              ruas.some((r) => {
                const naLinha = r.y < d.y + d.altura && r.y + r.altura > d.y;
                const naColuna = r.x < d.x + d.largura && r.x + r.largura > d.x;
                if (lado === 'oeste') return naLinha && r.x + r.largura === d.x;
                if (lado === 'leste') return naLinha && r.x === d.x + d.largura;
                if (lado === 'norte') return naColuna && r.y + r.altura === d.y;
                return naColuna && r.y === d.y + d.altura;
              }),
            );
          expect(colada('oeste') || t.jardim === 'lago', `oeste do ${t.n}`).toBe(true);
          for (const lado of ['leste', 'norte', 'sul'] as const) expect(colada(lado), `${lado} do ${t.n}`).toBe(true);
        }
      });

      it('só a cerca fica em cima da rua; o chão dos jardins não se sobrepõe às peças dela', () => {
        const ruas = p.itens.filter((i) => i.tipo === 'caminho').map((i) => i.area);
        expect(decoracaoInvade(enfeitados.filter((d) => d.forma !== 'cerca-jardim'), ruas)).toBe(false);
      });

      it('todo piso é feito de peças de 2×2 inteiras', () => {
        const pisos = [...p.itens.filter((i) => i.tipo === 'caminho' || i.tipo === 'piso'), ...enfeitados.filter((d) => d.forma === 'cascalho-chao' || d.forma === 'laje')];
        expect(pisos.length).toBeGreaterThan(0);
        for (const i of pisos) expect([i.area.largura, i.area.altura]).toEqual([2, 2]);
        for (let i = 0; i < pisos.length; i++)
          for (let j = i + 1; j < pisos.length; j++) expect(sobrepoe(pisos[i]!.area, pisos[j]!.area)).toBe(false);
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

  it('há rua na divisa entre duas áreas diferentes e não entre terrenos do mesmo tema; nada construído fica em cima dela', () => {
    for (const opcoes of [{}, { enfeites, armazens: 12, chocadeiras: 20 }]) {
      const p = plantaDoLar(dados, 20, opcoes);
      const ruas = p.itens.filter((i) => i.tipo === 'caminho').map((i) => i.area);
      let unidos = 0;
      for (const a of p.terrenos)
        for (const b of p.terrenos) {
          const aoLado = b.linha === a.linha && b.coluna === a.coluna + 1;
          const abaixo = b.coluna === a.coluna && b.linha === a.linha + 1;
          if ((!aoLado && !abaixo) || (!a.tema && !b.tema)) continue;
          // O miolo da divisa, longe dos cruzamentos: 2 tiles para cada lado dela.
          const miolo = aoLado
            ? { x: b.area.x - 2, y: a.area.y + 4, largura: 4, altura: a.area.altura - 8 }
            : { x: a.area.x + 4, y: b.area.y - 2, largura: a.area.largura - 8, altura: 4 };
          const mesmaArea = a.tema === b.tema && (a.tema !== 'jardim' || a.unidoA === b.n);
          if (mesmaArea) unidos++;
          expect(ruas.some((r) => sobrepoe(r, miolo)), `entre ${a.n} e ${b.n}`).toBe(!mesmaArea);
        }
      expect(unidos).toBeGreaterThan(0);
      for (const i of p.itens) if (i.tipo === 'construcao' || i.tipo === 'piso') expect(ruas.some((r) => sobrepoe(r, i.area))).toBe(false);
    }
  });

  it('o tabuleiro tem rua em toda a borda, encostada nela', () => {
    const p = plantaDoLar(dados, 20, { enfeites });
    const ruas = p.itens.filter((i) => i.tipo === 'caminho').map((i) => i.area);
    const coberto = (x: number, y: number) => ruas.some((r) => x >= r.x && x < r.x + r.largura && y >= r.y && y < r.y + r.altura);
    for (let x = 0.5; x < p.largura; x++) expect(coberto(x, 0.5) && coberto(x, p.altura - 0.5), `x=${x}`).toBe(true);
    for (let y = 0.5; y < p.altura; y++) expect(coberto(0.5, y) && coberto(p.largura - 0.5, y), `y=${y}`).toBe(true);
  });

  it('terrenos de cultivo vizinhos formam uma área de fazenda só: os lotes vão até a divisa', () => {
    const p = plantaDoLar(dados, 20);
    const cultivo = p.blocos.filter((b) => b.tipo === 'cultivo');
    const pares = cultivo.flatMap((a) => cultivo.filter((b) => b.area.y === a.area.y && b.area.x === a.area.x + a.area.largura).map((b) => [a, b] as const));
    expect(pares.length).toBeGreaterThan(0);
    for (const [a, b] of pares) {
      const [ra, rb] = [a.regioes![0]!, b.regioes![0]!];
      // Entre as duas malhas não sobra espaço para um lote (2 tiles).
      expect(rb.x - (ra.x + ra.largura)).toBeLessThan(2);
    }
  });

  it('no RV 20 sobram três terrenos: o jardim grande em dois e o lazer', () => {
    const p = plantaDoLar(dados, 20, { enfeites });
    expect(p.terrenos.filter((t) => t.tema === 'jardim').map((t) => t.jardim).sort()).toEqual(['jardinagem', 'jardinagem', 'lazer']);
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

import json from '../../../assets/data/lar-construcao.json';
import { type FonteAmbiente, type Retangulo, cobertura, condicaoDoLote, contem, quadrado, sobrepoe } from './geometria';
import { inventario } from './inventario';
import { liberacaoPorItem, rvDoProduto } from './liberacao';
import { familia } from './sugestao';
import type { DadosConstrucao } from './modelos-lar';
import { AMBIENTES_NA_PLANTA, type ItemMapa, type PlantaLar, plantaDoLar } from './planta';
import { ALTURA_TERRENO, LARGURA_TERRENO, TERRENOS, areaDoTerreno, terreno } from './terrenos';

const dados = json as unknown as DadosConstrucao;
const regras = dados.regras;
type Construcao = Extract<ItemMapa, { tipo: 'construcao' }>;
const construcoes = (itens: readonly ItemMapa[]) => itens.filter((i): i is Construcao => i.tipo === 'construcao');
/** Quantas unidades de uma construção a planta usa: o que o RV libera, com os ambientes limitados ao que serve. */
const naPlanta = (chave: string, liberadas: number) => Math.min(liberadas, AMBIENTES_NA_PLANTA[chave] ?? Infinity);
const eLote = (c: Construcao) => c.construcao === 'farmland' || c.construcao === 'woodland';
/** A sub-região de cultivo onde o lote está (inteiro). */
const regiaoDe = (p: PlantaLar, area: Retangulo) => p.blocos.flatMap((b) => b.regioes ?? []).find((r) => contem(r, area));

describe('geometria', () => {
  const fornalha = (modo: 'warm' | 'scorching' = 'scorching'): FonteAmbiente => ({ area: cobertura(quadrado(0, 0, 1), regras.raioCobertura), modo });

  it('a cobertura é 9×9 centrada na construção', () => {
    expect(cobertura(quadrado(0, 0, 1), 4.5)).toEqual({ x: -4, y: -4, largura: 9, altura: 9 });
    // Resfriador 2×2: centro no meio, cobertura fica meio tile fora da grade.
    expect(cobertura(quadrado(0, 0, 2), 4.5)).toEqual({ x: -3.5, y: -3.5, largura: 9, altura: 9 });
  });

  it('encostar na borda ou na quina não conta como coberto', () => {
    expect(condicaoDoLote(quadrado(5, 0, 2), [fornalha()], regras)).toBeNull(); // borda
    expect(condicaoDoLote(quadrado(5, 5, 2), [fornalha()], regras)).toBeNull(); // quina
    expect(condicaoDoLote(quadrado(4.5, 4.5, 2), [fornalha()], regras)).toBe('scorching'); // ¼ de área basta
  });

  it('as temperaturas se somam onde Fornalha e Resfriador se sobrepõem', () => {
    const resfriador: FonteAmbiente = { area: cobertura(quadrado(8, 1, 2), regras.raioCobertura), modo: 'cool' };
    const fontes = [fornalha('scorching'), resfriador];
    expect(condicaoDoLote(quadrado(-2, 0, 2), fontes, regras)).toBe('scorching');
    expect(condicaoDoLote(quadrado(4, 0, 2), fontes, regras)).toBe('warm'); // +2 −1
    expect(condicaoDoLote(quadrado(10, 0, 2), fontes, regras)).toBe('cool');
  });
});

describe('inventario', () => {
  it('segue as quantidades por RV do aniimax', () => {
    const qtd = (rv: number, chave: string) => inventario(dados, rv).itens.find((i) => i.construcao.chave === chave)?.quantidade ?? 0;
    expect(qtd(1, 'farmland')).toBe(4);
    expect(qtd(1, 'woodland')).toBe(0);
    expect(qtd(2, 'woodland')).toBe(3);
    expect(qtd(7, 'heat-furnace')).toBe(1);
    expect(qtd(12, 'heat-furnace')).toBe(2);
  });

  it('acima do RV 13 usa as quantidades do Aniidex, que batem com o jogo (RV 14: 3 Poços, 3 Fornos com Chaminé, 3 Bancadas)', () => {
    const qtd = (rv: number, chave: string) => inventario(dados, rv).itens.find((i) => i.construcao.chave === chave)?.quantidade ?? 0;
    expect([qtd(14, 'well'), qtd(14, 'chimney-kiln'), qtd(14, 'woodworking-bench')]).toEqual([3, 3, 3]);
    expect([qtd(13, 'well'), qtd(13, 'chimney-kiln'), qtd(13, 'woodworking-bench')]).toEqual([2, 2, 2]);
    expect([qtd(20, 'well'), qtd(20, 'chimney-kiln'), qtd(20, 'woodworking-bench')]).toEqual([4, 4, 4]);
    expect([qtd(20, 'heat-furnace'), qtd(20, 'cooling-unit'), qtd(20, 'sunlamp')]).toEqual([3, 3, 3]);
  });

  it('no RV 20 usa as quantidades vistas no jogo (40 Fazendas, 20 Bosques, 10 Minas)', () => {
    const qtd = (chave: string) => inventario(dados, 20).itens.find((i) => i.construcao.chave === chave)?.quantidade;
    expect([qtd('farmland'), qtd('woodland'), qtd('mine')]).toEqual([40, 20, 10]);
  });

  it('as quantidades valem para todos os RVs (a fonte cobre até o máximo)', () => {
    expect(dados.rvVerificado).toBe(dados.rvMaximo);
    expect(inventario(dados, dados.rvMaximo).verificado).toBe(true);
  });

  it('só libera produtos do nível da instalação e sem receitas especiais', () => {
    const inv = inventario(dados, 1);
    expect(inv.produtos.every((p) => p.construcao === 'farmland' && p.nivel === 1 && !p.especial)).toBe(true);
  });
});

describe('plantaDoLar', () => {
  for (const rv of [1, 2, 7, 12, 20]) {
    describe(`RV ${rv}`, () => {
      const planta = plantaDoLar(dados, rv);
      const inv = inventario(dados, rv);
      const funcionais = construcoes(planta.itens);

      it('coloca exatamente as construções que o RV libera (dos ambientes, só os que servem)', () => {
        const contagem = new Map<string, number>();
        for (const c of funcionais) contagem.set(c.construcao, (contagem.get(c.construcao) ?? 0) + 1);
        expect(Object.fromEntries(contagem)).toEqual(Object.fromEntries(inv.itens.map((i) => [i.construcao.chave, naPlanta(i.construcao.chave, i.quantidade)])));
      });

      it('nenhuma construção se sobrepõe a outra e todas ficam dentro do mapa', () => {
        for (let i = 0; i < funcionais.length; i++) {
          const a = funcionais[i]!.area;
          expect(a.x).toBeGreaterThanOrEqual(0);
          expect(a.y).toBeGreaterThanOrEqual(0);
          expect(a.x + a.largura).toBeLessThanOrEqual(planta.largura);
          expect(a.y + a.altura).toBeLessThanOrEqual(planta.altura);
          for (let j = i + 1; j < funcionais.length; j++) expect(sobrepoe(a, funcionais[j]!.area)).toBe(false);
        }
      });

      it('a condição de cada lote confere com a geometria das coberturas do seu bloco', () => {
        const coberturas = planta.itens.filter((i) => i.tipo === 'cobertura');
        for (const l of funcionais.filter((c) => c.construcao === 'farmland' || c.construcao === 'woodland')) {
          const bloco = planta.blocos[l.bloco]!.area;
          const fontes = coberturas.filter((c) => sobrepoe(c.area, bloco)).map((c) => ({ area: c.area, modo: c.modo }));
          expect(condicaoDoLote(l.area, fontes, regras)).toBe(l.condicao);
          // A cultura sugerida pede exatamente a condição do lote.
          // Na temperatura certa, salvo as acomodadas fora do ambiente (com eficiência menor).
          if (l.cultura && !l.eficiencia) expect(l.cultura.ambiente).toBe(l.condicao);
        }
      });

      it('cada construção e cada cobertura ficam inteiras dentro de um terreno aberto neste RV', () => {
        for (const c of funcionais) {
          const t = terreno(c.terreno);
          expect(t.rv).toBeLessThanOrEqual(rv);
          expect(contem(areaDoTerreno(t), c.area)).toBe(true);
          expect(planta.blocos[c.bloco]!.terreno).toBe(c.terreno);
        }
        for (const c of planta.itens.filter((i) => i.tipo === 'cobertura'))
          expect(planta.terrenos.some((t) => contem(t.area, c.area))).toBe(true);
      });

      it('é determinística', () => {
        expect(plantaDoLar(dados, rv)).toEqual(planta);
      });
    });
  }

  it('coloca as chocadeiras num terreno só delas (ninhal), 2×2 e sem sobrepor nada', () => {
    const p = plantaDoLar(dados, 7, { chocadeiras: 5 });
    const chocadeiras = construcoes(p.itens).filter((c) => c.construcao === 'chocadeira');
    expect(chocadeiras).toHaveLength(5);
    expect(chocadeiras.every((c) => c.area.largura === 2 && c.area.altura === 2)).toBe(true);
    const ninhal = p.blocos.findIndex((b) => b.tipo === 'ninhal');
    expect(p.blocos[ninhal]!.cercado).toBe(true);
    expect(chocadeiras.every((c) => c.bloco === ninhal)).toBe(true);
    const todas = construcoes(p.itens);
    for (const c of chocadeiras) expect(todas.filter((o) => o !== c && sobrepoe(o.area, c.area))).toEqual([]);
    expect(plantaDoLar(dados, 7).blocos.some((b) => b.tipo === 'ninhal')).toBe(false);
  });

  describe('unidades de armazenamento', () => {
    const p = plantaDoLar(dados, 20, { armazens: 4 });
    const armazens = construcoes(p.itens).filter((c) => c.construcao === 'armazem');

    it('ficam 2×2, dentro de um terreno com tema, sem sobrepor nada', () => {
      expect(armazens).toHaveLength(4);
      for (const a of armazens) {
        expect([a.area.largura, a.area.altura]).toEqual([2, 2]);
        expect(contem(areaDoTerreno(terreno(a.terreno)), a.area)).toBe(true);
        expect(p.terrenos[a.terreno - 1]!.tema).not.toBeNull();
        expect(construcoes(p.itens).filter((o) => o !== a && sobrepoe(o.area, a.area))).toEqual([]);
      }
    });

    it('ficam espalhados: um por terreno, começando pelos que abrem primeiro', () => {
      expect(new Set(armazens.map((a) => a.terreno)).size).toBe(4);
      expect(armazens.some((a) => a.terreno === 1)).toBe(true);
    });

    it('o máximo de armazéns e de chocadeiras cabe', () => {
      const q = plantaDoLar(dados, 20, { armazens: 12, chocadeiras: 20 });
      const conta = (chave: string) => construcoes(q.itens).filter((c) => c.construcao === chave).length;
      expect([conta('armazem'), conta('chocadeira')]).toEqual([12, 20]);
    });
  });

  describe('culturas escolhidas', () => {
    const plantadas = (culturas: string[]) =>
      construcoes(plantaDoLar(dados, 20, { culturas }).itens).filter((c) => c.construcao === 'farmland' || c.construcao === 'woodland');
    const familias = (lotes: ReturnType<typeof plantadas>) => new Set(lotes.flatMap((l) => (l.cultura ? [familia(l.cultura.chave)] : [])));

    it('só planta o que foi escolhido, e cada escolhida ganha lote (quando a base tem lote para ela)', () => {
      const lotes = plantadas(['rose', 'sugarcane', 'wheat', 'cherry_blossom']);
      expect(familias(lotes)).toEqual(new Set(['rose', 'sugarcane', 'wheat', 'cherry_blossom']));
    });

    it('uma cultura sem ambiente escolhida fica com os lotes sem ambiente', () => {
      const fazendas = plantadas(['rose', 'strawberry', 'sugarcane', 'cranberry', 'wheat']).filter((l) => l.construcao === 'farmland');
      const semAmbiente = fazendas.filter((l) => l.condicao === null);
      expect(semAmbiente.length).toBeGreaterThan(0);
      expect(semAmbiente.every((l) => l.cultura && familia(l.cultura.chave) === 'wheat')).toBe(true);
    });

    it('trocar as culturas não mexe em terrenos nem construções; só os lotes se movem dentro das sub-regiões', () => {
      const fixos = (culturas?: string[]) =>
        plantaDoLar(dados, 20, { armazens: 3, chocadeiras: 2, ...(culturas ? { culturas } : {}) })
          .itens.filter((i) => i.tipo === 'piso' || (i.tipo === 'construcao' && !eLote(i)))
          .map((i) => `${i.tipo}:${'construcao' in i ? i.construcao : ''}:${i.area.x},${i.area.y},${i.area.largura}`);
      const lotes = (culturas?: string[]) => {
        const q = plantaDoLar(dados, 20, { ...(culturas ? { culturas } : {}) });
        const conta: Record<string, number> = {};
        for (const c of construcoes(q.itens))
          if (c.construcao === 'farmland' || c.construcao === 'woodland') {
            conta[c.construcao] = (conta[c.construcao] ?? 0) + 1;
            expect(regiaoDe(q, c.area)).toBeDefined();
          }
        return conta;
      };
      const base = fixos();
      for (const escolha of [['cranberry', 'coconut'], ['wheat'], []]) {
        expect(fixos(escolha)).toEqual(base);
        expect(lotes(escolha)).toEqual(lotes());
      }
    });

    // RV 9–11: quatro temperaturas pedidas e só uma Fornalha e um Resfriador (três zonas). A que sobra
    // vai para o lote de temperatura mais próxima, com eficiência menor, em vez de ficar sem lote.
    const limiteFisico = (_rv: number) => 0;
    for (let rv = 1; rv <= 20; rv++)
      it(`no RV ${rv}, com todas marcadas, nenhuma cultura liberada fica sem lote liberado${limiteFisico(rv) ? ' (salvo o limite físico)' : ''}`, () => {
        const p = plantaDoLar(dados, 20, { rvCulturas: rv });
        const lib = liberacaoPorItem(p, dados, rv);
        const liberadas = new Set(
          construcoes(p.itens).filter((c) => c.cultura && lib.get(c)! <= rv).map((c) => familia(c.cultura!.chave)),
        );
        const disponiveis = new Set(
          inventario(dados, 20).produtos
            .filter((x) => (x.construcao === 'farmland' || x.construcao === 'woodland') && (rvDoProduto(x, dados) ?? 99) <= rv)
            .map((x) => familia(x.chave)),
        );
        expect([...disponiveis].filter((f) => !liberadas.has(f)).length).toBeLessThanOrEqual(limiteFisico(rv));
      });

    it('com rvCulturas, só planta o que já libera naquele nível', () => {
      const lotes = construcoes(plantaDoLar(dados, 20, { rvCulturas: 7 }).itens).filter((c) => c.cultura);
      expect(lotes.length).toBeGreaterThan(0);
      for (const l of lotes) expect(rvDoProduto(l.cultura!, dados)!).toBeLessThanOrEqual(7);
    });

    it('os ambientes mudam de modo para atender a escolha', () => {
      // Só culturas de Congelante e Escaldante: precisa das duas zonas extremas.
      const lotes = plantadas(['cranberry', 'coconut']);
      expect(new Set(lotes.filter((l) => l.cultura).map((l) => l.condicao))).toEqual(new Set(['freeze', 'scorching']));
    });

    it('duas culturas da mesma zona dividem os lotes em faixas contínuas', () => {
      const lotes = plantadas(['cherry_blossom', 'chestnut'])
        .filter((l) => l.construcao === 'woodland' && l.condicao === 'warm')
        .sort((a, b) => a.bloco - b.bloco || a.area.y - b.area.y || a.area.x - b.area.x);
      const ordem = lotes.map((l) => familia(l.cultura!.chave));
      expect(new Set(ordem)).toEqual(new Set(['cherry_blossom', 'chestnut']));
      // Uma troca só na sequência (em ordem de bloco e leitura).
      const trocas = ordem.slice(1).filter((f, i) => f !== ordem[i]).length;
      expect(trocas).toBe(1);
    });

    it('sem nenhuma escolhida, os lotes ficam sem cultura', () => {
      expect(plantadas([]).every((l) => l.cultura === null)).toBe(true);
    });
  });

  describe('terrenos de cultivo', () => {
    const p = plantaDoLar(dados, 20, { culturas: ['rose', 'cranberry', 'wheat', 'cherry_blossom'], rvCulturas: 12 });
    const cultivos = p.blocos.filter((b) => b.tipo === 'cultivo');

    it('todos os lotes e ambientes ficam em terrenos de cultivo', () => {
      const dentro = construcoes(p.itens).filter((c) => eLote(c) || c.construcao in dados.regras.construcoes);
      expect(dentro).toHaveLength(40 + 20 + 4);
      for (const c of dentro) expect(p.blocos[c.bloco]!.tipo).toBe('cultivo');
    });

    it('o primeiro terreno de cultivo não tem ambiente: é onde se planta antes de ter Fornalha', () => {
      expect(cultivos[0]!.terreno).toBe(1);
      expect(construcoes(p.itens).filter((c) => c.terreno === 1 && c.construcao in dados.regras.construcoes)).toEqual([]);
    });

    it('cada lote fica inteiro dentro da sub-região do seu terreno', () => {
      expect(cultivos.length).toBeGreaterThan(1);
      for (const b of cultivos) expect(b.regioes).toHaveLength(1);
      for (const l of construcoes(p.itens).filter(eLote)) expect(contem(p.blocos[l.bloco]!.regioes![0]!, l.area)).toBe(true);
    });

    it('terrenos e sub-regiões são os mesmos em qualquer RV e escolha de culturas', () => {
      const esqueleto = (q: typeof p) => JSON.stringify([q.terrenos, q.blocos]);
      expect(esqueleto(plantaDoLar(dados, 20, { culturas: ['coconut'], rvCulturas: 20 }))).toBe(esqueleto(p));
      expect(esqueleto(plantaDoLar(dados, 20, { rvCulturas: 5 }))).toBe(esqueleto(p));
    });
  });

  describe('terrenos', () => {
    it('são 16, de 20×15, um por nível, cobrindo o tabuleiro sem se sobrepor', () => {
      expect(TERRENOS.map((t) => [t.n, t.rv])).toEqual(Array.from({ length: 16 }, (_, i) => [i + 1, i + 1]));
      const areas = TERRENOS.map(areaDoTerreno);
      for (let i = 0; i < areas.length; i++) for (let j = i + 1; j < areas.length; j++) expect(sobrepoe(areas[i]!, areas[j]!)).toBe(false);
      const p = plantaDoLar(dados, 20);
      expect(p.largura * p.altura).toBe(16 * LARGURA_TERRENO * ALTURA_TERRENO);
    });

    it('a planta de qualquer RV cabe nos terrenos abertos nesse RV', () => {
      for (let rv = 1; rv <= 20; rv++) {
        const p = plantaDoLar(dados, rv);
        for (const t of p.terrenos) if (t.tema) expect(t.rv).toBeLessThanOrEqual(rv);
      }
    });

    it('na base final, o que o jogador pode ter em cada RV fica em terrenos já abertos', () => {
      const p = plantaDoLar(dados, 20, { rvCulturas: 20 });
      for (let rv = 1; rv <= 20; rv++) {
        const lib = liberacaoPorItem(p, dados, rv);
        for (const c of dados.construcoes) {
          const liberados = [...lib.keys()].filter((i) => i.construcao === c.chave && lib.get(i)! <= rv);
          expect(liberados).toHaveLength(naPlanta(c.chave, c.quantidadePorRv[rv - 1]!));
          for (const i of liberados) expect(terreno(i.terreno).rv).toBeLessThanOrEqual(rv);
        }
      }
    });
  });

  it('no RV 7, o par Fornalha + Resfriador cria três zonas de temperatura', () => {
    const lotes = construcoes(plantaDoLar(dados, 7).itens).filter((c) => c.construcao === 'farmland' || c.construcao === 'woodland');
    const condicoes = new Set(lotes.map((l) => l.condicao).filter(Boolean));
    expect(condicoes.size).toBeGreaterThanOrEqual(3);
  });
});

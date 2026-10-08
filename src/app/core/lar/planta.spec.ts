import json from '../../../assets/data/lar-construcao.json';
import { decoracaoInvade } from './decoracao';
import { type FonteAmbiente, cobertura, condicaoDoLote, expandir, quadrado, sobrepoe } from './geometria';
import { inventario } from './inventario';
import { liberacaoPorItem, rvDoProduto } from './liberacao';
import { familia } from './sugestao';
import type { DadosConstrucao } from './modelos-lar';
import { BORDA, type ItemMapa, plantaDoLar } from './planta';

const dados = json as unknown as DadosConstrucao;
const regras = dados.regras;
type Construcao = Extract<ItemMapa, { tipo: 'construcao' }>;
const construcoes = (itens: readonly ItemMapa[]) => itens.filter((i): i is Construcao => i.tipo === 'construcao');

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

  it('no RV 20 usa as quantidades vistas no jogo (40 Fazendas, 20 Bosques, 10 Minas)', () => {
    const qtd = (chave: string) => inventario(dados, 20).itens.find((i) => i.construcao.chave === chave)?.quantidade;
    expect([qtd('farmland'), qtd('woodland'), qtd('mine')]).toEqual([40, 20, 10]);
  });

  it('marca como não verificado acima do RV conferido', () => {
    expect(inventario(dados, dados.rvVerificado).verificado).toBe(true);
    expect(inventario(dados, dados.rvVerificado + 1).verificado).toBe(false);
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

      it('coloca exatamente as construções que o RV libera', () => {
        const contagem = new Map<string, number>();
        for (const c of funcionais) contagem.set(c.construcao, (contagem.get(c.construcao) ?? 0) + 1);
        expect(Object.fromEntries(contagem)).toEqual(Object.fromEntries(inv.itens.map((i) => [i.construcao.chave, i.quantidade])));
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

      it('a decoração não invade construções, pátios, trilhas nem sub-regiões de cultivo, nem a cerca', () => {
        const funcionaisExtras = planta.itens.filter((i) => i.tipo === 'piso' || i.tipo === 'trilha').map((i) => i.area);
        const regioes = planta.blocos.flatMap((b) => b.regioes ?? []);
        expect(decoracaoInvade(planta.itens, [...funcionais.map((c) => c.area), ...funcionaisExtras, ...regioes])).toBe(false);
        // Enfeite dentro de um bloco fica inteiro na área interna (a cerca fica na margem).
        for (const d of planta.itens.filter((i) => i.tipo === 'decoracao'))
          for (const b of planta.blocos)
            if (sobrepoe(b.area, d.area)) {
              const dentro = expandir(b.area, -1);
              expect(d.area.x >= dentro.x - 1e-9 && d.area.y >= dentro.y - 1e-9).toBe(true);
              expect(d.area.x + d.area.largura <= dentro.x + dentro.largura + 1e-9).toBe(true);
              expect(d.area.y + d.area.altura <= dentro.y + dentro.altura + 1e-9).toBe(true);
            }
      });

      it('é determinística', () => {
        expect(plantaDoLar(dados, rv)).toEqual(planta);
      });
    });
  }

  it('coloca as chocadeiras num ninhal cercado, 2×2 e sem sobrepor nada', () => {
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
    const caminhos = p.itens.filter((i) => i.tipo === 'caminho').map((i) => i.area);

    it('ficam 2×2, fora dos blocos e dos caminhos, sem sobrepor nada', () => {
      expect(armazens).toHaveLength(4);
      for (const a of armazens) {
        expect([a.area.largura, a.area.altura]).toEqual([2, 2]);
        expect(p.blocos.some((b) => sobrepoe(b.area, a.area))).toBe(false);
        expect(caminhos.some((c) => sobrepoe(c, a.area))).toBe(false);
        expect(construcoes(p.itens).filter((o) => o !== a && sobrepoe(o.area, a.area))).toEqual([]);
      }
    });

    it('ficam do lado de dentro do anel de caminho, não na borda de árvores', () => {
      for (const a of armazens) {
        expect(a.area.x).toBeGreaterThanOrEqual(BORDA);
        expect(a.area.y).toBeGreaterThanOrEqual(BORDA);
        expect(a.area.x + a.area.largura).toBeLessThanOrEqual(p.largura - BORDA);
        expect(a.area.y + a.area.altura).toBeLessThanOrEqual(p.altura - BORDA);
      }
    });

    it('cada um encosta num caminho', () => {
      for (const a of armazens) expect(caminhos.some((c) => sobrepoe(c, expandir(a.area, 1)))).toBe(true);
    });

    it('ficam espalhados, não juntos', () => {
      const c = armazens.map((a) => ({ x: a.area.x + 1, y: a.area.y + 1 }));
      for (let i = 0; i < c.length; i++)
        for (let j = i + 1; j < c.length; j++) expect(Math.abs(c[i]!.x - c[j]!.x) + Math.abs(c[i]!.y - c[j]!.y)).toBeGreaterThanOrEqual(8);
    });

    it('mais armazéns não pioram a distância das construções ao armazém mais perto', () => {
      const custo = (n: number) => {
        const q = plantaDoLar(dados, 20, { armazens: n });
        const arm = construcoes(q.itens).filter((c) => c.construcao === 'armazem').map((a) => a.area);
        return construcoes(q.itens)
          .filter((c) => c.construcao !== 'armazem' && c.construcao !== 'chocadeira' && !dados.regras.construcoes[c.construcao])
          .reduce((s, c) => s + Math.min(...arm.map((a) => Math.abs(a.x - c.area.x) + Math.abs(a.y - c.area.y))), 0);
      };
      expect(custo(4)).toBeLessThan(custo(1));
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

    it('trocar as culturas não mexe em blocos, caminhos, cercas nem construções; só os lotes se movem dentro dos blocos', () => {
      const fixos = (culturas?: string[]) =>
        plantaDoLar(dados, 20, { armazens: 3, chocadeiras: 2, ...(culturas ? { culturas } : {}) })
          .itens.filter((i) => i.tipo === 'caminho' || i.tipo === 'cerca' || (i.tipo === 'construcao' && i.construcao !== 'farmland' && i.construcao !== 'woodland'))
          .map((i) => `${i.tipo}:${'construcao' in i ? i.construcao : ''}:${i.area.x},${i.area.y},${i.area.largura}`);
      const lotes = (culturas?: string[]) => {
        const q = plantaDoLar(dados, 20, { ...(culturas ? { culturas } : {}) });
        const conta: Record<string, number> = {};
        for (const c of construcoes(q.itens))
          if (c.construcao === 'farmland' || c.construcao === 'woodland') {
            conta[c.construcao] = (conta[c.construcao] ?? 0) + 1;
            // Dentro da área interna do seu bloco (a cerca fica na margem).
            const interna = expandir(q.blocos[c.bloco]!.area, -1);
            expect(c.area.x >= interna.x - 1e-9 && c.area.y >= interna.y - 1e-9).toBe(true);
            expect(c.area.x + c.area.largura <= interna.x + interna.largura + 1e-9).toBe(true);
            expect(c.area.y + c.area.altura <= interna.y + interna.altura + 1e-9).toBe(true);
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

  describe('área única de cultivo', () => {
    const p = plantaDoLar(dados, 20, { culturas: ['rose', 'cranberry', 'wheat', 'cherry_blossom'], rvCulturas: 12 });
    const cultivos = p.blocos.filter((b) => b.tipo === 'cultivo');
    const cultivo = cultivos[0]!;

    it('é um só bloco, cercado, com todos os lotes e ambientes dentro', () => {
      expect(cultivos).toHaveLength(1);
      expect(cultivo.cercado).toBe(true);
      const dentro = construcoes(p.itens).filter(
        (c) => c.construcao === 'farmland' || c.construcao === 'woodland' || c.construcao in dados.regras.construcoes,
      );
      expect(dentro).toHaveLength(40 + 20 + 4);
      for (const c of dentro) expect(sobrepoe(cultivo.area, c.area)).toBe(true);
    });

    it('cada lote fica inteiro dentro de uma sub-região, e as trilhas ficam entre elas', () => {
      const regioes = cultivo.regioes!;
      expect(regioes.length).toBeGreaterThan(1);
      const lotes = construcoes(p.itens).filter((c) => c.construcao === 'farmland' || c.construcao === 'woodland');
      for (const l of lotes)
        expect(regioes.some((r) => l.area.x >= r.x && l.area.y >= r.y && l.area.x + l.area.largura <= r.x + r.largura && l.area.y + l.area.altura <= r.y + r.altura)).toBe(true);
      const trilhas = p.itens.filter((i) => i.tipo === 'trilha');
      expect(trilhas.length).toBeGreaterThan(0);
      for (const t of trilhas) for (const r of regioes) expect(sobrepoe(t.area, r)).toBe(false);
    });

    it('trilhas e sub-regiões são as mesmas em qualquer RV e escolha de culturas', () => {
      const esqueleto = (q: typeof p) => JSON.stringify([q.blocos, q.itens.filter((i) => i.tipo === 'trilha')]);
      expect(esqueleto(plantaDoLar(dados, 20, { culturas: ['coconut'], rvCulturas: 20 }))).toBe(esqueleto(p));
      expect(esqueleto(plantaDoLar(dados, 20, { rvCulturas: 5 }))).toBe(esqueleto(p));
    });
  });

  it('no RV 7, o par Fornalha + Resfriador cria três zonas de temperatura', () => {
    const lotes = construcoes(plantaDoLar(dados, 7).itens).filter((c) => c.construcao === 'farmland' || c.construcao === 'woodland');
    const condicoes = new Set(lotes.map((l) => l.condicao).filter(Boolean));
    expect(condicoes.size).toBeGreaterThanOrEqual(3);
  });
});

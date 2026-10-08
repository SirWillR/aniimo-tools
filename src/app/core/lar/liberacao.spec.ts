import json from '../../../assets/data/lar-construcao.json';
import { liberacaoPorItem, rvDoProduto } from './liberacao';
import type { DadosConstrucao } from './modelos-lar';
import { plantaDoLar } from './planta';

const dados = json as unknown as DadosConstrucao;

describe('liberacaoPorItem', () => {
  const planta = plantaDoLar(dados, 20, { chocadeiras: 2, armazens: 2 });
  const lib = liberacaoPorItem(planta, dados);
  const itens = [...lib.keys()];

  it('a cada RV, os espaços liberados de cada construção batem com a quantidade permitida', () => {
    for (const c of dados.construcoes) {
      const deste = itens.filter((i) => i.construcao === c.chave);
      for (let rv = 1; rv <= 20; rv++)
        expect(deste.filter((i) => lib.get(i)! <= rv).length).toBe(Math.min(c.quantidadePorRv[rv - 1]!, deste.length));
    }
  });

  it('a segunda Fornalha só libera no RV 12', () => {
    const fornalhas = itens.filter((i) => i.construcao === 'heat-furnace').map((i) => lib.get(i));
    expect(fornalhas.sort((a, b) => a! - b!)).toEqual([7, 12]);
  });

  it('a primeira Fornalha vai para o par com o Resfriador', () => {
    const resfriador = itens.find((i) => i.construcao === 'cooling-unit')!;
    const doPar = itens.find((i) => i.construcao === 'heat-furnace' && i.bloco === resfriador.bloco)!;
    expect(lib.get(doPar)).toBe(7);
  });

  it('um lote que ainda não serve só libera se não sobrar, para depois, nenhum que já serve', () => {
    const ambientes = itens.filter((i) => i.construcao in dados.regras.construcoes);
    const serveDesde = (l: (typeof itens)[number]) => {
      const blocoPronto = l.condicao ? Math.max(0, ...ambientes.filter((a) => a.bloco === l.bloco).map((a) => lib.get(a)!)) : 0;
      return Math.max(blocoPronto, l.cultura ? (rvDoProduto(l.cultura, dados) ?? Infinity) : Infinity);
    };
    const lotes = itens.filter((i) => i.construcao === 'farmland' || i.construcao === 'woodland');
    for (const l of lotes) {
      const rv = lib.get(l)!;
      if (serveDesde(l) <= rv) continue;
      const serviamEFicaram = lotes.filter((o) => o.construcao === l.construcao && lib.get(o)! > rv && serveDesde(o) <= rv);
      expect(serviamEFicaram).toEqual([]);
    }
  });

  it('cada cultura escolhida que já serve ganha espaço no nível atual', () => {
    const p = plantaDoLar(dados, 20, { culturas: ['lavender', 'wheat', 'rose'], rvCulturas: 10 });
    const l = liberacaoPorItem(p, dados, 10);
    const noRv10 = [...l.keys()].filter((i) => l.get(i)! <= 10 && i.cultura);
    const familias = new Set(noRv10.map((i) => i.cultura!.chave.replace(/^(quick|premium)_/, '')));
    for (const f of ['lavender', 'wheat', 'rose']) expect(familias.has(f)).toBe(true);
  });

  it('as fazendas coringa entram cedo no revezamento', () => {
    const p = plantaDoLar(dados, 20, { coringas: 3, rvCulturas: 5 });
    const l = liberacaoPorItem(p, dados, 5);
    const coringasNoRv5 = [...l.keys()].filter((i) => i.coringa && l.get(i)! <= 5);
    expect(coringasNoRv5.length).toBeGreaterThan(0);
  });

  it('chocadeiras e armazéns não têm nível conhecido: ficam fora do mapa de liberação', () => {
    expect(itens.some((i) => i.construcao === 'chocadeira' || i.construcao === 'armazem')).toBe(false);
  });
});

describe('rvDoProduto', () => {
  const produto = (chave: string) => dados.produtos.find((p) => p.chave === chave)!;

  it('usa o nível da construção', () => {
    expect(rvDoProduto(produto('wheat'), dados)).toBe(1);
    expect(rvDoProduto(produto('rose'), dados)).toBe(7); // Fazenda nível 4 no RV 7
  });

  it('considera o módulo das variantes rápidas', () => {
    const rapido = produto('quick_strawberry');
    expect(rvDoProduto(rapido, dados)!).toBeGreaterThanOrEqual(rvDoProduto(produto('strawberry'), dados)!);
  });
});

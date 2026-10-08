import dados from '../../../assets/data/aniimo-home-abilities.json';
import { APTIDOES, type AniimoLar, type Aptidao, type DadosLar } from '../data/models';
import { carregarHighsNode } from './highs-node';
import { type IlpBackend, otimizar } from './solver';

const { aniimos, aptidoes } = dados as DadosLar;
const EXEMPLO = [4, 5, 7, 10, 1, 1, 2, 4, 1, 5, 2, 2, 1];

/** Vetor de requisitos a partir de um objeto parcial. */
const req = (r: Partial<Record<Aptidao, number>>) => APTIDOES.map((ap) => r[ap] ?? 0);

const aniimo = (id: string, apt: Partial<Record<Aptidao, number>>, prismana = false): AniimoLar => ({
  id, nome: id, nomeEn: id, forma: 'Forma Básica', formaEn: 'Basic Form', prismana, elementos: [], imagem: '', aptidoes: apt,
});

describe('otimizar', () => {
  let highs: IlpBackend;
  beforeAll(async () => {
    highs = await carregarHighsNode();
  });

  describe('com os dados reais', () => {
    it('os dados trazem as 13 aptidões na ordem do jogo', () => {
      expect(aptidoes.map((a) => a.chave)).toEqual([...APTIDOES]);
    });

    it('resolve o exemplo com 18 Aniimo (ótimo conferido com outro solver)', () => {
      const r = otimizar(highs, aniimos, EXEMPLO);
      expect(r.viavel).toBe(true);
      expect(r.total).toBe(18);
      expect(r.faltando).toEqual([]);
      expect(r.cobertura.every((c) => c.atendido)).toBe(true);
      expect(r.cobertura.map((c) => c.requerido)).toEqual(EXEMPLO);
      expect(r.escolhidos.every((e) => e.copias === 1)).toBe(true);
    });

    it('a cobertura conta 1 por aptidão, independente do nível', () => {
      const r = otimizar(highs, aniimos, EXEMPLO);
      APTIDOES.forEach((ap, j) => {
        const esperado = r.escolhidos.filter((e) => e.aniimo.aptidoes[ap]).length;
        expect(r.cobertura[j]!.atingido).toBe(esperado);
      });
    });

    it('sem Prismana precisa de 20 e não usa nenhum Prismana', () => {
      const r = otimizar(highs, aniimos, EXEMPLO, { excluirPrismana: true });
      expect(r.total).toBe(20);
      expect(r.escolhidos.some((e) => e.aniimo.prismana)).toBe(false);
      expect(r.cobertura.every((c) => c.atendido)).toBe(true);
    });

    it('informa o que falta quando é inviável', () => {
      // Só 2 formas não-Prismana têm Light e só 2 Aniimo têm Perfumery.
      const r = otimizar(highs, aniimos, req({ light: 5, perfumery: 3, fire: 2 }), { excluirPrismana: true });
      expect(r.viavel).toBe(false);
      expect(r.faltando).toEqual([
        { aptidao: 'light', falta: 3 },
        { aptidao: 'perfumery', falta: 1 },
      ]);
      // A sugestão parcial ainda atinge o máximo possível em cada aptidão.
      const porAptidao = Object.fromEntries(r.cobertura.map((c) => [c.aptidao, c]));
      expect(porAptidao['light']!.atingido).toBe(2);
      expect(porAptidao['perfumery']!.atingido).toBe(2);
      expect(porAptidao['fire']!.atendido).toBe(true);
    });
  });

  it('caso trivial: requisitos zerados não escolhem nada nem chamam o ILP', () => {
    const semIlp: IlpBackend = { solve: () => { throw new Error('não deveria chamar o ILP'); } };
    const r = otimizar(semIlp, aniimos, req({}));
    expect(r).toEqual(expect.objectContaining({ viavel: true, total: 0, escolhidos: [], faltando: [], somaNiveis: 0 }));
    expect(r.cobertura.every((c) => c.atendido)).toBe(true);
  });

  it('prefere um Aniimo com várias aptidões a um por aptidão', () => {
    const lista = [
      aniimo('fogo', { fire: 4 }),
      aniimo('agua', { water: 4 }),
      aniimo('planta', { grass: 4 }),
      aniimo('trio', { fire: 1, water: 1, grass: 1 }),
    ];
    const r = otimizar(highs, lista, req({ fire: 1, water: 1, grass: 1 }));
    expect(r.escolhidos.map((e) => e.aniimo.id)).toEqual(['trio']);
    expect(r.total).toBe(1);
  });

  describe('desempate por nível', () => {
    it('com o mesmo número de Aniimo, maximiza a soma dos níveis requeridos', () => {
      const lista = [aniimo('fraco', { fire: 1, hauling: 4 }), aniimo('forte', { fire: 3 })];
      const r = otimizar(highs, lista, req({ fire: 1 }));
      // hauling não é requerido, então não conta no desempate: 3 > 1.
      expect(r.escolhidos.map((e) => e.aniimo.id)).toEqual(['forte']);
      expect(r.somaNiveis).toBe(3);
    });

    it('nunca troca um Aniimo a mais por níveis maiores', () => {
      const lista = [aniimo('a', { fire: 4 }), aniimo('b', { grass: 4 }), aniimo('ab', { fire: 1, grass: 1 })];
      const r = otimizar(highs, lista, req({ fire: 1, grass: 1 }));
      expect(r.escolhidos.map((e) => e.aniimo.id)).toEqual(['ab']);
    });
  });

  describe('máximo de cópias', () => {
    const lista = [aniimo('fogo', { fire: 2 })];

    it('padrão é 1 cópia', () => {
      const r = otimizar(highs, lista, req({ fire: 3 }));
      expect(r.viavel).toBe(false);
      expect(r.faltando).toEqual([{ aptidao: 'fire', falta: 2 }]);
      expect(r.escolhidos).toEqual([{ aniimo: lista[0], copias: 1 }]);
    });

    it('usa várias cópias quando permitido', () => {
      const r = otimizar(highs, lista, req({ fire: 3 }), { maxCopias: 5 });
      expect(r.viavel).toBe(true);
      expect(r.escolhidos).toEqual([{ aniimo: lista[0], copias: 3 }]);
    });
  });

  describe('modo "só os meus"', () => {
    const lista = [aniimo('trio', { fire: 1, water: 1, grass: 1 }), aniimo('fogo', { fire: 1 }), aniimo('agua', { water: 1 })];

    it('só usa o roster, respeitando a quantidade', () => {
      const r = otimizar(highs, lista, req({ fire: 2, water: 1 }), { roster: { fogo: 2, agua: 1 } });
      expect(r.viavel).toBe(true);
      expect(r.escolhidos.map((e) => [e.aniimo.id, e.copias])).toEqual([['agua', 1], ['fogo', 2]]);
    });

    it('maxCopias limita também o roster', () => {
      const r = otimizar(highs, lista, req({ fire: 2 }), { roster: { fogo: 2 }, maxCopias: 1 });
      expect(r.faltando).toEqual([{ aptidao: 'fire', falta: 1 }]);
    });

    it('rejeita ids desconhecidos', () => {
      expect(() => otimizar(highs, lista, req({ fire: 1 }), { roster: { nao_existe: 1 } })).toThrow(/desconhecido/);
    });
  });

  describe('modo complementar', () => {
    // agua tem nível 2 para vencer o trio no desempate quando só falta Water.
    const lista = [aniimo('trio', { fire: 1, water: 1, grass: 1 }), aniimo('fogo', { fire: 1 }), aniimo('agua', { water: 2 })];

    it('sugere só o que falta sobre a distribuição atual', () => {
      const r = otimizar(highs, lista, req({ fire: 2, water: 1 }), { complementar: { atual: req({ fire: 2 }) } });
      expect(r.escolhidos.map((e) => e.aniimo.id)).toEqual(['agua']);
      const fogo = r.cobertura.find((c) => c.aptidao === 'fire')!;
      expect(fogo).toEqual(expect.objectContaining({ atual: 2, adicionado: 0, atingido: 2, atendido: true }));
    });

    it('calcula a distribuição a partir dos alocados e não os sugere de novo', () => {
      const r = otimizar(highs, lista, req({ fire: 2, water: 2, grass: 1 }), { complementar: { alocados: { trio: 1 } } });
      // trio já conta 1 em fire/water/grass e não está mais disponível (maxCopias 1).
      expect(r.escolhidos.map((e) => e.aniimo.id)).toEqual(['agua', 'fogo']);
      expect(r.viavel).toBe(true);
    });

    it('com roster, os alocados saem da quantidade disponível', () => {
      const r = otimizar(highs, lista, req({ fire: 3 }), { roster: { fogo: 2 }, complementar: { alocados: { fogo: 1 } } });
      expect(r.escolhidos).toEqual([{ aniimo: lista[1], copias: 1 }]);
      expect(r.faltando).toEqual([{ aptidao: 'fire', falta: 1 }]);
    });
  });

  it('valida o vetor de requisitos', () => {
    expect(() => otimizar(highs, aniimos, [1, 2, 3])).toThrow(RangeError);
    expect(() => otimizar(highs, aniimos, req({ fire: -1 }))).toThrow(RangeError);
    expect(() => otimizar(highs, aniimos, req({ fire: 1.5 }))).toThrow(RangeError);
  });
});

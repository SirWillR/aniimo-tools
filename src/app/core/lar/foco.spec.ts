import json from '../../../assets/data/lar-construcao.json';
import { culturasDoFoco } from './foco';
import type { DadosConstrucao } from './modelos-lar';

const dados = json as unknown as DadosConstrucao;
const tipoDe = (f: string) => dados.produtos.find((p) => p.chave === f)?.construcao;

describe('culturasDoFoco', () => {
  it('seleção devolve null (vale a escolha do jogador)', () => {
    expect(culturasDoFoco(dados, 10, 'selecao')).toBeNull();
  });

  it('nível: nos Bosques, só as árvores que dão mais Blocos de Madeira por hora', () => {
    const r = culturasDoFoco(dados, 10, 'nivel')!;
    const arvores = r.filter((f) => tipoDe(f) === 'woodland');
    // RV 10: Bosque nível 3, todas as árvores desse nível dão 21 blocos por colheita de 40 min.
    expect(new Set(arvores)).toEqual(new Set(['bamboo', 'cherry_blossom', 'apple', 'maple_syrup']));
  });

  it('nível no RV 20: as árvores de 122 blocos (Cacau, Flor de Laranjeira, Coco)', () => {
    const arvores = culturasDoFoco(dados, 20, 'nivel')!.filter((f) => tipoDe(f) === 'woodland');
    expect(new Set(arvores)).toEqual(new Set(['cocoa', 'orange_flower', 'coconut']));
  });

  it('nível mantém nas Fazendas as culturas de dinheiro', () => {
    const dinheiro = culturasDoFoco(dados, 20, 'dinheiro')!.filter((f) => tipoDe(f) === 'farmland');
    const nivel = culturasDoFoco(dados, 20, 'nivel')!.filter((f) => tipoDe(f) === 'farmland');
    expect(nivel).toEqual(dinheiro);
  });
});

describe('foco Festival', () => {
  it('RV 20: as culturas dos três pratos comuns do banquete, mais as de dinheiro', () => {
    const r = culturasDoFoco(dados, 20, 'festival')!;
    for (const f of ['strawberry', 'apple', 'maple_syrup', 'lavender', 'wheat']) expect(r, f).toContain(f);
    for (const f of culturasDoFoco(dados, 20, 'dinheiro')!) expect(r, f).toContain(f);
  });

  it('prato que o RV ainda não libera não entra', () => {
    const dinheiro = culturasDoFoco(dados, 1, 'dinheiro')!;
    expect(culturasDoFoco(dados, 1, 'festival')).toEqual(dinheiro);
  });
});

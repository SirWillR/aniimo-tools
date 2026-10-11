import json from '../../../assets/data/lar-construcao.json';
import { SEMENTES_FESTIVAL_CHAVES } from './festival';
import { culturasDoFoco } from './foco';
import { inventario } from './inventario';
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

  it('nível no RV 20: as árvores de 122 blocos (Cacau, Flor de Laranjeira, Coco), mais uma sem ambiente', () => {
    const arvores = culturasDoFoco(dados, 20, 'nivel')!.filter((f) => tipoDe(f) === 'woodland');
    const comAmbiente = arvores.filter((f) => dados.produtos.find((p) => p.chave === f)!.ambiente);
    expect(new Set(comAmbiente)).toEqual(new Set(['cocoa', 'orange_flower', 'coconut']));
    expect(arvores.length - comAmbiente.length).toBe(1);
  });

  it('todo foco tem uma cultura de Fazenda e uma de Bosque sem ambiente, para o terreno sem ambiente não ficar vazio', () => {
    const semAmbiente = (f: string) => !dados.produtos.find((p) => p.chave === f)!.ambiente;
    for (const rv of [3, 8, 14, 20])
      for (const foco of ['dinheiro', 'nivel', 'festival'] as const) {
        const r = culturasDoFoco(dados, rv, foco)!;
        for (const tipo of ['farmland', 'woodland']) expect(r.some((f) => tipoDe(f) === tipo && semAmbiente(f)), `${tipo} no RV ${rv}, foco ${foco}`).toBe(true);
      }
  });

  it('nível: no Bosque sem ambiente entra a árvore que dá mais Blocos de Madeira', () => {
    const blocos = (f: string) => {
      const melhores = inventario(dados, 14).produtos.filter((p) => p.construcao === 'woodland' && !p.ambiente && p.chave.replace(/^(quick|premium)_/, '') === f);
      return Math.max(...melhores.map((p) => (p.subproduto!.quantidade / p.tempo!) * 3600));
    };
    const escolhida = culturasDoFoco(dados, 14, 'nivel')!.filter((f) => tipoDe(f) === 'woodland' && !dados.produtos.find((p) => p.chave === f)!.ambiente);
    expect(escolhida).toHaveLength(1);
    for (const outra of ['willow_wood', 'bamboo', 'lemon']) expect(blocos(escolhida[0]!)).toBeGreaterThanOrEqual(blocos(outra));
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

  it('as sementes do festival não são culturas: ficam nas Fazendas coringa', () => {
    for (const rv of [1, 10, 20]) {
      const r = culturasDoFoco(dados, rv, 'festival')!;
      for (const s of SEMENTES_FESTIVAL_CHAVES) expect(r, `${s} no RV ${rv}`).not.toContain(s);
    }
  });

  it('prato que o RV ainda não libera não entra', () => {
    const dinheiro = culturasDoFoco(dados, 1, 'dinheiro')!;
    expect(culturasDoFoco(dados, 1, 'festival')).toEqual(dinheiro);
  });
});

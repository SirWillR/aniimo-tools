import json from '../../../assets/data/lar-construcao.json';
import { SEMENTES_FESTIVAL_CHAVES, comFestival } from './festival';
import { inventario } from './inventario';
import type { DadosConstrucao } from './modelos-lar';
import { melhoresParaVender, paraVender } from './vendas';

const dados = json as unknown as DadosConstrucao;

describe('melhoresParaVender', () => {
  it('só produtos finais: nenhum sugerido é ingrediente de outra receita liberada', () => {
    const r = melhoresParaVender(dados, 20);
    expect(r.length).toBe(10);
    const ingredientes = new Set(inventario(dados, 20).produtos.flatMap((p) => p.ingredientes.map((i) => i.produto)));
    for (const s of r) expect(ingredientes.has(s.produto.chave)).toBe(false);
  });

  it('no máximo 2 por máquina, da mais rentável para a menos', () => {
    const r = melhoresParaVender(dados, 20);
    const porMaquina = new Map<string, number>();
    for (const s of r) porMaquina.set(s.produto.construcao, (porMaquina.get(s.produto.construcao) ?? 0) + 1);
    expect(Math.max(...porMaquina.values())).toBeLessThanOrEqual(2);
    for (let i = 1; i < r.length; i++) expect(r[i - 1]!.ganhoPorHora).toBeGreaterThanOrEqual(r[i]!.ganhoPorHora);
  });

  it('mostra as culturas usadas, descendo pelos ingredientes intermediários', () => {
    // Tanghulu = Morango + Açúcar Cristal (feito de Cana-de-açúcar).
    const tanghulu = melhoresParaVender(dados, 20, 200, 200).find((s) => s.produto.chave === 'tanghulu');
    expect(tanghulu).toBeDefined();
    expect(new Set(tanghulu!.culturas)).toEqual(new Set(['strawberry', 'sugarcane']));
  });

  it('respeita o nível: nada que ainda não libera', () => {
    const r = melhoresParaVender(dados, 5);
    const c = new Map(dados.construcoes.map((x) => [x.chave, x]));
    for (const s of r) expect(s.produto.nivel).toBeLessThanOrEqual(c.get(s.produto.construcao)!.nivelPorRv[4]!);
  });

  it('sem máquinas no RV 1, nada a sugerir', () => {
    expect(melhoresParaVender(dados, 1)).toEqual([]);
  });

  it('separa o que dá para fazer com o que se planta do que pede plantar mais', () => {
    const { agora, plantandoMais } = paraVender(dados, 20, new Set(['rose', 'cherry_blossom', 'wheat', 'cranberry']));
    for (const s of agora) expect(s.culturas.every((c) => ['rose', 'cherry_blossom', 'wheat', 'cranberry'].includes(c))).toBe(true);
    for (const s of plantandoMais) expect(s.faltam.length).toBeGreaterThan(0);
    expect(plantandoMais.length).toBe(5);
    // Plantando tudo, nada fica em "plantando mais".
    const tudo = new Set(dados.produtos.map((p) => p.chave.replace(/^(quick|premium)_/, '')));
    expect(paraVender(dados, 20, tudo).plantandoMais).toEqual([]);
  });
});

describe('receitas do festival em "O que vender"', () => {
  const d = comFestival(dados);
  const todasAsCulturas = new Set(dados.produtos.filter((p) => p.construcao === 'farmland' || p.construcao === 'woodland').map((p) => p.chave.replace(/^(quick|premium)_/, '')));

  it('com as sementes plantadas (Fazenda coringa), entram no que dá para fazer agora', () => {
    const r = paraVender(d, 20, new Set([...todasAsCulturas, ...SEMENTES_FESTIVAL_CHAVES]), { agora: Infinity, plantandoMais: Infinity });
    const molho = r.agora.find((s) => s.produto.chave === 'umbral_sweet_spicy_sauce');
    // (2390 − 23 de Sal Marinho a 16) ÷ 243 s.
    expect(Math.round(molho!.ganhoPorHora)).toBe(Math.round(((2390 - 23 * 16) / 243) * 3600));
  });

  it('sem coringa, caem em "Plantando mais" pedindo as sementes; os preparos da Travessa não são produto final', () => {
    const r = paraVender(d, 20, todasAsCulturas, { agora: Infinity, plantandoMais: Infinity });
    const chaves = (l: typeof r.agora) => l.map((s) => s.produto.chave);
    expect(chaves(r.agora)).not.toContain('umbral_sweet_spicy_sauce');
    expect(r.plantandoMais.find((s) => s.produto.chave === 'harvest_platter')!.faltam.sort()).toEqual(['crescent_pepper', 'moon_radish']);
    for (const i of ['roasted_crescent_pepper', 'moon_radish_slices']) expect([...chaves(r.agora), ...chaves(r.plantandoMais)]).not.toContain(i);
  });
});

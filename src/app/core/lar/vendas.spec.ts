import json from '../../../assets/data/lar-construcao.json';
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

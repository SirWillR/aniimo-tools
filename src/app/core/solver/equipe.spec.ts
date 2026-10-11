import habilidades from '../../../assets/data/aniimo-home-abilities.json';
import construcao from '../../../assets/data/lar-construcao.json';
import type { AniimoLar, Aptidao, DadosLar } from '../data/models';
import { type Energia, energiaPadrao } from '../lar/energia';
import { type EntradaEquipe, type InstalacaoDaEntrada, type ReceitaDaEntrada, entradaDaEquipe } from '../lar/entrada-equipe';
import { especieDe } from '../lar/especies-exigidas';
import { liberacaoPorItem } from '../lar/liberacao';
import type { DadosConstrucao } from '../lar/modelos-lar';
import { plantaDoLar } from '../lar/planta';
import { lotesLiberados, ofertaDosLotes } from '../lar/utilizacao';
import { type IlpBackend, type ResultadoEquipe, montarEquipe } from './equipe';
import { carregarHighsNode } from './highs-node';

const { aniimos } = habilidades as DadosLar;
const dados = construcao as unknown as DadosConstrucao;

const aniimo = (id: string, apt: Partial<Record<Aptidao, number>>, prismana = false): AniimoLar => ({
  id, nome: id, nomeEn: id, forma: 'Forma Básica', formaEn: 'Basic Form', prismana, elementos: [], imagem: '', aptidoes: apt,
});
/** Receita de 10 ciclos por hora a 100%, na tabela de processamento, sem rede. */
const receita = (chave: string, aptidao: Aptidao, nivel: number, extra: Partial<ReceitaDaEntrada> = {}): ReceitaDaEntrada => ({
  chave, construcao: chave, aptidao, nivel, tabela: 'processamento', ciclosPorHora: 10, produz: { [chave]: 1 }, consome: {}, familia: null, familiaPendente: false, watts: null, ...extra,
});
const instalacao = (chave: string, unidades: number, ...receitas: ReceitaDaEntrada[]): InstalacaoDaEntrada => ({ chave, unidades, receitas: receitas.map((r) => ({ ...r, construcao: chave })) });
const semEnergia: Energia = { geradores: 0, watts: 800, aptidao: 'lightning', nivel: 2 };
const entrada = (e: Partial<EntradaEquipe>): EntradaEquipe => ({
  instalacoes: [], oferta: {}, precos: {}, fixos: [], tarefas: [], energia: semEnergia, limite: null, metas: [], tetoDoRitmo: null, ...e,
});

describe('montarEquipe', () => {
  let highs: IlpBackend;
  beforeAll(async () => {
    highs = await carregarHighsNode();
  });
  const quem = (r: ResultadoEquipe) => r.quem.map((q) => `${q.aniimo.id}×${q.copias}:${q.funcao}`).sort();
  const escolhida = (r: ResultadoEquipe, chave: string) => r.instalacoes.flatMap((i) => i.receitas).find((e) => e.receita.chave === chave);
  /** Tempo de máquina na receita, somando as unidades dela. */
  const tempo = (r: ResultadoEquipe, chave: string) => (escolhida(r, chave)?.unidades ?? 0) * (escolhida(r, chave)?.ocupacao ?? 0);

  it('entrada vazia', () => {
    expect(montarEquipe(highs, aniimos, entrada({}))).toMatchObject({ instalacoes: [], quem: [], total: 0, moedasPorHora: 0, ritmo: null });
  });

  it('coleta: um Aniimo trabalhando sem parar, e o que sai é vendido', () => {
    const r = montarEquipe(highs, [aniimo('001-a', { rock: 1 })], entrada({ instalacoes: [instalacao('mina', 1, receita('pedra', 'rock', 1))], precos: { pedra: 5 } }));
    expect(quem(r)).toEqual(['001-a×1:maquinas']);
    expect(r.moedasPorHora).toBeCloseTo(50, 3);
    expect(r.instalacoes[0]).toMatchObject({ unidades: 1, paradas: 0 });
    expect(escolhida(r, 'pedra')).toMatchObject({ unidades: 1, ocupacao: 1, naRede: 0 });
  });

  it('acima do nível da receita o Aniimo trabalha mais rápido, e é ele que entra', () => {
    const gente = [aniimo('001-a', { fire: 1 }), aniimo('002-a', { fire: 2 })];
    const r = montarEquipe(highs, gente, entrada({ instalacoes: [instalacao('forno', 1, receita('pao', 'fire', 1))], precos: { pao: 5 } }));
    expect(quem(r)).toEqual(['002-a×1:maquinas']);
    // Processamento, nível 2 em receita de nível 1: 180 por minuto, o triplo.
    expect(r.moedasPorHora).toBeCloseTo(150, 3);
  });

  it('o nível da receita é o mínimo: quem não alcança não trabalha nela', () => {
    const r = montarEquipe(highs, [aniimo('001-a', { fire: 2 })], entrada({ instalacoes: [instalacao('forno', 1, receita('pao', 'fire', 3))], precos: { pao: 5 } }));
    expect(r).toMatchObject({ quem: [], total: 0, moedasPorHora: 0 });
    expect(r.instalacoes[0]).toMatchObject({ paradas: 1, receitas: [] });
  });

  it('produto de família única: só a família faz', () => {
    const gente = [aniimo('001-a', { leisure: 4 }), aniimo('002-a', { leisure: 3 })];
    const cama = instalacao('cama', 1, receita('la', 'leisure', 3, { familia: ['002'], tabela: 'outro' }));
    expect(quem(montarEquipe(highs, gente, entrada({ instalacoes: [cama], precos: { la: 5 } })))).toEqual(['002-a×1:maquinas']);
    expect(montarEquipe(highs, [gente[0]!], entrada({ instalacoes: [cama], precos: { la: 5 } })).total).toBe(0);
  });

  it('a máquina só trabalha enquanto tem material: o Aniimo fica com o resto do tempo livre', () => {
    const forno = instalacao('forno', 1, receita('pao', 'fire', 1, { consome: { trigo: 1 } }));
    const r = montarEquipe(highs, [aniimo('001-a', { fire: 1 })], entrada({ instalacoes: [forno], oferta: { trigo: 4 }, precos: { pao: 10, trigo: 1 } }));
    expect(tempo(r, 'pao')).toBeCloseTo(0.4, 3);
    expect(r.moedasPorHora).toBeCloseTo(40, 3);
    expect(r.total).toBe(1);
  });

  it('cada unidade fica com uma receita só: a máquina não troca de receita no meio do dia', () => {
    // Uma unidade, duas receitas limitadas pelo material: repartindo o dia renderia 40 + 30; com uma só, 40.
    const forno = instalacao('forno', 1, receita('pao', 'fire', 1, { consome: { trigo: 1 } }), receita('bolo', 'fire', 1, { consome: { ovo: 1 } }));
    const base = { oferta: { trigo: 4, ovo: 3 }, precos: { pao: 10, bolo: 10 } };
    const uma = montarEquipe(highs, [aniimo('001-a', { fire: 1 })], entrada({ ...base, instalacoes: [forno] }));
    expect(uma.instalacoes[0]!.receitas.map((x) => x.receita.chave)).toEqual(['pao']);
    expect(uma.moedasPorHora).toBeCloseTo(40, 3);
    // Com duas unidades, uma receita em cada.
    const duas = montarEquipe(highs, [aniimo('001-a', { fire: 1 })], entrada({ ...base, instalacoes: [{ ...forno, unidades: 2 }] }));
    expect(duas.instalacoes[0]!.receitas.map((x) => [x.receita.chave, x.unidades])).toEqual([['pao', 1], ['bolo', 1]]);
    expect(duas.moedasPorHora).toBeCloseTo(70, 3);
    // Um Aniimo dá conta das duas, porque cada uma trabalha menos da metade do tempo.
    expect(duas.total).toBe(1);
  });

  it('um Aniimo reveza entre máquinas de aptidões diferentes que trabalham parte do tempo', () => {
    const forno = instalacao('forno', 1, receita('pao', 'fire', 1, { consome: { trigo: 1 } }));
    const moinho = instalacao('moinho', 1, receita('fuba', 'wind', 1, { consome: { milho: 1 } }));
    const gente = [aniimo('001-a', { fire: 1, wind: 1 }), aniimo('002-a', { fire: 1 }), aniimo('003-a', { wind: 1 })];
    const r = montarEquipe(highs, gente, entrada({ instalacoes: [forno, moinho], oferta: { trigo: 4, milho: 5 }, precos: { pao: 10, fuba: 10 } }));
    expect(quem(r)).toEqual(['001-a×1:maquinas']);
    expect(r.moedasPorHora).toBeCloseTo(90, 3);
  });

  it('a coleta vira insumo quando a receita rende mais que vender a matéria-prima', () => {
    const poco = instalacao('poco', 1, receita('agua', 'water', 1, { tabela: 'outro' }), receita('agua_cara', 'water', 1, { tabela: 'outro' }));
    const barril = instalacao('barril', 1, receita('suco', 'fire', 1, { consome: { agua: 1 } }));
    const gente = [aniimo('001-a', { water: 1 }), aniimo('002-a', { fire: 1 })];
    const r = montarEquipe(highs, gente, entrada({ instalacoes: [poco, barril], precos: { agua: 1, agua_cara: 3, suco: 20 } }));
    // Sozinha, a Água Cara vende por mais; com o Barril, a Água comum vale 20 em suco.
    expect(tempo(r, 'agua')).toBeCloseTo(1, 3);
    expect(tempo(r, 'agua_cara')).toBe(0);
    expect(r.moedasPorHora).toBeCloseTo(200, 3);
    expect(r.total).toBe(2);
  });

  it('com menos Aniimo do que trabalho, fica o que rende mais', () => {
    const minas = [instalacao('ouro', 1, receita('ouro', 'rock', 1)), instalacao('pedra', 1, receita('pedra', 'rock', 1))];
    const r = montarEquipe(highs, [aniimo('001-a', { rock: 1 })], entrada({ instalacoes: minas, precos: { ouro: 10, pedra: 1 }, limite: 1 }));
    expect(tempo(r, 'ouro')).toBeCloseTo(1, 3);
    expect(tempo(r, 'pedra')).toBe(0);
    expect(r.total).toBe(1);
  });

  it('não chama mais um Aniimo por um ganho de menos de 0,5%', () => {
    const minas = [instalacao('ouro', 1, receita('ouro', 'rock', 1)), instalacao('po', 1, receita('po', 'wind', 1))];
    const gente = [aniimo('001-a', { rock: 1 }), aniimo('002-a', { wind: 1 })];
    const r = montarEquipe(highs, gente, entrada({ instalacoes: minas, precos: { ouro: 1000, po: 1 } }));
    expect(quem(r)).toEqual(['001-a×1:maquinas']);
  });

  describe('energia', () => {
    const rede: Energia = { geradores: 1, watts: 800, aptidao: 'lightning', nivel: 2 };
    const fornos = (watts: number | null) => [instalacao('forno', 3, receita('pao', 'fire', 1, { watts }))];

    it('instalação na rede trabalha sem Aniimo; o gerador ocupa um, com a aptidão e o nível pedidos', () => {
      const gente = [aniimo('001-a', { lightning: 2 }), aniimo('002-a', { lightning: 1 })];
      const r = montarEquipe(highs, gente, entrada({ instalacoes: fornos(60), precos: { pao: 5 }, energia: rede }));
      expect(quem(r)).toEqual(['001-a×1:gerador']);
      expect(escolhida(r, 'pao')).toMatchObject({ unidades: 3, naRede: 3, ocupacao: 1 });
      expect(r.energia).toEqual({ geradores: 1, wattsUsados: 180, wattsDisponiveis: 800 });
      expect(r.moedasPorHora).toBeCloseTo(150, 3);
    });

    it('respeita os watts do gerador', () => {
      const r = montarEquipe(highs, [aniimo('001-a', { lightning: 2 })], entrada({ instalacoes: fornos(300), precos: { pao: 5 }, energia: rede }));
      expect(escolhida(r, 'pao')).toMatchObject({ unidades: 2, naRede: 2 });
      expect(r.instalacoes[0]!.paradas).toBe(1);
      expect(r.energia.wattsUsados).toBe(600);
    });

    it('sem Aniimo para o gerador, ou sem gerador, nada vai para a rede', () => {
      const semQuem = montarEquipe(highs, [aniimo('001-a', { lightning: 1 })], entrada({ instalacoes: fornos(60), precos: { pao: 5 }, energia: rede }));
      expect(semQuem).toMatchObject({ total: 0, moedasPorHora: 0 });
      const semGerador = montarEquipe(highs, [aniimo('001-a', { lightning: 2 })], entrada({ instalacoes: fornos(60), precos: { pao: 5 } }));
      expect(semGerador).toMatchObject({ total: 0, moedasPorHora: 0 });
    });

    it('instalação que não roda com energia (moradia) nunca vai para a rede', () => {
      const r = montarEquipe(highs, [aniimo('001-a', { lightning: 2 })], entrada({ instalacoes: fornos(null), precos: { pao: 5 }, energia: rede }));
      expect(r).toMatchObject({ total: 0, moedasPorHora: 0 });
    });

    it('uma unidade trabalha com Aniimo ou com energia, não com os dois', () => {
      const gente = [aniimo('001-a', { lightning: 2 }), aniimo('002-a', { fire: 4 })];
      const forno = [instalacao('forno', 1, receita('pao', 'fire', 1, { watts: 60 }))];
      const r = montarEquipe(highs, gente, entrada({ instalacoes: forno, precos: { pao: 5 }, energia: rede }));
      // Fogo 4 em receita de nível 1 faz 5 vezes a velocidade da rede: fica o Aniimo.
      expect(quem(r)).toEqual(['002-a×1:maquinas']);
      expect(r.moedasPorHora).toBeCloseTo(250, 3);
    });
  });

  it('postos fixos (ambiente, armazém) ocupam um Aniimo cada, antes de qualquer máquina', () => {
    const fixos = [{ id: 'forno#1', tipo: 'ambiente' as const, construcao: 'forno', aptidao: 'fire' as const, nivel: 1 }];
    const mina = [instalacao('mina', 1, receita('ouro', 'fire', 1))];
    const r = montarEquipe(highs, [aniimo('001-a', { fire: 1 })], entrada({ instalacoes: mina, precos: { ouro: 10 }, fixos, limite: 1 }));
    expect(quem(r)).toEqual(['001-a×1:fixo']);
    expect(r.fixos[0]!.aniimo?.id).toBe('001-a');
    const semNinguem = montarEquipe(highs, [aniimo('001-a', { wind: 1 })], entrada({ fixos }));
    expect(semNinguem.fixos[0]!.aniimo).toBeNull();
  });

  it('equipe dos lotes: quem circula conta em todas as tarefas que sabe fazer', () => {
    const tarefas = (['rock', 'grass', 'dark'] as const).map((aptidao) => ({ aptidao, nivel: 1, etapas: [], quantidade: 2, manual: false }));
    const gente = [aniimo('001-a', { rock: 1, grass: 1 }), aniimo('002-a', { dark: 1 }), aniimo('003-a', { rock: 1 })];
    const r = montarEquipe(highs, gente, entrada({ tarefas }));
    expect(quem(r)).toEqual(['001-a×2:lotes', '002-a×2:lotes']);
    expect(r.tarefas.map((t) => t.atendidos)).toEqual([2, 2, 2]);
    const semTrevas = montarEquipe(highs, [gente[0]!], entrada({ tarefas }));
    expect(semTrevas.tarefas.map((t) => t.atendidos)).toEqual([2, 2, 0]);
  });

  it('modo "só os meus": respeita as quantidades do roster e ignora quem não está nele', () => {
    const minas = [instalacao('mina', 3, receita('ouro', 'rock', 1))];
    const gente = [aniimo('001-a', { rock: 1 }), aniimo('002-a', { rock: 4 })];
    const r = montarEquipe(highs, gente, entrada({ instalacoes: minas, precos: { ouro: 10 } }), { roster: { '001-a': 2 } });
    expect(quem(r)).toEqual(['001-a×2:maquinas']);
    expect(() => montarEquipe(highs, gente, entrada({}), { roster: { 'nao-existe': 1 } })).toThrow(RangeError);
  });

  it('cópias limitadas: passa para o próximo Aniimo com as mesmas aptidões', () => {
    const minas = [instalacao('mina', 2, receita('ouro', 'rock', 1))];
    const gente = [aniimo('001-a', { rock: 1 }), aniimo('002-a', { rock: 1 })];
    const r = montarEquipe(highs, gente, entrada({ instalacoes: minas, precos: { ouro: 10 } }), { maxCopias: 1 });
    expect(quem(r)).toEqual(['001-a×1:maquinas', '002-a×1:maquinas']);
    expect(quem(montarEquipe(highs, gente, entrada({ instalacoes: minas, precos: { ouro: 10 } })))).toEqual(['001-a×2:maquinas']);
  });

  it('o jogo faz escolher entre Lunara e Hélion: só um dos dois entra, uma vez', () => {
    const lampadas = [instalacao('lampada', 3, receita('luz', 'light', 1))];
    const gente = [aniimo('99996-basic-form', { light: 3 }), aniimo('99998-basic-form', { light: 3 }), aniimo('001-a', { light: 1 })];
    const r = montarEquipe(highs, gente, entrada({ instalacoes: lampadas, precos: { luz: 10 } }));
    expect(quem(r)).toEqual(['001-a×2:maquinas', '99996-basic-form×1:maquinas']);
    // Mesmo com aptidões diferentes (perfis separados), o limite é do par.
    const diferentes = [aniimo('99996-basic-form', { light: 3 }), aniimo('99998-basic-form', { light: 3, hauling: 3 })];
    const dois = montarEquipe(highs, diferentes, entrada({ instalacoes: lampadas, precos: { luz: 10 } }));
    expect(dois.total).toBe(1);
  });

  it('Prismana: só entra quando rende mais; sai quando pedido', () => {
    const mina = [instalacao('mina', 1, receita('ouro', 'rock', 1))];
    const iguais = [aniimo('001-p', { rock: 1 }, true), aniimo('002-a', { rock: 1 })];
    expect(quem(montarEquipe(highs, iguais, entrada({ instalacoes: mina, precos: { ouro: 10 } })))).toEqual(['002-a×1:maquinas']);
    const melhor = [aniimo('001-p', { rock: 4 }, true), aniimo('002-a', { rock: 1 })];
    expect(quem(montarEquipe(highs, melhor, entrada({ instalacoes: mina, precos: { ouro: 10 } })))).toEqual(['001-p×1:maquinas']);
    expect(quem(montarEquipe(highs, melhor, entrada({ instalacoes: mina, precos: { ouro: 10 } }), { excluirPrismana: true }))).toEqual(['002-a×1:maquinas']);
  });

  it('metas do foco vêm antes das moedas, e o produto mais atrasado manda no ritmo', () => {
    const bancada = instalacao('bancada', 1, receita('tabua', 'artisanship', 1), receita('enfeite', 'artisanship', 1));
    const forno = instalacao('forno', 1, receita('tijolo', 'fire', 1));
    const gente = [aniimo('001-a', { artisanship: 1 }), aniimo('002-a', { fire: 1 })];
    const base = { instalacoes: [bancada, forno], precos: { enfeite: 100 } };
    expect(tempo(montarEquipe(highs, gente, entrada(base)), 'enfeite')).toBeCloseTo(1, 3);
    const r = montarEquipe(highs, gente, entrada({ ...base, metas: [{ produto: 'tabua', peso: 20 }, { produto: 'tijolo', peso: 5 }] }));
    // 10 tábuas por hora ÷ 20 = 0,5; os tijolos chegariam a 2.
    expect(r.ritmo).toBeCloseTo(0.5, 3);
    expect(tempo(r, 'tabua')).toBeCloseTo(1, 3);
    // Com teto, basta cumprir a meta: a outra unidade volta a render moedas.
    const duas = { ...base, instalacoes: [{ ...bancada, unidades: 2 }, forno] };
    const comTeto = montarEquipe(highs, gente, entrada({ ...duas, metas: [{ produto: 'tabua', peso: 5 }], tetoDoRitmo: 1 }));
    expect(comTeto.ritmo).toBeCloseTo(1, 3);
    expect(escolhida(comTeto, 'tabua')!.unidades).toBe(1);
    expect(tempo(comTeto, 'enfeite')).toBeCloseTo(1, 3);
    // E cada meta conta por si: a que não dá para fazer não zera a outra.
    const umaSo = montarEquipe(highs, gente, entrada({ ...base, metas: [{ produto: 'tabua', peso: 5 }, { produto: 'vidro', peso: 5 }], tetoDoRitmo: 1 }));
    expect(umaSo.ritmo).toBeCloseTo(0.5, 3);
    expect(escolhida(umaSo, 'tabua')!.unidades).toBe(1);
  });

  describe('com os dados reais', () => {
    for (const rv of [2, 14, 20]) {
      it(`RV ${rv}: dentro do limite, ninguém além do próprio tempo, níveis, famílias e watts respeitados`, () => {
        const planta = plantaDoLar(dados, dados.rvMaximo, { armazens: 1, rvCulturas: rv });
        const liberacao = liberacaoPorItem(planta, dados, rv);
        const e = entradaDaEquipe(dados, rv, 'dinheiro', {
          oferta: ofertaDosLotes(planta, liberacao, rv, false),
          lotes: lotesLiberados(planta, liberacao, rv),
          armazens: 1,
          energia: energiaPadrao(rv),
        });
        const r = montarEquipe(highs, aniimos, e);
        if (e.limite !== null) expect(r.total).toBeLessThanOrEqual(e.limite);
        expect(r.total).toBe(r.quem.reduce((s, q) => s + q.copias, 0));
        // Lunara ou Hélion: um só, entre os dois.
        expect(r.quem.filter((q) => ['99996-basic-form', '99998-basic-form'].includes(q.aniimo.id)).reduce((s, q) => s + q.copias, 0)).toBeLessThanOrEqual(1);
        expect(r.moedasPorHora).toBeGreaterThan(0);
        for (const t of r.tarefas) expect(t.atendidos, t.tarefa.aptidao).toBeGreaterThanOrEqual(t.tarefa.quantidade);
        for (const f of r.fixos) expect(f.aniimo?.aptidoes[f.posto.aptidao] ?? 0, f.posto.id).toBeGreaterThanOrEqual(f.posto.nivel);
        expect(r.energia.wattsUsados).toBeLessThanOrEqual(r.energia.wattsDisponiveis);
        const receitas = new Map(e.instalacoes.flatMap((i) => i.receitas).map((x) => [x.chave, x]));
        for (const q of r.quem.filter((x) => x.funcao === 'maquinas')) {
          expect(q.onde.reduce((s, o) => s + o.tempo, 0), q.aniimo.id).toBeLessThanOrEqual(q.copias + 1e-6);
          for (const o of q.onde) {
            const x = receitas.get(o.chave)!;
            expect(q.aniimo.aptidoes[x.aptidao] ?? 0, `${q.aniimo.id} em ${o.chave}`).toBeGreaterThanOrEqual(x.nivel);
            if (x.familia) expect(x.familia, `${q.aniimo.id} em ${o.chave}`).toContain(especieDe(q.aniimo.id));
          }
        }
        for (const i of r.instalacoes) {
          expect(i.receitas.reduce((s, x) => s + x.unidades, 0) + i.paradas, i.chave).toBe(i.unidades);
          for (const x of i.receitas) {
            expect(Number.isInteger(x.unidades) && x.unidades >= 1, `${i.chave} ${x.receita.chave}`).toBe(true);
            expect(x.naRede, `${i.chave} ${x.receita.chave}`).toBeLessThanOrEqual(x.unidades);
            expect(x.ocupacao).toBeLessThanOrEqual(1 + 1e-6);
          }
        }
      }, 120_000);
    }
  });
});

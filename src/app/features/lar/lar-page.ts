import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Aptidao } from '../../core/data/models';
import { DadosConstrucaoService } from '../../core/lar/dados-construcao.service';
import { DadosEnfeitesService } from '../../core/lar/dados-enfeites.service';
import type { TipoJardim } from '../../core/lar/decoracao';
import { inventario, moedasPorHora } from '../../core/lar/inventario';
import { LarStore, MAX_ARMAZENS, MAX_CHOCADEIRAS, MAX_CORINGAS } from '../../core/lar/lar.store';
import type { Ambiente, Produto } from '../../core/lar/modelos-lar';
import { AMBIENTE_PT, ETAPA_PT, nomeConstrucao, nomeProduto } from '../../core/lar/nomes-pt';
import { FESTIVAL, MAX_PLANTIOS_POR_DIA, RECEITAS_DO_FESTIVAL, SEMENTES_DO_FESTIVAL, coringasSugeridas, plantiosNecessarios, pratosDoBanquete, sementesPorDia } from '../../core/lar/festival';
import type { Foco } from '../../core/lar/foco';
import { liberacaoPorItem, rvDoProduto } from '../../core/lar/liberacao';
import { type TipoBloco, plantaDoLar } from '../../core/lar/planta';
import type { ReceitaDaEntrada } from '../../core/lar/entrada-equipe';
import { PlanoLarService } from '../../core/lar/plano-lar.service';
import { EquipeService } from '../../core/solver/equipe.service';
import { familia } from '../../core/lar/sugestao';
import { type SugestaoVenda, paraVender } from '../../core/lar/vendas';
import { AptidaoIcone } from '../../shared/aptidao-icone/aptidao-icone';
import { COR_AMBIENTE, coresDaCultura } from '../../shared/mapa-lar/desenho';
import { type ItemConstrucao, type ItemDecoracao, MapaLar } from '../../shared/mapa-lar/mapa-lar';
import { MapaSimbolos } from '../../shared/mapa-lar/mapa-simbolos';
import { type LinhaVenda, OQueVender } from './o-que-vender';
import { SeletorCulturas } from './seletor-culturas';
import { type CartaoTerreno, type LinhaProducao, TabuleiroTerrenos } from './tabuleiro-terrenos';

interface AptidaoNivel {
  aptidao: Aptidao;
  nivel: number;
  titulo: string;
}

const ZONAS: readonly Ambiente[] = ['scorching', 'warm', 'adequate', 'cool', 'freeze'];

const TEMA_PT: Readonly<Record<TipoBloco, string>> = {
  cultivo: 'Cultivo',
  oficina: 'Oficina',
  recursos: 'Minas e poços',
  moradias: 'Moradias de Aniimo',
  ninhal: 'Chocadeiras',
};

const JARDIM_PT: Readonly<Record<TipoJardim, string>> = {
  praca: 'Praça e jardim',
  lago: 'Lago e piquenique',
  pomar: 'Pomar e bosque',
  lazer: 'Lazer dos Aniimo',
  jardinagem: 'Grande jardim',
};

/** Quantos produtos cabem no cartão de um terreno antes do "+N". */
const PRODUTOS_NO_CARTAO = 4;
/** Quantos produtos a faixa de produção de todos os terrenos mostra. */
const PRODUTOS_NO_TOTAL = 12;

@Component({
  selector: 'app-lar-page',
  imports: [MapaLar, MapaSimbolos, TabuleiroTerrenos, OQueVender, AptidaoIcone, SeletorCulturas, NgTemplateOutlet, RouterLink],
  templateUrl: './lar-page.html',
  styleUrl: './lar-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LarPage {
  protected readonly dados = inject(DadosConstrucaoService);
  protected readonly lar = inject(LarStore);
  private readonly plano = inject(PlanoLarService);
  private readonly equipe = inject(EquipeService);
  private readonly catalogo = inject(DadosEnfeitesService);
  private readonly router = inject(Router);

  /** `?terreno=7` na URL: o terreno aberto. Fica na URL para o botão Voltar do navegador fechar o terreno. */
  readonly terreno = input<string>();

  protected readonly maxChocadeiras = MAX_CHOCADEIRAS;
  protected readonly maxArmazens = MAX_ARMAZENS;
  protected readonly maxCoringas = MAX_CORINGAS;
  /** O Festival da Lua da Colheita está acontecendo: as coringas mostram as sementes dele. */
  protected readonly festival = this.plano.festival;
  protected readonly dicaCoringas = this.festival
    ? `Fazendas sem cultura fixa, para as sementes do ${FESTIVAL.nome} (${SEMENTES_DO_FESTIVAL})`
    : 'Fazendas sem cultura fixa, para sementes de evento';
  protected readonly maxPlantios = MAX_PLANTIOS_POR_DIA;

  /** Quantas coringas dão conta das sementes que o Trigo do Luar diário compra (só durante o festival). */
  protected readonly sugestaoFestival = computed(() => {
    const fazendas = this.dados.construcaoPorChave().get('farmland')?.quantidadePorRv[this.rvAtual() - 1];
    if (!this.festival || !fazendas) return null;
    const coringas = coringasSugeridas(FESTIVAL.trigoPorDia, this.lar.plantiosPorDia(), fazendas);
    return {
      festival: FESTIVAL.nome,
      moeda: FESTIVAL.moeda,
      trigo: FESTIVAL.trigoPorDia,
      sementes: sementesPorDia(FESTIVAL.trigoPorDia),
      coringas,
      noTeto: coringas === fazendas,
      // O inverso, já calculado para as coringas que o jogador tem agora.
      comAsSuas: this.ritmoDasCoringas(),
    };
  });
  protected readonly zonas = ZONAS.map((z) => ({ nome: AMBIENTE_PT[z], cor: COR_AMBIENTE[z] }));

  /**
   * Sempre a base completa do nível máximo: o jogador monta a planta final e, enquanto sobe de nível,
   * vai construindo nos espaços já reservados (decisão do usuário).
   */
  protected readonly rv = this.plano.rvDaPlanta;
  /** Nível atual do jogador: só destaca o que já libera; a planta continua sendo a do RV máximo. */
  protected readonly rvAtual = this.plano.rvAtual;
  protected readonly niveis = computed(() => Array.from({ length: this.rv() }, (_, i) => i + 1));
  protected readonly grade = signal(false);
  protected readonly selecionado = signal<ItemConstrucao | null>(null);
  /** Terreno aberto no mapa ampliado (null = visão geral em cartões). */
  protected readonly aberto = computed(() => {
    const n = Number(this.terreno());
    return Number.isInteger(n) && n >= 1 && n <= (this.planta()?.terrenos.length ?? 0) ? n : null;
  });

  protected readonly equilibrios = [
    { valor: 'eficiente' as const, rotulo: 'Eficiente', dica: 'Sem enfeites; os terrenos que sobram ficam vazios' },
    { valor: 'equilibrado' as const, rotulo: 'Equilibrado', dica: 'Enfeites leves nos terrenos produtivos e jardins nos que sobram' },
    { valor: 'bonito' as const, rotulo: 'Bonito', dica: 'Mais enfeites e cerca de jardim no cultivo' },
  ];
  /** Enfeite clicado no mapa. */
  protected readonly enfeite = signal<ItemDecoracao | null>(null);

  protected readonly focos: readonly { valor: Foco; rotulo: string; dica: string }[] = [
    { valor: 'selecao', rotulo: 'Minha seleção', dica: 'As culturas que você marcar no painel Culturas' },
    { valor: 'dinheiro', rotulo: 'Dinheiro', dica: 'Culturas dos 10 produtos que mais rendem neste nível' },
    { valor: 'nivel', rotulo: 'Nível', dica: 'Bosques com as árvores que dão mais Blocos de Madeira; Fazendas para dinheiro' },
    // Só enquanto o festival dura.
    ...(this.festival ? [{ valor: 'festival' as const, rotulo: 'Festival', dica: `Culturas dos pratos do Grande Banquete do ${FESTIVAL.nome}, mais as de dinheiro` }] : []),
  ];
  /** O foco em uso: "Festival" salvo de antes volta para "Minha seleção" quando o festival acaba. */
  protected readonly focoAtual = this.plano.focoAtual;

  /** Culturas do foco escolhido (null no foco "Minha seleção"). */
  protected readonly culturasDoFoco = this.plano.culturasDoFoco;

  /** Culturas que o mapa usa: as do foco, ou as marcadas pelo jogador (null = todas). */
  protected readonly culturasEmUso = this.plano.culturasEmUso;

  protected readonly planta = this.plano.planta;

  protected readonly liberacao = this.plano.liberacao;

  private liberado(i: ItemConstrucao): boolean {
    return (this.liberacao().get(i) ?? 0) <= this.rvAtual();
  }

  /** Espaços liberados no RV atual, do total da base. */
  protected readonly progresso = computed(() => {
    const itens = [...this.liberacao().keys()];
    return { liberados: itens.filter((i) => this.liberado(i)).length, total: itens.length };
  });

  /** Algum tamanho ainda estimado (sem fonte)? Hoje todos vêm do jogo. */
  protected readonly temEstimado = computed(() => (this.planta()?.itens ?? []).some((i) => i.tipo === 'construcao' && i.estimado));

  private readonly produtosLiberados = computed(() => {
    const d = this.dados.dados();
    return d ? inventario(d, this.rv()).produtos : [];
  });

  private nome(chave: string): string {
    return nomeConstrucao(chave, this.dados.construcaoPorChave().get(chave)?.nomeEn ?? chave);
  }

  /** Aptidões e níveis que uma construção pede (cultivo: etapas da cultura; máquina: a receita mais exigente). */
  private aptidoesDe(i: ItemConstrucao): AptidaoNivel[] {
    if (i.cultura?.etapas.length) {
      const porAptidao = new Map<Aptidao, AptidaoNivel>();
      for (const e of i.cultura.etapas) {
        const atual = porAptidao.get(e.aptidao);
        const titulo = `${ETAPA_PT[e.etapa] ?? e.etapa}: nível ${e.nivel}+`;
        if (!atual) porAptidao.set(e.aptidao, { aptidao: e.aptidao, nivel: e.nivel, titulo });
        else porAptidao.set(e.aptidao, { ...atual, nivel: Math.max(atual.nivel, e.nivel), titulo: `${atual.titulo}; ${titulo}` });
      }
      return [...porAptidao.values()];
    }
    if (i.construcao === 'armazem') return [{ aptidao: 'hauling', nivel: 1, titulo: 'Levar ao depósito: nível ainda não conhecido' }];
    const ambiente = this.dados.dados()?.regras.construcoes[i.construcao];
    if (ambiente) return [{ aptidao: ambiente.aptidao, nivel: 1, titulo: 'Cuidar do ambiente: qualquer nível' }];
    const c = this.dados.construcaoPorChave().get(i.construcao);
    if (!c?.aptidao) return [];
    const niveis = this.produtosLiberados().filter((p) => p.construcao === i.construcao && p.aniimo).map((p) => p.aniimo!.nivel);
    const nivel = Math.max(1, ...niveis);
    return [{ aptidao: c.aptidao, nivel, titulo: `Trabalhar: nível ${nivel}+ para todas as receitas liberadas` }];
  }

  private porqueDe(i: ItemConstrucao, cultura: Produto | null): string {
    if (cultura && i.eficiencia && cultura.ambiente) {
      const pct = Math.round(i.eficiencia * 100);
      return `Fora da temperatura ideal (pede ${AMBIENTE_PT[cultura.ambiente]}): a zona certa não cabe neste nível, então cresce a ~${pct}% da velocidade normal`;
    }
    if (cultura) {
      const ganho = Math.round(moedasPorHora(cultura)).toLocaleString('pt-BR');
      const zona = i.condicao ? `Pede ${AMBIENTE_PT[i.condicao]}` : 'Sem exigência de ambiente';
      return `${zona}; a mais rentável aqui (~${ganho} moedas/h por lote)`;
    }
    if (i.coringa) {
      return this.festival
        ? `Fazenda coringa do ${FESTIVAL.nome}: cada semente leva ${FESTIVAL.crescimentoMin} min, rende ${FESTIVAL.rendimento} e custa ${FESTIVAL.precoDaSemente} ${FESTIVAL.moeda}`
        : 'Fazenda coringa: fica livre para sementes de evento';
    }
    if (i.construcao === 'farmland' || i.construcao === 'woodland') {
      // Lote sem cultura: nenhuma das escolhidas cresce nesta condição.
      const onde = i.condicao ? `em ${AMBIENTE_PT[i.condicao]}` : 'sem ambiente';
      return `Vazio: nenhuma das culturas escolhidas cresce ${onde} neste tipo de lote. Marque uma em "Culturas" para plantar aqui`;
    }
    if (i.construcao === 'chocadeira') return 'Choca ovos de Aniimo';
    if (i.construcao === 'armazem') return 'Os Aniimo trazem para cá o que é produzido; na beira do caminho, perto das construções que mais produzem';
    if (i.condicao) return `Modo ${AMBIENTE_PT[i.condicao]}`;
    // No RV do jogador (a planta é do RV máximo).
    const d = this.dados.dados();
    const nivel = this.dados.construcaoPorChave().get(i.construcao)?.nivelPorRv[this.rvAtual() - 1] ?? i.nivel;
    const receitas = d ? inventario(d, this.rvAtual()).produtos.filter((p) => p.construcao === i.construcao).length : 0;
    return receitas ? `${receitas} ${receitas === 1 ? 'receita liberada' : 'receitas liberadas'} no nível ${nivel}` : `Nível ${nivel}`;
  }

  /**
   * Legenda "Culturas no mapa": exatamente as culturas marcadas no filtro e já liberadas no nível
   * escolhido, com o nome do filtro (família) e quantos lotes cada uma ganhou (0 = a base não tem lote
   * do tipo certo na zona certa para ela). Mais as coringas, se houver.
   */
  protected readonly legenda = computed(() => {
    const d = this.dados.dados();
    const p = this.planta();
    if (!d || !p) return [];
    const lotes = new Map<string, number>();
    const melhorEficiencia = new Map<string, number>();
    for (const i of p.itens)
      if (i.tipo === 'construcao' && i.cultura) {
        const f = familia(i.cultura.chave);
        lotes.set(f, (lotes.get(f) ?? 0) + 1);
        melhorEficiencia.set(f, Math.max(melhorEficiencia.get(f) ?? 0, i.eficiencia ?? 1));
      }

    const escolhidas = this.culturasEmUso() ? new Set(this.culturasEmUso()) : null;
    const vistas = new Map<string, { nome: string; copa: string; fruto: string; lotes: number; eficiencia?: number }>();
    for (const produto of inventario(d, d.rvMaximo).produtos) {
      if (produto.construcao !== 'farmland' && produto.construcao !== 'woodland') continue;
      const f = familia(produto.chave);
      if (vistas.has(f) || (escolhidas && !escolhidas.has(f))) continue;
      const liberada = d.produtos
        .filter((x) => x.construcao === produto.construcao && familia(x.chave) === f)
        .some((x) => (rvDoProduto(x, d) ?? Infinity) <= this.rvAtual());
      if (!liberada) continue;
      const base = d.produtos.find((x) => x.chave === f && x.construcao === produto.construcao) ?? produto;
      const [copa, fruto] = coresDaCultura(f);
      const eficiencia = melhorEficiencia.get(f);
      vistas.set(f, {
        nome: nomeProduto(f, base.nomeEn),
        copa,
        fruto,
        lotes: lotes.get(f) ?? 0,
        ...(eficiencia && eficiencia < 1 ? { eficiencia: Math.round(eficiencia * 100) } : {}),
      });
    }
    const lista = [...vistas.values()].sort((a, b) => b.lotes - a.lotes || a.nome.localeCompare(b.nome));
    const coringas = p.itens.filter((i) => i.tipo === 'construcao' && i.coringa).length;
    if (coringas) lista.push({ nome: this.festival ? `Coringa (${FESTIVAL.nome})` : 'Coringa (sementes de evento)', copa: '#b98a4a', fruto: '#f6c343', lotes: coringas });
    return lista;
  });

  /** Culturas que o jogador está plantando (marcadas no filtro; "todas" = todas as de Fazenda e Bosque). */
  private readonly plantadas = this.plano.plantadas;

  /** Dados das contas de venda e produção: com as receitas do festival enquanto ele dura. A planta não os usa. */
  private readonly dadosVenda = this.plano.dadosVenda;

  /**
   * Card "O que vender": produtos finais que mais rendem por hora de máquina no nível escolhido,
   * separados entre o que dá para fazer com o que se planta e o que pede plantar mais.
   */
  protected readonly vendas = computed(() => {
    const d = this.dadosVenda();
    if (!d) return { agora: [], plantandoMais: [] };
    const nomeDe = (chave: string) => nomeProduto(chave, d.produtos.find((x) => x.chave === chave)?.nomeEn ?? chave);
    const linha = (s: SugestaoVenda): LinhaVenda => ({
      chave: s.produto.chave,
      nome: nomeDe(s.produto.chave),
      maquina: this.nome(s.produto.construcao),
      ganho: Math.round(s.ganhoPorHora).toLocaleString('pt-BR'),
      culturas: s.culturas.map((f) => ({ nome: nomeDe(f), cor: coresDaCultura(f) })),
      outros: s.outros.map(nomeDe).join(', '),
      faltam: s.faltam.map(nomeDe).join(', '),
    });
    const r = paraVender(d, this.rvAtual(), this.plantadas());
    return { agora: r.agora.map(linha), plantandoMais: r.plantandoMais.map(linha) };
  });

  /**
   * Espaços liberados de cada construção na ordem de liberação (RV, depois leitura do mapa): a unidade k
   * do plano é o k-ésimo daqui.
   */
  private readonly unidadesNoMapa = computed(() => {
    const lib = this.liberacao();
    const porChave = new Map<string, ItemConstrucao[]>();
    for (const i of lib.keys()) if (this.liberado(i)) porChave.set(i.construcao, [...(porChave.get(i.construcao) ?? []), i]);
    for (const lista of porChave.values()) lista.sort((a, b) => lib.get(a)! - lib.get(b)! || a.area.y - b.area.y || a.area.x - b.area.x);
    return porChave;
  });

  /**
   * O plano da equipe (o mesmo da página Equipe), unidade por unidade: cada uma com a sua receita, se
   * fica na rede elétrica e o que rende. As unidades de uma receita vêm juntas, as da rede primeiro;
   * as que sobram ficam paradas (null).
   */
  private readonly unidadesDoPlano = computed(() => {
    const porChave = new Map<string, ({ receita: ReceitaDaEntrada; naRede: boolean; ocupacao: number; porHora: number } | null)[]>();
    for (const i of this.equipe.equipe()?.instalacoes ?? []) {
      const unidades = i.receitas.flatMap((x) =>
        Array.from({ length: x.unidades }, (_, k) => ({ receita: x.receita, naRede: k < x.naRede, ocupacao: x.ocupacao, porHora: x.porHora / x.unidades })),
      );
      porChave.set(i.chave, [...unidades, ...Array.from({ length: i.paradas }, () => null)]);
    }
    return porChave;
  });

  /** A unidade do plano que cai neste espaço do mapa; undefined enquanto o plano não chega. */
  private unidadeDoPlano(i: ItemConstrucao) {
    return this.unidadesDoPlano().get(i.construcao)?.[(this.unidadesNoMapa().get(i.construcao) ?? []).indexOf(i)];
  }

  /** "Deve produzir" da máquina selecionada: a receita que o plano da equipe deixa nela. Espaço reservado não produz ainda. */
  private producaoDe(i: ItemConstrucao) {
    const d = this.dadosVenda();
    if (!d || !this.liberado(i) || !this.equipe.entrada()?.instalacoes.some((x) => x.chave === i.construcao)) return null;
    const u = this.unidadeDoPlano(i);
    if (u === undefined) return { estado: 'calculando' as const };
    if (u === null) return { estado: 'parada' as const };
    const nomeDe = (chave: string) => nomeProduto(chave, d.produtos.find((x) => x.chave === chave)?.nomeEn ?? chave);
    return {
      estado: 'produz' as const,
      nome: nomeDe(u.receita.chave),
      porHora: (u.porHora >= 10 ? Math.round(u.porHora) : Math.round(u.porHora * 10) / 10).toLocaleString('pt-BR'),
      ocupacao: Math.max(1, Math.round(u.ocupacao * 100)),
      naRede: u.naRede,
      usa: Object.entries(u.receita.consome).map(([chave, n]) => `${n}× ${nomeDe(chave)}`).join(', '),
      aptidao: u.receita.aptidao,
      nivel: u.receita.nivel,
    };
  }

  /**
   * O que cada terreno produz por dia no RV atual: os lotes pela cultura plantada (sem parar e já com a
   * eficiência fora da temperatura), as máquinas e a coleta pela receita que o plano da equipe deixa em
   * cada unidade.
   */
  private readonly producaoPorTerreno = computed(() => {
    const porTerreno = new Map<number, Map<string, number>>();
    const somar = (n: number, chave: string, porHora: number) => {
      const t = porTerreno.get(n) ?? new Map<string, number>();
      t.set(chave, (t.get(chave) ?? 0) + porHora * 24);
      porTerreno.set(n, t);
    };
    for (const i of this.planta()?.itens ?? []) {
      if (i.tipo !== 'construcao' || !this.liberado(i)) continue;
      if (i.cultura) {
        if (i.cultura.tempo) somar(i.terreno, i.cultura.chave, ((i.cultura.rendimento * 3600) / i.cultura.tempo) * (i.eficiencia ?? 1));
        continue;
      }
      const u = this.unidadeDoPlano(i);
      if (u) somar(i.terreno, familia(u.receita.chave), u.porHora);
    }
    return porTerreno;
  });

  private linhasDeProducao(porChave: ReadonlyMap<string, number>): LinhaProducao[] {
    const produtos = this.dados.dados()?.produtos ?? [];
    return [...porChave]
      .map(([chave, porDia]) => {
        const produto = produtos.find((x) => x.chave === chave);
        const lote = produto?.construcao === 'farmland' || produto?.construcao === 'woodland';
        return {
          chave,
          nome: nomeProduto(chave, produto?.nomeEn ?? chave),
          porDia,
          quantidade: (porDia >= 100 ? Math.round(porDia) : Math.round(porDia * 10) / 10).toLocaleString('pt-BR'),
          cor: lote ? coresDaCultura(chave)[1] : null,
        };
      })
      .sort((a, b) => b.porDia - a.porDia || a.nome.localeCompare(b.nome));
  }

  /** Produção diária somada de todos os terrenos. */
  protected readonly producaoTotal = computed(() => {
    const total = new Map<string, number>();
    for (const t of this.producaoPorTerreno().values()) for (const [chave, q] of t) total.set(chave, (total.get(chave) ?? 0) + q);
    const linhas = this.linhasDeProducao(total);
    return { principais: linhas.slice(0, PRODUTOS_NO_TOTAL), aMais: Math.max(0, linhas.length - PRODUTOS_NO_TOTAL) };
  });

  /** Os 16 terrenos, na ordem do jogo, com o que o cartão de cada um mostra. */
  protected readonly cartoes = computed<CartaoTerreno[]>(() =>
    (this.planta()?.terrenos ?? []).map((t) => {
      const producao = this.linhasDeProducao(this.producaoPorTerreno().get(t.n) ?? new Map());
      return {
        n: t.n,
        rv: t.rv,
        preco: t.preco.toLocaleString('pt-BR'),
        coluna: t.coluna + 1,
        linha: t.linha + 1,
        tema: t.tema === 'jardim' ? JARDIM_PT[t.jardim!] + (t.unidoA ? ` (com o terreno ${t.unidoA})` : '') : t.tema ? TEMA_PT[t.tema] : 'Livre',
        livre: !t.tema,
        fechado: t.rv > this.rvAtual(),
        producao,
        noCartao: producao.slice(0, PRODUTOS_NO_CARTAO),
        aMais: Math.max(0, producao.length - PRODUTOS_NO_CARTAO),
      };
    }),
  );

  protected readonly terrenoAberto = computed(() => this.cartoes().find((c) => c.n === this.aberto()) ?? null);

  private preco(valor: number, moeda: string | null): string {
    return `${valor.toLocaleString('pt-BR')} ${(moeda && this.catalogo.dados()?.moedas[moeda]) ?? 'moedas'}`;
  }

  /** Enfeites do terreno aberto, agrupados: a lista de compras da decoração dele. */
  protected readonly decoracaoDoTerreno = computed(() => {
    const n = this.aberto();
    const porId = this.catalogo.porId();
    const qtd = new Map<string, number>();
    for (const i of this.planta()?.itens ?? []) if (i.tipo === 'decoracao' && i.terreno === n) qtd.set(i.enfeite, (qtd.get(i.enfeite) ?? 0) + 1);
    if (!qtd.size) return null;
    const custo = new Map<string | null, number>();
    let habitabilidade = 0;
    const linhas = [...qtd].flatMap(([id, quantidade]) => {
      const e = porId.get(id);
      if (!e) return [];
      if (e.preco) custo.set(e.moeda, (custo.get(e.moeda) ?? 0) + e.preco * quantidade);
      habitabilidade += e.habitabilidade * quantidade;
      return [{ id, nome: e.nome, quantidade, futuro: e.rv > this.rvAtual(), rv: e.rv }];
    });
    linhas.sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome));
    return {
      linhas,
      custo: [...custo].map(([moeda, valor]) => this.preco(valor, moeda)).join(' + '),
      habitabilidade: habitabilidade.toLocaleString('pt-BR'),
    };
  });

  /** Cartão do enfeite clicado. */
  protected readonly detalheEnfeite = computed(() => {
    const d = this.enfeite();
    const e = d && this.catalogo.porId().get(d.enfeite);
    if (!d || !e) return null;
    return {
      nome: e.nome,
      categoria: e.categoria,
      tamanho: `${e.largura}×${e.altura}`,
      estimado: e.tamanhoEstimado,
      rv: e.rv,
      bloqueado: e.rv > this.rvAtual(),
      preco: e.preco ? this.preco(e.preco, e.moeda) : null,
      habitabilidade: e.habitabilidade,
      noTerreno: (this.planta()?.itens ?? []).filter((i) => i.tipo === 'decoracao' && i.terreno === d.terreno && i.enfeite === d.enfeite).length,
    };
  });

  protected abrir(n: number | null): void {
    this.enfeite.set(null);
    this.selecionado.set(null);
    void this.router.navigate([], { queryParams: { terreno: n }, queryParamsHandling: 'merge' });
  }

  protected readonly detalhe = computed(() => {
    const i = this.selecionado();
    if (!i) return null;
    const construcao = this.dados.construcaoPorChave().get(i.construcao);
    return {
      nome: this.nome(i.construcao),
      produto: i.coringa ? `Coringa · ${this.festival ? SEMENTES_DO_FESTIVAL : 'sementes de evento'}` : i.cultura ? nomeProduto(i.cultura.chave, i.cultura.nomeEn) : null,
      condicao: i.condicao ? AMBIENTE_PT[i.condicao] : null,
      cor: i.condicao ? COR_AMBIENTE[i.condicao] : null,
      tamanho: `${i.area.largura}×${i.area.altura}`,
      eficiencia: i.eficiencia ? Math.round(i.eficiencia * 100) : null,
      estimado: i.estimado,
      // Nível da construção no RV atual (a planta é do RV máximo).
      nivel: construcao?.nivelPorRv[this.rvAtual() - 1] ?? 0,
      aptidoes: this.aptidoesDe(i),
      producao: this.producaoDe(i),
      porque: this.porqueDe(i, i.cultura),
      liberaNoRv: this.liberacao().get(i) ?? null,
      reservado: !this.liberado(i),
      culturaNoRv: i.cultura && this.dados.dados() ? rvDoProduto(i.cultura, this.dados.dados()!) : null,
      /** Quantas desta construção o jogador pode ter no RV atual e na base final. */
      qtdAgora: construcao?.quantidadePorRv[this.rvAtual() - 1] ?? null,
      qtdBase: construcao?.quantidadePorRv[this.rv() - 1] ?? null,
    };
  });

  protected escolherRvAtual(evento: Event): void {
    this.lar.definirRvAtual(Number((evento.target as HTMLSelectElement).value));
  }

  /** Cartão "Grande Banquete": os 6 pratos, o que cada um pede plantar e se o jogador já faz (só no festival). */
  protected readonly banquete = computed(() => {
    const d = this.dados.dados();
    if (!this.festival || !d) return null;
    const nomeDe = (chave: string) => nomeProduto(chave, d.produtos.find((x) => x.chave === chave)?.nomeEn ?? chave);
    const { prazo, porPrato, outrosInsumos, pratos } = FESTIVAL.banquete;
    const ingredientes = (p: Produto) => p.ingredientes.map((x) => `${x.quantidade}× ${nomeDe(x.produto)}`).join(', ');
    const preco = (p: Produto) => p.venda.toLocaleString('pt-BR');
    return {
      prazo: `${prazo.dia}/${prazo.mes}`,
      porPrato,
      pratos: pratosDoBanquete(d, this.rvAtual()).map((p) => ({
        nome: p.prato.nome,
        maquina: p.produto ? this.nome(p.produto.construcao) : null,
        culturas: p.culturas.map((f) => ({ nome: nomeDe(f), cor: coresDaCultura(f)[1] })),
        // Receita do festival: o que ela pede e por quanto vende.
        ingredientes: p.doFestival && p.produto ? ingredientes(p.produto) : '',
        preco: p.doFestival && p.produto ? preco(p.produto) : null,
        // Prato que o RV ainda não libera.
        rvLibera: p.produto && !p.liberado ? p.rvLibera : null,
      })),
      // As receitas do festival que não são prato do banquete: os dois preparos da Travessa e o Molho.
      outras: RECEITAS_DO_FESTIVAL.filter((r) => !pratos.some((p) => p.chave === r.chave)).map((r) => ({
        nome: nomeDe(r.chave),
        maquina: this.nome(r.construcao),
        ingredientes: ingredientes(r),
        preco: preco(r),
      })),
      outros: outrosInsumos.map((o) => `${o.nome} ×${o.quantidade}`).join(', '),
    };
  });

  /** Com as coringas atuais: quantas vezes replantar por dia e de quanto em quanto tempo. */
  private ritmoDasCoringas(): { coringas: number; plantios: number; intervalo: string; sementes: number; faltam: number } | null {
    const coringas = this.lar.coringas();
    const r = plantiosNecessarios(FESTIVAL.trigoPorDia, coringas);
    if (!r) return null;
    const h = Math.floor(r.intervaloMin / 60);
    const min = r.intervaloMin % 60;
    const intervalo = [h ? `${h} h` : '', min ? `${min} min` : ''].filter(Boolean).join(' ');
    return { coringas, plantios: r.plantios, intervalo, sementes: r.sementes, faltam: sementesPorDia(FESTIVAL.trigoPorDia) - r.sementes };
  }

  protected escolherPlantios(evento: Event): void {
    this.lar.definirPlantiosPorDia(Number((evento.target as HTMLInputElement).value));
  }

  protected escolherCoringas(evento: Event): void {
    this.lar.definirCoringas(Number((evento.target as HTMLInputElement).value));
  }

  protected escolherArmazens(evento: Event): void {
    this.lar.definirArmazens(Number((evento.target as HTMLInputElement).value));
  }

  protected escolherChocadeiras(evento: Event): void {
    this.lar.definirChocadeiras(Number((evento.target as HTMLInputElement).value));
  }
}

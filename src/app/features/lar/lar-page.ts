import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { Aptidao } from '../../core/data/models';
import { DadosConstrucaoService } from '../../core/lar/dados-construcao.service';
import { inventario, moedasPorHora } from '../../core/lar/inventario';
import { LarStore, MAX_ARMAZENS, MAX_CHOCADEIRAS, MAX_CORINGAS } from '../../core/lar/lar.store';
import type { Ambiente, Produto } from '../../core/lar/modelos-lar';
import { AMBIENTE_PT, nomeConstrucao, nomeProduto } from '../../core/lar/nomes-pt';
import { culturasDoFoco } from '../../core/lar/foco';
import { liberacaoPorItem, rvDoProduto } from '../../core/lar/liberacao';
import { plantaDoLar } from '../../core/lar/planta';
import { type Producao, producaoPorUnidade } from '../../core/lar/producao';
import { familia } from '../../core/lar/sugestao';
import { type SugestaoVenda, paraVender } from '../../core/lar/vendas';
import { AptidaoIcone } from '../../shared/aptidao-icone/aptidao-icone';
import { COR_AMBIENTE, coresDaCultura } from '../../shared/mapa-lar/desenho';
import { type ItemConstrucao, MapaLar } from '../../shared/mapa-lar/mapa-lar';
import { SeletorCulturas } from './seletor-culturas';

const ETAPA_PT: Readonly<Record<string, string>> = {
  Reclaiming: 'Preparar a terra', Sowing: 'Semear', Reaping: 'Colher', Collecting: 'Coletar', Logging: 'Cortar',
  Watering: 'Regar',
};

interface AptidaoNivel {
  aptidao: Aptidao;
  nivel: number;
  titulo: string;
}

const ZONAS: readonly Ambiente[] = ['scorching', 'warm', 'adequate', 'cool', 'freeze'];

@Component({
  selector: 'app-lar-page',
  imports: [MapaLar, AptidaoIcone, SeletorCulturas, NgTemplateOutlet],
  templateUrl: './lar-page.html',
  styleUrl: './lar-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LarPage {
  protected readonly dados = inject(DadosConstrucaoService);
  protected readonly lar = inject(LarStore);

  protected readonly maxChocadeiras = MAX_CHOCADEIRAS;
  protected readonly maxArmazens = MAX_ARMAZENS;
  protected readonly maxCoringas = MAX_CORINGAS;
  protected readonly zonas = ZONAS.map((z) => ({ nome: AMBIENTE_PT[z], cor: COR_AMBIENTE[z] }));

  /**
   * Sempre a base completa do nível máximo: o jogador monta a planta final e, enquanto sobe de nível,
   * vai construindo nos espaços já reservados (decisão do usuário).
   */
  protected readonly rv = computed(() => this.dados.dados()?.rvMaximo ?? 20);
  /** Nível atual do jogador: só destaca o que já libera; a planta continua sendo a do RV máximo. */
  protected readonly rvAtual = computed(() => Math.min(this.lar.rvAtual(), this.rv()));
  protected readonly niveis = computed(() => Array.from({ length: this.rv() }, (_, i) => i + 1));
  protected readonly grade = signal(false);
  protected readonly selecionado = signal<ItemConstrucao | null>(null);

  protected readonly focos = [
    { valor: 'selecao' as const, rotulo: 'Minha seleção', dica: 'As culturas que você marcar no painel Culturas' },
    { valor: 'dinheiro' as const, rotulo: 'Dinheiro', dica: 'Culturas dos 10 produtos que mais rendem neste nível' },
    { valor: 'nivel' as const, rotulo: 'Nível', dica: 'Bosques com as árvores que dão mais Blocos de Madeira; Fazendas para dinheiro' },
  ];

  /** Culturas do foco escolhido (null no foco "Minha seleção"). */
  protected readonly culturasDoFoco = computed(() => {
    const d = this.dados.dados();
    return d ? culturasDoFoco(d, this.rvAtual(), this.lar.foco()) : null;
  });

  /** Culturas que o mapa usa: as do foco, ou as marcadas pelo jogador (null = todas). */
  protected readonly culturasEmUso = computed(() => this.culturasDoFoco() ?? this.lar.culturas());

  protected readonly planta = computed(() => {
    const d = this.dados.dados();
    return d ? plantaDoLar(d, this.rv(), {
          chocadeiras: this.lar.chocadeiras(),
          armazens: this.lar.armazens(),
          coringas: this.lar.coringas(),
          ...(this.culturasEmUso() ? { culturas: this.culturasEmUso()! } : {}),
          // Só o que já dá para plantar no nível escolhido.
          rvCulturas: this.rvAtual(),
        }) : undefined;
  });

  protected readonly liberacao = computed(() => {
    const p = this.planta();
    const d = this.dados.dados();
    return p && d ? liberacaoPorItem(p, d, this.rvAtual()) : new Map<ItemConstrucao, number>();
  });

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
    if (i.coringa) return 'Fazenda coringa: fica livre para sementes de evento';
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
    if (coringas) lista.push({ nome: 'Coringa (sementes de evento)', copa: '#b98a4a', fruto: '#f6c343', lotes: coringas });
    return lista;
  });

  /** Culturas que o jogador está plantando (marcadas no filtro; "todas" = todas as de Fazenda e Bosque). */
  private readonly plantadas = computed(() => {
    const escolhidas = this.culturasEmUso();
    if (escolhidas) return new Set(escolhidas);
    return new Set((this.dados.dados()?.produtos ?? []).filter((p) => p.construcao === 'farmland' || p.construcao === 'woodland').map((p) => familia(p.chave)));
  });

  /**
   * Card "O que vender": produtos finais que mais rendem por hora de máquina no nível escolhido,
   * separados entre o que dá para fazer com o que se planta e o que pede plantar mais.
   */
  protected readonly vendas = computed(() => {
    const d = this.dados.dados();
    if (!d) return { agora: [], plantandoMais: [] };
    const nomeDe = (chave: string) => nomeProduto(chave, d.produtos.find((x) => x.chave === chave)?.nomeEn ?? chave);
    const linha = (s: SugestaoVenda) => ({
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
   * do plano de produção é o k-ésimo daqui.
   */
  private readonly unidadesNoMapa = computed(() => {
    const lib = this.liberacao();
    const porChave = new Map<string, ItemConstrucao[]>();
    for (const i of lib.keys()) if (this.liberado(i)) porChave.set(i.construcao, [...(porChave.get(i.construcao) ?? []), i]);
    for (const lista of porChave.values()) lista.sort((a, b) => lib.get(a)! - lib.get(b)! || a.area.y - b.area.y || a.area.x - b.area.x);
    return porChave;
  });

  /** Receita de cada unidade liberada de cada máquina no RV atual, conforme o foco. */
  private readonly producao = computed(() => {
    const d = this.dados.dados();
    return d ? producaoPorUnidade(d, this.rvAtual(), this.lar.foco(), this.plantadas()) : new Map<string, Producao[]>();
  });

  /**
   * "Deve produzir" da máquina selecionada: a unidade é a posição do espaço na ordem de liberação
   * (RV, depois leitura do mapa), igual à de `liberacaoPorItem`. Espaço reservado não produz ainda.
   */
  private producaoDe(i: ItemConstrucao) {
    const d = this.dados.dados();
    const unidades = this.producao().get(i.construcao);
    if (!d || !unidades || !this.liberado(i)) return null;
    const u = unidades[(this.unidadesNoMapa().get(i.construcao) ?? []).indexOf(i)];
    if (!u) return null;
    const nomeDe = (chave: string) => nomeProduto(chave, d.produtos.find((x) => x.chave === chave)?.nomeEn ?? chave);
    const moedas = Math.round(u.moedasPorHora).toLocaleString('pt-BR');
    const proximo = Math.min(this.rvAtual() + 1, d.rvMaximo);
    let para: string;
    switch (u.finalidade) {
      case 'vender':
        para = `Para vender · ~${moedas} moedas/h a mais`;
        break;
      case 'coleta':
        para = `Para vender · ~${moedas} moedas/h`;
        break;
      case 'ingrediente':
        para = `Vira ${nomeDe(u.vira!.chave)} (${this.nome(u.vira!.construcao)}), que é vendido`;
        break;
      case 'nivel':
        para = u.vira
          ? `Vira ${nomeDe(u.vira.chave)}, material para subir de nível`
          : u.produto.subproduto
            ? `Rende ${u.produto.subproduto.quantidade} ${nomeDe(u.produto.subproduto.produto)} por leva, para subir de nível`
            : this.rvAtual() < d.rvMaximo
              ? `Material para subir ao RV ${proximo}`
              : 'Material de subir de nível (já no RV máximo)';
        break;
      case 'outra-moeda':
        para = u.produto.moeda === 'aniimo_exp' ? 'Rende experiência para os Aniimo' : 'Rende Aniicápsulas';
        break;
    }
    return {
      nome: nomeDe(u.produto.chave),
      porHora: u.porHora >= 10 ? Math.round(u.porHora) : Math.round(u.porHora * 10) / 10,
      para,
      ingredientes: u.produto.ingredientes.map((x) => `${x.quantidade}× ${nomeDe(x.produto)}`).join(', '),
      aniimo: u.produto.aniimo,
    };
  }

  protected readonly detalhe = computed(() => {
    const i = this.selecionado();
    if (!i) return null;
    const construcao = this.dados.construcaoPorChave().get(i.construcao);
    return {
      nome: this.nome(i.construcao),
      produto: i.coringa ? 'Coringa · sementes de evento' : i.cultura ? nomeProduto(i.cultura.chave, i.cultura.nomeEn) : null,
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

  protected girar(evento: Event): void {
    this.lar.definirRotacao(Number((evento.target as HTMLInputElement).value));
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

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DadosLarService } from '../../core/data/dados-lar.service';
import type { AniimoLar, Aptidao } from '../../core/data/models';
import { RosterService } from '../../core/data/roster.service';
import { MAX_EQUIPE_LOTES, ZonaStore } from '../../core/data/zona.store';
import { DadosConstrucaoService } from '../../core/lar/dados-construcao.service';
import { MAX_GERADORES } from '../../core/lar/energia';
import { especieDe } from '../../core/lar/especies-exigidas';
import type { Foco } from '../../core/lar/foco';
import { ETAPA_PT, nomeConstrucao, nomeProduto } from '../../core/lar/nomes-pt';
import { PlanoLarService } from '../../core/lar/plano-lar.service';
import type { Funcao } from '../../core/solver/equipe';
import { EquipeService } from '../../core/solver/equipe.service';
import { AptidaoIcone } from '../../shared/aptidao-icone/aptidao-icone';

const FOCO_PT: Readonly<Record<Foco, string>> = { selecao: 'Minha seleção', dinheiro: 'Dinheiro', nivel: 'Nível', festival: 'Festival' };
/** Trabalho que ocupa menos que isto do tempo de um Aniimo não aparece em "onde trabalha". */
const TEMPO_MINIMO = 0.01;

const inteiro = (n: number) => Math.round(n).toLocaleString('pt-BR');
const porHora = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('pt-BR');
const numeroOuNulo = (evento: Event) => {
  const texto = (evento.target as HTMLInputElement).value.trim();
  return texto === '' ? null : Number(texto);
};

/** Recomendação de Aniimo: o que cada instalação do Lar faz e quem colocar, escolhidos juntos. */
@Component({
  selector: 'app-equipe-page',
  imports: [AptidaoIcone, RouterLink],
  templateUrl: './equipe-page.html',
  styleUrl: './equipe-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EquipePage {
  protected readonly dados = inject(DadosLarService);
  private readonly construcao = inject(DadosConstrucaoService);
  protected readonly plano = inject(PlanoLarService);
  protected readonly zona = inject(ZonaStore);
  protected readonly roster = inject(RosterService);
  private readonly servico = inject(EquipeService);

  protected readonly maxEquipeLotes = MAX_EQUIPE_LOTES;
  protected readonly maxGeradores = MAX_GERADORES;
  protected readonly foco = computed(() => FOCO_PT[this.plano.focoAtual()]);
  protected readonly limiteDoLar = computed(() => this.construcao.dados()?.aniimoPorRv[this.plano.rvAtual() - 1] ?? null);

  protected readonly energia = this.servico.energia;
  private readonly entrada = this.servico.entrada;
  protected readonly resultado = this.servico.resultado;
  private readonly equipe = this.servico.equipe;

  protected nomeAptidao(ap: Aptidao): string {
    return this.dados.infoAptidao().get(ap)?.pt ?? ap;
  }

  private nomeDoProduto(chave: string): string {
    return nomeProduto(chave, this.plano.dadosVenda()?.produtos.find((p) => p.chave === chave)?.nomeEn ?? chave);
  }

  private nomeDaConstrucao(chave: string): string {
    return nomeConstrucao(chave, this.construcao.construcaoPorChave().get(chave)?.nomeEn ?? chave);
  }

  /** Nomes das espécies de uma família (os números da wiki). */
  private nomesDaFamilia(especies: readonly string[]): string {
    return [...new Set(this.dados.aniimos().filter((a) => especies.includes(especieDe(a.id))).map((a) => a.nome))].join(', ');
  }

  /** Controles da equipe dos lotes: uma linha por tarefa. */
  protected readonly tarefas = computed(() => {
    const r = this.equipe();
    return (this.entrada()?.tarefas ?? []).map((t) => ({
      aptidao: t.aptidao,
      nome: this.nomeAptidao(t.aptidao),
      nivel: t.nivel,
      etapas: t.etapas.map((e) => ETAPA_PT[e] ?? e).join(', '),
      quantidade: t.quantidade,
      manual: t.manual,
      atendidos: r?.tarefas.find((x) => x.tarefa.aptidao === t.aptidao)?.atendidos ?? null,
    }));
  });

  /** "Quem colocar": uma linha por forma, com tudo o que ela faz. */
  protected readonly quem = computed(() => {
    const r = this.equipe();
    if (!r) return [];
    const receitas = new Map((this.entrada()?.instalacoes ?? []).flatMap((i) => i.receitas).map((x) => [x.chave, x]));
    const porForma = new Map<string, { aniimo: AniimoLar; copias: number; faz: Map<string, number> }>();
    const rotulo = (funcao: Funcao, chave: string) =>
      funcao === 'maquinas' ? this.nomeDaConstrucao(receitas.get(chave)?.construcao ?? chave) : funcao === 'fixo' ? this.nomeDaConstrucao(chave) : '';
    for (const q of r.quem) {
      const linha = porForma.get(q.aniimo.id) ?? { aniimo: q.aniimo, copias: 0, faz: new Map<string, number>() };
      linha.copias += q.copias;
      const somar = (onde: string, tempo: number) => linha.faz.set(onde, (linha.faz.get(onde) ?? 0) + tempo);
      if (q.funcao === 'lotes') somar('Lotes', q.copias);
      else if (q.funcao === 'gerador') somar('Gerador de Estalos', q.copias);
      else if (q.funcao === 'fixo') for (const o of q.onde) somar(rotulo('fixo', o.chave), q.copias / q.onde.length);
      else for (const o of q.onde) somar(rotulo('maquinas', o.chave), o.tempo);
      porForma.set(q.aniimo.id, linha);
    }
    return [...porForma.values()]
      .map((l) => ({
        aniimo: l.aniimo,
        copias: l.copias,
        aptidoes: Object.entries(l.aniimo.aptidoes).map(([chave, nivel]) => ({ chave: chave as Aptidao, nivel: nivel! })),
        faz: [...l.faz]
          .filter(([, tempo]) => tempo >= TEMPO_MINIMO)
          .sort((a, b) => b[1] - a[1])
          .map(([onde]) => onde)
          .join(', '),
      }))
      .sort((a, b) => b.copias - a.copias || a.aniimo.nome.localeCompare(b.aniimo.nome));
  });

  /** "O que cada instalação faz": uma receita por unidade; as que trabalham primeiro, as paradas no fim. */
  protected readonly instalacoes = computed(() => {
    const r = this.equipe();
    if (!r) return [];
    return r.instalacoes
      .map((i) => {
        const opcoes = this.entrada()?.instalacoes.find((x) => x.chave === i.chave)?.receitas ?? [];
        return {
          chave: i.chave,
          nome: this.nomeDaConstrucao(i.chave),
          unidades: i.unidades,
          paradas: i.paradas,
          aptidao: opcoes[0]?.aptidao ?? null,
          receitas: i.receitas.map((x) => ({
            chave: x.receita.chave,
            nome: this.nomeDoProduto(x.receita.chave),
            unidades: x.unidades,
            naRede: x.naRede,
            porHora: porHora(x.porHora),
            ocupacao: Math.max(1, Math.round(x.ocupacao * 100)),
            pede: `${this.nomeAptidao(x.receita.aptidao)} nível ${x.receita.nivel}+`,
            familia: x.receita.familia ? this.nomesDaFamilia(x.receita.familia) : '',
            pendente: x.receita.familiaPendente,
          })),
        };
      })
      .sort((a, b) => Number(!a.receitas.length) - Number(!b.receitas.length));
  });

  protected readonly fixos = computed(() =>
    (this.equipe()?.fixos ?? []).map((f) => ({ id: f.posto.id, nome: this.nomeDaConstrucao(f.posto.construcao), aptidao: f.posto.aptidao, aniimo: f.aniimo })),
  );

  protected readonly vendas = computed(() =>
    (this.equipe()?.vendido ?? [])
      .filter((v) => v.moedasPorHora >= 1)
      .slice(0, 12)
      .map((v) => ({ chave: v.produto, nome: this.nomeDoProduto(v.produto), porHora: porHora(v.porHora), moedas: inteiro(v.moedasPorHora) })),
  );

  protected readonly resumo = computed(() => {
    const r = this.equipe();
    if (!r) return null;
    const horasParaSubir = r.ritmo && this.plano.focoAtual() === 'nivel' ? 1 / r.ritmo : null;
    return {
      total: r.total,
      limite: r.limite,
      moedas: inteiro(r.moedasPorHora),
      moedasPorDia: inteiro(r.moedasPorHora * 24),
      paradas: r.instalacoes.reduce((q, i) => q + i.paradas, 0),
      fixosVazios: r.fixos.filter((f) => !f.aniimo).length,
      tarefasFaltando: r.tarefas.filter((t) => t.atendidos < t.tarefa.quantidade).length,
      pendentes: r.instalacoes.some((i) => i.receitas.some((x) => x.receita.familiaPendente)),
      energia: r.energia,
      // Foco Nível: dias até juntar os itens do próximo RV, no ritmo do plano.
      diasParaSubir: horasParaSubir ? Math.ceil(horasParaSubir / 24) : null,
      banquete: this.plano.focoAtual() === 'festival' && r.ritmo !== null ? Math.round(r.ritmo * 100) : null,
    };
  });

  protected definirEquipeLotes(aptidao: Aptidao, evento: Event): void {
    this.zona.definirEquipeLotes(aptidao, numeroOuNulo(evento));
  }

  protected definirAniimoAUsar(evento: Event): void {
    this.zona.definirAniimoAUsar(numeroOuNulo(evento));
  }

  protected definirMaxCopias(evento: Event): void {
    this.zona.definirMaxCopias(numeroOuNulo(evento));
  }

  protected definirGeradores(evento: Event): void {
    this.zona.definirGeradores(numeroOuNulo(evento));
  }

  protected definirWatts(evento: Event): void {
    this.zona.definirWattsPorGerador(Number((evento.target as HTMLInputElement).value));
  }

  protected escondeImagem(evento: Event): void {
    (evento.target as HTMLImageElement).style.visibility = 'hidden';
  }
}

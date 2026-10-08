import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DadosConstrucaoService } from '../../core/lar/dados-construcao.service';
import { inventario } from '../../core/lar/inventario';
import { rvDoProduto } from '../../core/lar/liberacao';
import type { Foco } from '../../core/lar/foco';
import { LarStore } from '../../core/lar/lar.store';
import type { Ambiente } from '../../core/lar/modelos-lar';
import { AMBIENTE_PT, nomeProduto } from '../../core/lar/nomes-pt';
import { familia } from '../../core/lar/sugestao';
import { COR_AMBIENTE, coresDaCultura } from '../../shared/mapa-lar/desenho';

const ORDEM: readonly (Ambiente | null)[] = ['scorching', 'warm', 'adequate', 'cool', 'freeze', null];

interface Opcao {
  familia: string;
  nome: string;
  tipo: 'Fazenda' | 'Bosque';
  copa: string;
  fruto: string;
  /** Primeiro RV em que dá para plantar. */
  rv: number;
}

/** Escolha das culturas que o jogador quer cultivar; define os modos dos ambientes e a disposição dos lotes. */
@Component({
  selector: 'app-seletor-culturas',
  templateUrl: './seletor-culturas.html',
  styleUrl: './seletor-culturas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeletorCulturas {
  /** Nível atual do jogador, para marcar o que ainda não libera. */
  readonly rvAtual = input(20);
  /** Com foco Dinheiro ou Nível: as culturas em uso (o seletor fica travado mostrando-as). */
  readonly emUso = input<readonly string[] | null>(null);
  readonly foco = input<Foco>('selecao');

  private readonly dados = inject(DadosConstrucaoService);
  protected readonly lar = inject(LarStore);

  /** Culturas de Fazenda e Bosque da base final, agrupadas pela condição que pedem (sem filtro). */
  private readonly todosGrupos = computed(() => {
    const d = this.dados.dados();
    if (!d) return [];
    const porFamilia = new Map<string, { opcao: Opcao; ambiente: Ambiente | null }>();
    for (const p of inventario(d, d.rvMaximo).produtos) {
      if (p.construcao !== 'farmland' && p.construcao !== 'woodland') continue;
      const f = familia(p.chave);
      const rv = rvDoProduto(p, d) ?? d.rvMaximo;
      const atual = porFamilia.get(f);
      if (atual) {
        atual.opcao.rv = Math.min(atual.opcao.rv, rv);
        continue;
      }
      const base = d.produtos.find((x) => x.chave === f && x.construcao === p.construcao) ?? p;
      const [copa, fruto] = coresDaCultura(f);
      porFamilia.set(f, {
        ambiente: p.ambiente,
        opcao: { familia: f, nome: nomeProduto(f, base.nomeEn), tipo: p.construcao === 'farmland' ? 'Fazenda' : 'Bosque', copa, fruto, rv },
      });
    }
    return ORDEM.map((ambiente) => ({
      chave: ambiente ?? 'neutro',
      titulo: ambiente ? AMBIENTE_PT[ambiente] : 'Sem ambiente',
      cor: ambiente ? COR_AMBIENTE[ambiente] : null,
      opcoes: [...porFamilia.values()]
        .filter((o) => o.ambiente === ambiente)
        .map((o) => o.opcao)
        .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.rv - b.rv || a.nome.localeCompare(b.nome)),
    })).filter((g) => g.opcoes.length);
  });

  /** As que ainda não liberam no RV atual somem do seletor (mas continuam escolhidas para depois). */
  protected readonly grupos = computed(() =>
    this.todosGrupos()
      .map((g) => ({ ...g, opcoes: g.opcoes.filter((o) => o.rv <= this.rvAtual()) }))
      .filter((g) => g.opcoes.length),
  );

  private readonly todas = computed(() => this.todosGrupos().flatMap((g) => g.opcoes.map((o) => o.familia)));
  private readonly visiveis = computed(() => this.grupos().flatMap((g) => g.opcoes.map((o) => o.familia)));
  private readonly escolhidas = computed(() => new Set(this.emUso() ?? this.lar.culturas() ?? this.todas()));
  protected readonly travado = computed(() => this.emUso() !== null);
  protected readonly contagem = computed(() => ({
    escolhidas: this.visiveis().filter((f) => this.escolhidas().has(f)).length,
    total: this.visiveis().length,
  }));

  protected escolhida(f: string): boolean {
    return this.escolhidas().has(f);
  }

  protected alternar(f: string): void {
    if (this.travado()) return;
    const atual = new Set(this.escolhidas());
    if (atual.has(f)) atual.delete(f);
    else atual.add(f);
    // Todas marcadas volta a ser "todas" (inclui as que entrarem em dados futuros).
    this.lar.definirCulturas(this.todas().every((x) => atual.has(x)) ? null : [...atual]);
  }

  /** Age só nas visíveis: as escondidas (ainda não liberadas) mantêm a escolha que tinham. */
  protected todasOuNenhuma(todas: boolean): void {
    if (this.travado()) return;
    const atual = new Set(this.escolhidas());
    for (const f of this.visiveis()) {
      if (todas) atual.add(f);
      else atual.delete(f);
    }
    this.lar.definirCulturas(this.todas().every((x) => atual.has(x)) ? null : [...atual]);
  }
}

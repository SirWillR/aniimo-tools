import { Injectable, computed, inject } from '@angular/core';
import { DadosConstrucaoService } from './dados-construcao.service';
import { DadosEnfeitesService } from './dados-enfeites.service';
import { SEMENTES_FESTIVAL_CHAVES, comFestival, festivalAtivo } from './festival';
import { type Foco, culturasDoFoco } from './foco';
import { LarStore } from './lar.store';
import { liberacaoPorItem } from './liberacao';
import { type ItemMapa, plantaDoLar } from './planta';
import { familia } from './sugestao';
import { lotesLiberados, ofertaDosLotes } from './utilizacao';

type ItemConstrucao = Extract<ItemMapa, { tipo: 'construcao' }>;

/**
 * O Lar no nível do jogador: foco, culturas em uso, planta e o que os lotes rendem. A página do Lar e
 * a recomendação de Aniimo leem daqui, para falarem do mesmo Lar.
 */
@Injectable({ providedIn: 'root' })
export class PlanoLarService {
  private readonly dados = inject(DadosConstrucaoService);
  private readonly lar = inject(LarStore);
  private readonly catalogo = inject(DadosEnfeitesService);

  /** O Festival da Lua da Colheita está acontecendo. */
  readonly festival = festivalAtivo(new Date());

  /** Nível atual do jogador, dentro do que os dados conhecem. */
  readonly rvAtual = computed(() => Math.min(this.lar.rvAtual(), this.dados.dados()?.rvMaximo ?? 20));

  /** O foco em uso: "Festival" salvo de antes volta para "Minha seleção" quando o festival acaba. */
  readonly focoAtual = computed<Foco>(() => (this.lar.foco() === 'festival' && !this.festival ? 'selecao' : this.lar.foco()));

  /** Culturas do foco escolhido (null no foco "Minha seleção"). */
  readonly culturasDoFoco = computed(() => {
    const d = this.dados.dados();
    return d ? culturasDoFoco(d, this.rvAtual(), this.focoAtual()) : null;
  });

  /** Culturas que o mapa usa: as do foco, ou as marcadas pelo jogador (null = todas). */
  readonly culturasEmUso = computed(() => this.culturasDoFoco() ?? this.lar.culturas());

  /** Culturas que o jogador está plantando (marcadas no filtro; "todas" = todas as de Fazenda e Bosque). */
  readonly plantadas = computed(() => {
    const escolhidas = this.culturasEmUso();
    const culturas = escolhidas ?? (this.dados.dados()?.produtos ?? []).filter((p) => p.construcao === 'farmland' || p.construcao === 'woodland').map((p) => familia(p.chave));
    // As sementes do festival crescem nas Fazendas coringa.
    return new Set<string>([...culturas, ...(this.festival && this.lar.coringas() > 0 ? SEMENTES_FESTIVAL_CHAVES : [])]);
  });

  /** Dados das contas de venda e produção: com as receitas do festival enquanto ele dura. A planta não os usa. */
  readonly dadosVenda = computed(() => {
    const d = this.dados.dados();
    return d && this.festival ? comFestival(d) : d;
  });

  /**
   * Sempre a base completa do nível máximo: o jogador monta a planta final e, enquanto sobe de nível,
   * vai construindo nos espaços já reservados (decisão do usuário).
   */
  readonly rvDaPlanta = computed(() => this.dados.dados()?.rvMaximo ?? 20);

  readonly planta = computed(() => {
    const d = this.dados.dados();
    return d ? plantaDoLar(d, this.rvDaPlanta(), {
          chocadeiras: this.lar.chocadeiras(),
          armazens: this.lar.armazens(),
          coringas: this.lar.coringas(),
          enfeites: this.catalogo.enfeites(),
          equilibrio: this.lar.equilibrio(),
          ...(this.culturasEmUso() ? { culturas: this.culturasEmUso()! } : {}),
          // Só o que já dá para plantar no nível escolhido.
          rvCulturas: this.rvAtual(),
        }) : undefined;
  });

  /** RV em que cada espaço da planta libera. */
  readonly liberacao = computed(() => {
    const p = this.planta();
    const d = this.dados.dados();
    return p && d ? liberacaoPorItem(p, d, this.rvAtual()) : new Map<ItemConstrucao, number>();
  });

  /** O que os lotes que o jogador já tem colhem por hora (família do produto → quantidade). */
  readonly ofertaDosLotes = computed(() => {
    const p = this.planta();
    return p ? ofertaDosLotes(p, this.liberacao(), this.rvAtual(), this.festival) : undefined;
  });

  /** Fazendas e Bosques plantados que o jogador já tem. */
  readonly lotesLiberados = computed(() => {
    const p = this.planta();
    return p ? lotesLiberados(p, this.liberacao(), this.rvAtual()) : 0;
  });
}

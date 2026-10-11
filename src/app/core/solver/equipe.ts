// Monta a equipe do Lar: escolhe juntos o que cada instalação faz e quais Aniimo colocar, pelo maior
// ganho por hora dentro do limite de Aniimo do Lar. TS puro, sem Angular: recebe o backend de ILP
// (HiGHS) por parâmetro, para rodar igual no Web Worker, no Node e nos testes.
//
// Regras do jogo usadas (usuário, 2026-10-11, e Aniimo Tools para a velocidade): o jogador põe os
// Aniimo no Lar e eles vão sozinhos para o trabalho da aptidão deles, um trabalho de cada vez; a
// receita pede um nível mínimo da aptidão e acima dele o Aniimo trabalha mais rápido; alguns produtos
// só uma família faz; a máquina só trabalha enquanto tem material; uma instalação pode trabalhar com
// energia em vez de Aniimo; ambientes e armazéns ocupam um Aniimo fixo; os Aniimo dos lotes circulam e
// contam em todas as tarefas que sabem fazer.
//
// Modelo (Aniimo com as mesmas aptidões formam um perfil p):
//   n_r ∈ ℤ  unidades da instalação com a receita r      e_r ∈ ℤ  dessas, quantas ligadas na rede
//   t_pr ≥ 0 tempo do perfil p na receita r             u_r ≥ 0, u_r ≤ e_r  tempo de máquina na rede
//   c_r = k_r·(Σ_p vel_pr·t_pr + u_r)  ciclos por hora  Σ_p t_pr + e_r ≤ n_r    Σ_{r de b} n_r ≤ unidades de b
//   (pedido do usuário: cada unidade fica com UMA receita e roda sozinha; nada de trocar receita no dia)
//   para cada produto: oferta dos lotes + Σ produzido − Σ consumido − vendido = 0
//   v_p ∈ ℤ  cópias de p nas máquinas, Σ_r t_pr ≤ v_p    f_pc, w_p, g_p ∈ ℤ  cópias em posto fixo, lotes, gerador
//   Σ_p f_pc + falta_c = postos de c     Σ_{p serve a tarefa} w_p + falta_t ≥ pedido
//   Σ_r watts_r·e_r ≤ watts·G, G = Σ_p g_p ≤ geradores  v_p + Σ_c f_pc + w_p + g_p ≤ cópias de p
//   Σ de todos os Aniimo ≤ limite
// Fases: 1) menos postos fixos e tarefas dos lotes sem gente; 2) as metas do foco; 3) moedas por
// hora; 4) com 99,5% delas, menos Aniimo (e, no empate, menos Prismana e mais moedas).
// O modelo roda duas vezes (ver `montarEquipe`): um rascunho sem n_r e e_r inteiros, para escolher as
// receitas candidatas, e o plano final só com elas.
import type { LegacyHighs } from 'highs';
import type { AniimoLar, Aptidao } from '../data/models';
import { VELOCIDADE_NA_REDE } from '../lar/energia';
import type { EntradaEquipe, PostoFixo, ReceitaDaEntrada, TarefaDosLotes } from '../lar/entrada-equipe';
import { ESCOLHAS_POR_CONTA, especieDe } from '../lar/especies-exigidas';
import { velocidade } from '../lar/velocidade';

/** A API one-shot do HiGHS (`highs.solve`); só o tipo, o carregamento fica com quem chama. */
export type IlpBackend = LegacyHighs;

export interface OpcoesEquipe {
  /** Máximo de cópias de cada Aniimo; sem isso, sem limite. No modo "só os meus" vale o roster. */
  maxCopias?: number;
  /** Modo "só os meus": id → quantidade que o usuário possui. Só esses entram. */
  roster?: Readonly<Record<string, number>>;
  excluirPrismana?: boolean;
}

export type Funcao = 'maquinas' | 'fixo' | 'lotes' | 'gerador';

export interface QuemColocar {
  aniimo: AniimoLar;
  copias: number;
  funcao: Funcao;
  /** Máquinas: receita (chave do produto) e tempo, em Aniimo. Fixo: a construção. Lotes: as aptidões das tarefas. */
  onde: { chave: string; tempo: number }[];
}

export interface ReceitaEscolhida {
  receita: ReceitaDaEntrada;
  /** Unidades da instalação que ficam com esta receita. */
  unidades: number;
  /** Dessas, quantas ligadas na rede elétrica (as outras trabalham com Aniimo). */
  naRede: number;
  /** Fração do tempo em que essas unidades trabalham (0 a 1); o resto elas esperam material. */
  ocupacao: number;
  /** Itens do produto principal por hora, de todas essas unidades juntas. */
  porHora: number;
}

export interface InstalacaoEscolhida {
  chave: string;
  unidades: number;
  /** Uma receita por unidade: as escolhidas, da que tem mais unidades (e mais trabalho) para a que tem menos. */
  receitas: ReceitaEscolhida[];
  /** Unidades que ficam sem receita. */
  paradas: number;
}

export interface ResultadoEquipe {
  instalacoes: InstalacaoEscolhida[];
  quem: QuemColocar[];
  fixos: { posto: PostoFixo; aniimo: AniimoLar | null }[];
  tarefas: { tarefa: TarefaDosLotes; atendidos: number }[];
  energia: { geradores: number; wattsUsados: number; wattsDisponiveis: number };
  /** O que sobra para vender, por hora (família do produto). */
  vendido: { produto: string; porHora: number; moedasPorHora: number }[];
  moedasPorHora: number;
  /** Ritmo das metas do foco (null sem metas). */
  ritmo: number | null;
  /** Aniimo usados no total. */
  total: number;
  limite: number | null;
}

/** Cada fase para em 10 s com a melhor solução que tiver (o RV 20 com o Lar cheio chega perto disso). */
const OPCOES_HIGHS = { output_flag: false, mip_rel_gap: 5e-3, time_limit: 10 };
/** Receitas de maior valor acrescentado por hora que entram como candidatas, além das do rascunho. */
const MELHORES_POR_INSTALACAO = 2;
/** A equipe menor pode custar até isto das moedas. */
const TOLERANCIA_DO_GANHO = 0.005;

interface Perfil {
  aptidoes: Partial<Record<Aptidao, number>>;
  especie: string | null;
  prismana: boolean;
  /** Índice em `ESCOLHAS_POR_CONTA` quando os membros são de um grupo que a conta só tem um; senão −1. */
  escolha: number;
  membros: { aniimo: AniimoLar; cap: number }[];
  cap: number;
}

type Termo = readonly [coeficiente: number, variavel: string];

export function montarEquipe(ilp: IlpBackend, aniimos: readonly AniimoLar[], entrada: EntradaEquipe, opcoes: OpcoesEquipe = {}): ResultadoEquipe {
  const ids = new Set(aniimos.map((a) => a.id));
  for (const id of Object.keys(opcoes.roster ?? {})) if (!ids.has(id)) throw new RangeError(`Aniimo desconhecido: ${id}`);

  // Com todas as receitas e uma por unidade, o RV 14 leva 20 s ou mais. Por isso duas passadas: um
  // rascunho rápido, em que as unidades podem repartir o dia entre receitas, diz quais receitas valem a
  // pena; o plano final escolhe só entre elas, com uma receita por unidade. É uma heurística: uma
  // receita que o rascunho não usa não entra no plano final.
  const rascunho = calcular(ilp, aniimos, entrada, opcoes, true);
  const usadas = new Set(rascunho.instalacoes.flatMap((i) => i.receitas.map((x) => x.receita.chave)));
  // Mais as que acrescentam mais valor por hora de máquina em cada instalação (o rascunho espalha o
  // material por muitas receitas e pode deixar de fora a que compensa quando só cabe uma por unidade).
  const valor = (r: ReceitaDaEntrada) => {
    const soma = (itens: Record<string, number>) => Object.entries(itens).reduce((q, [k, n]) => q + n * (entrada.precos[k] ?? 0), 0);
    return (soma(r.produz) - soma(r.consome)) * r.ciclosPorHora;
  };
  for (const i of entrada.instalacoes)
    for (const r of [...i.receitas].sort((a, b) => valor(b) - valor(a)).slice(0, MELHORES_POR_INSTALACAO)) if (valor(r) > 0) usadas.add(r.chave);
  const candidatas = { ...entrada, instalacoes: entrada.instalacoes.map((i) => ({ ...i, receitas: i.receitas.filter((r) => usadas.has(r.chave)) })) };
  return calcular(ilp, aniimos, candidatas, opcoes, false);
}

/** `rascunho`: as unidades e a rede deixam de ser inteiras (as unidades repartem o dia) e só importa o que é produzido. */
function calcular(ilp: IlpBackend, aniimos: readonly AniimoLar[], entrada: EntradaEquipe, opcoes: OpcoesEquipe, rascunho: boolean): ResultadoEquipe {
  const receitas = entrada.instalacoes.flatMap((i) => i.receitas);
  const perfis = agruparEmPerfis(aniimos, receitas, opcoes);
  const nivel = (p: Perfil, ap: Aptidao) => p.aptidoes[ap] ?? 0;
  const vel = (p: Perfil, r: ReceitaDaEntrada) => (r.familia && !(p.especie && r.familia.includes(p.especie)) ? 0 : velocidade(r.tabela, nivel(p, r.aptidao), r.nivel));

  const inteiras: string[] = [];
  const restricoes: string[] = [];
  const limites: string[] = [];
  /** Variáveis que contam Aniimo, por perfil. */
  const doPerfil = perfis.map((): string[] => []);
  const contar = (p: number, nome: string) => {
    inteiras.push(nome);
    doPerfil[p]!.push(nome);
    return nome;
  };

  // ---- Receitas (uma por unidade), tempo de Aniimo e energia ----
  const comEnergia = entrada.energia.geradores > 0 && entrada.energia.watts > 0;
  const ts: { nome: string; p: number; r: number }[] = [];
  const tempoDoPerfil = perfis.map((): string[] => []);
  const ativa = receitas.map(() => false);
  const naRede = receitas.map(() => false);
  const watts: Termo[] = [];
  entrada.instalacoes.forEach((inst, b) => {
    const unidades: Termo[] = [];
    for (const r of inst.receitas) {
      const j = receitas.indexOf(r);
      const operar: Termo[] = [];
      const ciclos: Termo[] = [[1, `c${j}`]];
      perfis.forEach((p, i) => {
        const v = vel(p, r);
        if (v <= 0) return;
        const nome = `t${i}_${j}`;
        ts.push({ nome, p: i, r: j });
        tempoDoPerfil[i]!.push(nome);
        operar.push([1, nome]);
        ciclos.push([-r.ciclosPorHora * v, nome]);
      });
      naRede[j] = comEnergia && r.watts !== null;
      ativa[j] = operar.length > 0 || naRede[j]!;
      if (!ativa[j]) continue;
      if (!rascunho) inteiras.push(`n${j}`);
      limites.push(` n${j} <= ${inst.unidades}`);
      unidades.push([1, `n${j}`]);
      if (naRede[j]) {
        if (!rascunho) inteiras.push(`e${j}`);
        // Unidade na rede trabalha sem Aniimo, e só ela: as outras da receita ficam para os Aniimo.
        restricoes.push(` ru${j}: u${j} - e${j} <= 0`);
        operar.push([1, `e${j}`]);
        ciclos.push([-r.ciclosPorHora * VELOCIDADE_NA_REDE, `u${j}`]);
        watts.push([r.watts!, `e${j}`]);
      }
      restricoes.push(` op${j}: ${expressao([...operar, [-1, `n${j}`]])} <= 0`, ` ci${j}: ${expressao(ciclos)} = 0`);
    }
    if (unidades.length) restricoes.push(` un${b}: ${expressao(unidades)} <= ${inst.unidades}`);
  });
  perfis.forEach((_, i) => {
    const tempos = tempoDoPerfil[i]!;
    if (tempos.length) restricoes.push(` tp${i}: ${expressao([...tempos.map((v): Termo => [1, v]), [-1, contar(i, `v${i}`)]])} <= 0`);
  });

  // ---- Material: o que sobra de cada produto é vendido ----
  const produtos = new Set<string>();
  receitas.forEach((r, j) => {
    if (ativa[j]) for (const k of [...Object.keys(r.produz), ...Object.keys(r.consome)]) produtos.add(k);
  });
  for (const m of entrada.metas) produtos.add(m.produto);
  const venda = new Map<string, string>();
  const moedas: Termo[] = [];
  [...produtos].forEach((k, q) => {
    const termos: Termo[] = [];
    receitas.forEach((r, j) => {
      const saldo = (r.produz[k] ?? 0) - (r.consome[k] ?? 0);
      if (ativa[j] && saldo) termos.push([saldo, `c${j}`]);
    });
    venda.set(k, `s${q}`);
    restricoes.push(` ba${q}: ${expressao([...termos, [-1, `s${q}`]])} = ${num(-(entrada.oferta[k] ?? 0))}`);
    if (entrada.precos[k]) moedas.push([entrada.precos[k]!, `s${q}`]);
  });

  // ---- Postos fixos, equipe dos lotes e geradores ----
  const faltas: Termo[] = [];
  const classes = new Map<string, PostoFixo[]>();
  for (const f of entrada.fixos) classes.set(`${f.aptidao}|${f.nivel}`, [...(classes.get(`${f.aptidao}|${f.nivel}`) ?? []), f]);
  const fs: { nome: string; p: number; classe: string }[] = [];
  [...classes].forEach(([classe, postos], c) => {
    const termos: Termo[] = [];
    perfis.forEach((p, i) => {
      if (nivel(p, postos[0]!.aptidao) < postos[0]!.nivel) return;
      const nome = contar(i, `f${i}_${c}`);
      fs.push({ nome, p: i, classe });
      termos.push([1, nome]);
    });
    faltas.push([1, `ff${c}`]);
    restricoes.push(` fx${c}: ${expressao([...termos, [1, `ff${c}`]])} = ${postos.length}`);
  });
  const tarefas = entrada.tarefas.filter((t) => t.quantidade > 0);
  const serve = (p: Perfil, t: TarefaDosLotes) => nivel(p, t.aptidao) >= t.nivel;
  const ws = new Map<number, string>();
  tarefas.forEach((t, j) => {
    const termos: Termo[] = [];
    perfis.forEach((p, i) => {
      if (!serve(p, t)) return;
      if (!ws.has(i)) ws.set(i, contar(i, `w${i}`));
      termos.push([1, ws.get(i)!]);
    });
    faltas.push([1, `ft${j}`]);
    restricoes.push(` lt${j}: ${expressao([...termos, [1, `ft${j}`]])} >= ${t.quantidade}`);
  });
  const gs = new Map<number, string>();
  if (watts.length) {
    perfis.forEach((p, i) => {
      if (nivel(p, entrada.energia.aptidao) >= entrada.energia.nivel) gs.set(i, contar(i, `g${i}`));
    });
    const geradores: Termo[] = [...gs.values()].map((v) => [1, v]);
    restricoes.push(` ge: ${expressao(geradores)} <= ${entrada.energia.geradores}`, ` wa: ${expressao([...watts, ...geradores.map(([, v]): Termo => [-entrada.energia.watts, v])])} <= 0`);
  }

  perfis.forEach((p, i) => {
    if (doPerfil[i]!.length && Number.isFinite(p.cap)) restricoes.push(` cp${i}: ${expressao(doPerfil[i]!.map((v): Termo => [1, v]))} <= ${p.cap}`);
  });
  // Grupos de que a conta só tem um (Lunara ou Hélion): o limite vale para todos os perfis do grupo juntos.
  ESCOLHAS_POR_CONTA.forEach((escolha, k) => {
    const doGrupo = perfis.flatMap((p, i) => (p.escolha === k ? doPerfil[i]! : []));
    if (doGrupo.length) restricoes.push(` es${k}: ${expressao(doGrupo.map((v): Termo => [1, v]))} <= ${escolha.maximo}`);
  });
  const todos: Termo[] = doPerfil.flat().map((v) => [1, v]);
  if (entrada.limite !== null && todos.length) restricoes.push(` lim: ${expressao(todos)} <= ${entrada.limite}`);

  // ---- Metas do foco ----
  // Sem teto (subir de nível): os itens são pedidos juntos, então o mais atrasado manda (um ritmo só).
  // Com teto (banquete): cada prato conta por si até o teto; com uma receita por unidade nem sempre dá
  // para fazer todos, e fazer alguns já vale.
  const ritmos: Termo[] = entrada.metas.map((_, j) => [1, entrada.tetoDoRitmo === null ? 'z' : `zm${j}`]);
  entrada.metas.forEach((m, j) => {
    restricoes.push(` me${j}: ${expressao([[m.peso, ritmos[j]![1]], [-1, venda.get(m.produto)!]])} <= 0`);
    if (entrada.tetoDoRitmo !== null) limites.push(` zm${j} <= ${num(entrada.tetoDoRitmo)}`);
  });
  const objetivoDasMetas: Termo[] = entrada.tetoDoRitmo === null ? [[1, 'z']] : ritmos;

  // ---- Fases ----
  const modelo = (sentido: 'Maximize' | 'Minimize', obj: readonly Termo[], extras: readonly string[]) =>
    [sentido, ` obj: ${expressao(obj)}`, 'Subject To', ...restricoes, ...extras, ...(limites.length ? ['Bounds', ...limites] : []), ...(inteiras.length ? ['Generals', quebrar(inteiras)] : []), 'End'].join('\n');
  const extras: string[] = [];
  let colunas: Record<string, { Primal?: number }> = {};
  const resolver = (sentido: 'Maximize' | 'Minimize', obj: readonly Termo[]) => {
    const r = ilp.solve(modelo(sentido, obj, extras), OPCOES_HIGHS);
    if (r.Status !== 'Optimal' && r.Status !== 'Time limit reached') throw new Error(`Solver terminou com status ${r.Status}`);
    colunas = r.Columns as Record<string, { Primal?: number }>;
    return obj.reduce((s, [k, v]) => s + k * (colunas[v]?.Primal ?? 0), 0);
  };
  const fixar = (nome: string, obj: readonly Termo[], sinal: '>=' | '<=', valor: number) => extras.push(` ${nome}: ${expressao(obj)} ${sinal} ${num(valor)}`);
  const prismanas: Termo[] = perfis.flatMap((p, i) => (p.prismana ? doPerfil[i]!.map((v): Termo => [1, v]) : []));

  if (restricoes.length) {
    if (faltas.length) fixar('x1', faltas, '<=', resolver('Minimize', faltas) + 1e-6);
    if (entrada.metas.length) fixar('x2', objetivoDasMetas, '>=', resolver('Maximize', objetivoDasMetas) * (1 - 1e-4) - 1e-9);
    const ganho = moedas.length ? resolver('Maximize', moedas) : 0;
    if (!rascunho && todos.length) {
      // Uma fase só para o resto: dentro da tolerância das moedas, cada Aniimo a menos vale mais que
      // qualquer moeda (λ = a tolerância inteira); o que sobra de folga volta para as moedas, e um
      // Prismana só fica se render mais que um centésimo disso.
      const lambda = Math.max(1, ganho * TOLERANCIA_DO_GANHO);
      if (moedas.length) fixar('x3', moedas, '>=', ganho * (1 - TOLERANCIA_DO_GANHO));
      const prismana = new Set(prismanas.map(([, v]) => v));
      resolver('Maximize', [...moedas, ...todos.map(([, v]): Termo => [-lambda * (prismana.has(v) ? 1.01 : 1), v])]);
    } else if (!moedas.length && !faltas.length && !entrada.metas.length) resolver('Minimize', todos.length ? todos : [[1, 'z']]);
  }
  const real = (nome: string | undefined) => Math.max(0, colunas[nome ?? '']?.Primal ?? 0);
  const inteiro = (nome: string | undefined) => Math.round(real(nome));

  // ---- Do perfil para os Aniimo de verdade: os membros na ordem de preferência, até o que cada um tem ----
  const quem: QuemColocar[] = [];
  const restante = perfis.map((p) => p.membros.map((m) => m.cap));
  const pegar = (p: number, copias: number, funcao: Funcao, onde: (parte: number) => QuemColocar['onde']): AniimoLar[] => {
    const usados: AniimoLar[] = [];
    for (let k = 0; k < perfis[p]!.membros.length && copias > 0; k++) {
      const n = Math.min(copias, restante[p]![k]!);
      if (n <= 0) continue;
      restante[p]![k]! -= n;
      const aniimo = perfis[p]!.membros[k]!.aniimo;
      quem.push({ aniimo, copias: n, funcao, onde: onde(n) });
      for (let q = 0; q < n; q++) usados.push(aniimo);
      copias -= n;
    }
    return usados;
  };

  const filaDosFixos = new Map<string, AniimoLar[]>();
  for (const f of fs) {
    const postos = classes.get(f.classe)!;
    const usados = pegar(f.p, inteiro(f.nome), 'fixo', () => [...new Set(postos.map((x) => x.construcao))].map((chave) => ({ chave, tempo: 1 })));
    filaDosFixos.set(f.classe, [...(filaDosFixos.get(f.classe) ?? []), ...usados]);
  }
  const fixos = entrada.fixos.map((posto) => ({ posto, aniimo: filaDosFixos.get(`${posto.aptidao}|${posto.nivel}`)?.shift() ?? null }));
  for (const [i, nome] of gs) pegar(i, inteiro(nome), 'gerador', () => []);
  const atendidos = tarefas.map(() => 0);
  for (const [i, nome] of ws) {
    const n = inteiro(nome);
    tarefas.forEach((t, j) => {
      if (serve(perfis[i]!, t)) atendidos[j]! += n;
    });
    pegar(i, n, 'lotes', () => tarefas.filter((t) => serve(perfis[i]!, t)).map((t) => ({ chave: t.aptidao, tempo: 1 })));
  }
  perfis.forEach((_, i) => {
    const copias = inteiro(`v${i}`);
    if (!copias) return;
    const tempos = ts.filter((t) => t.p === i && real(t.nome) > 1e-6).map((t) => ({ chave: receitas[t.r]!.chave, tempo: real(t.nome) }));
    pegar(i, copias, 'maquinas', (parte) => tempos.map((t) => ({ chave: t.chave, tempo: (t.tempo * parte) / copias })));
  });

  const instalacoes = entrada.instalacoes.map((inst): InstalacaoEscolhida => {
    const escolhidas = inst.receitas
      .flatMap((receita): ReceitaEscolhida[] => {
        const j = receitas.indexOf(receita);
        if (!ativa[j]) return [];
        const rede = naRede[j] ? real(`u${j}`) : 0;
        const trabalhado = ts.filter((t) => t.r === j).reduce((s, t) => s + real(t.nome), 0) + rede;
        if (trabalhado < 1e-4) return [];
        // O modelo só limita as unidades por cima: conta as que o trabalho escolhido de fato ocupa.
        const unidades = Math.max(1, Math.min(rascunho ? inst.unidades : inteiro(`n${j}`), Math.ceil(trabalhado - 1e-4)));
        const ligadas = Math.max(0, Math.min(unidades, inteiro(`e${j}`), Math.ceil(rede - 1e-4)));
        return [{ receita, unidades, naRede: ligadas, ocupacao: Math.min(1, trabalhado / unidades), porHora: real(`c${j}`) * (receita.produz[Object.keys(receita.produz)[0]!] ?? 0) }];
      })
      .sort((x, y) => y.unidades * y.ocupacao - x.unidades * x.ocupacao);
    return { chave: inst.chave, unidades: inst.unidades, receitas: escolhidas, paradas: inst.unidades - escolhidas.reduce((s, e) => s + e.unidades, 0) };
  });

  // O que não passa por nenhuma receita é vendido como sai dos lotes.
  const vendido = [...new Set([...produtos, ...Object.keys(entrada.oferta)])]
    .map((produto) => {
      const porHora = venda.has(produto) ? real(venda.get(produto)) : (entrada.oferta[produto] ?? 0);
      return { produto, porHora, moedasPorHora: porHora * (entrada.precos[produto] ?? 0) };
    })
    .filter((v) => v.porHora > 1e-6)
    .sort((a, b) => b.moedasPorHora - a.moedasPorHora || a.produto.localeCompare(b.produto));
  const geradores = [...gs.values()].reduce((s, v) => s + inteiro(v), 0);

  return {
    instalacoes,
    quem,
    fixos,
    tarefas: entrada.tarefas.map((tarefa) => ({ tarefa, atendidos: tarefas.includes(tarefa) ? atendidos[tarefas.indexOf(tarefa)]! : 0 })),
    energia: {
      geradores,
      wattsUsados: instalacoes.reduce((s, i) => s + i.receitas.reduce((q, x) => q + x.naRede * (x.receita.watts ?? 0), 0), 0),
      wattsDisponiveis: geradores * entrada.energia.watts,
    },
    vendido,
    moedasPorHora: vendido.reduce((s, v) => s + v.moedasPorHora, 0),
    ritmo: entrada.metas.length ? objetivoDasMetas.reduce((q, [, v]) => q + real(v), 0) / objetivoDasMetas.length : null,
    total: quem.reduce((s, q) => s + q.copias, 0),
    limite: entrada.limite,
  };
}

/**
 * Aniimo com as mesmas aptidões são intercambiáveis: viram um perfil só (a espécie entra na chave quando
 * alguma receita pede a família dela). Dentro do perfil, vêm antes os de número menor.
 */
function agruparEmPerfis(aniimos: readonly AniimoLar[], receitas: readonly ReceitaDaEntrada[], opcoes: OpcoesEquipe): Perfil[] {
  const deFamilia = new Set(receitas.flatMap((r) => r.familia ?? []));
  const perfis = new Map<string, Perfil>();
  for (const aniimo of aniimos) {
    if (opcoes.excluirPrismana && aniimo.prismana) continue;
    const pedido = opcoes.roster ? Math.min(opcoes.roster[aniimo.id] ?? 0, opcoes.maxCopias ?? Infinity) : (opcoes.maxCopias ?? Infinity);
    const escolha = ESCOLHAS_POR_CONTA.findIndex((e) => e.especies.includes(especieDe(aniimo.id)));
    const cap = Math.min(pedido, ESCOLHAS_POR_CONTA[escolha]?.maximo ?? Infinity);
    const aptidoes = Object.entries(aniimo.aptidoes).filter(([, n]) => n).sort(([a], [b]) => a.localeCompare(b));
    if (cap <= 0 || !aptidoes.length) continue;
    const especie = deFamilia.has(especieDe(aniimo.id)) ? especieDe(aniimo.id) : null;
    const chave = `${JSON.stringify(aptidoes)}|${especie ?? ''}|${aniimo.prismana}|${escolha}`;
    const p = perfis.get(chave) ?? { aptidoes: aniimo.aptidoes, especie, prismana: aniimo.prismana, escolha, membros: [], cap: 0 };
    p.membros.push({ aniimo, cap });
    p.cap = Math.min(p.cap + cap, ESCOLHAS_POR_CONTA[escolha]?.maximo ?? Infinity);
    perfis.set(chave, p);
  }
  for (const p of perfis.values()) p.membros.sort((a, b) => a.aniimo.id.length - b.aniimo.id.length || a.aniimo.id.localeCompare(b.aniimo.id));
  // Sem limite de cópias, um perfil que outro iguala ou supera em toda aptidão nunca faz falta: sai do
  // modelo. (Um Prismana não tira um perfil comum: quem não quer Prismana ainda precisa dele.)
  const lista = [...perfis.values()];
  const supera = (b: Perfil, a: Perfil) =>
    b !== a && b.cap === Infinity && b.especie === a.especie && (!b.prismana || a.prismana) &&
    Object.entries(a.aptidoes).every(([ap, n]) => (b.aptidoes[ap as Aptidao] ?? 0) >= (n ?? 0)) &&
    // Empate total (mesmas aptidões, um deles Prismana): fica o comum.
    (Object.entries(b.aptidoes).some(([ap, n]) => (n ?? 0) > (a.aptidoes[ap as Aptidao] ?? 0)) || (a.prismana && !b.prismana));
  return lista.filter((a) => a.cap !== Infinity || !lista.some((b) => supera(b, a)));
}

/** Número para o formato LP: sem notação científica e sem "-0". */
function num(x: number): string {
  const s = (Math.abs(x) < 5e-7 ? 0 : x).toFixed(6).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
}

/** "3 a + b - 2 c", quebrada em linhas (o formato LP tem limite de tamanho de linha). */
function expressao(termos: readonly Termo[], porLinha = 8): string {
  const uteis = termos.filter(([k]) => Math.abs(k) >= 5e-7);
  if (!uteis.length) return '0 z';
  const partes = uteis.map(([k, v], i) => `${k < 0 ? '-' : i ? '+' : ''} ${Math.abs(k) === 1 ? '' : `${num(Math.abs(k))} `}${v}`.trim());
  const linhas: string[] = [];
  for (let i = 0; i < partes.length; i += porLinha) linhas.push(partes.slice(i, i + porLinha).join(' '));
  return linhas.join('\n ');
}

function quebrar(nomes: readonly string[], porLinha = 10): string {
  const linhas: string[] = [];
  for (let i = 0; i < nomes.length; i += porLinha) linhas.push(` ${nomes.slice(i, i + porLinha).join(' ')}`);
  return linhas.join('\n');
}

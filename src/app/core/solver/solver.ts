// Solver da Zona de Produção. TS puro, sem Angular: recebe o backend de ILP (HiGHS) por parâmetro,
// para rodar igual no Web Worker, no Node e nos testes.
//
// Modelo: x_i ∈ ℤ, 0 ≤ x_i ≤ cap_i = cópias do Aniimo i.
//   Fase 1: min Σ x_i                  s.a. Σ_i a_ij·x_i ≥ r_j  (a_ij ∈ {0,1}: tem ou não a aptidão j)
//   Fase 2: max Σ w_i·x_i              s.a. o mesmo + Σ x_i = ótimo da fase 1
//           w_i = soma dos níveis de i nas aptidões requeridas (só desempate).
// A otimização lexicográfica garante que o desempate nunca troca um Aniimo a mais por níveis maiores.
import type { LegacyHighs } from 'highs';
import { APTIDOES, type AniimoLar, type Aptidao, type VetorAptidoes, distribuicao } from '../data/models';

/** A API one-shot do HiGHS (`highs.solve`); só o tipo, o carregamento fica com quem chama. */
export type IlpBackend = LegacyHighs;

export interface OpcoesSolver {
  /**
   * Máximo de cópias de cada Aniimo. Padrão: 1; no modo "só os meus", sem limite além da quantidade
   * do roster.
   */
  maxCopias?: number;
  /** Modo "só os meus": id → quantidade que o usuário possui. Só esses entram no solver. */
  roster?: Readonly<Record<string, number>>;
  excluirPrismana?: boolean;
  /** Modo "complementar": sugere só o que falta adicionar à zona. */
  complementar?: {
    /** Distribuição atual da zona. Se omitida, é calculada a partir de `alocados`. */
    atual?: VetorAptidoes;
    /** id → cópias já alocadas; elas deixam de estar disponíveis para a sugestão. */
    alocados?: Readonly<Record<string, number>>;
  };
}

export interface Escolhido {
  aniimo: AniimoLar;
  copias: number;
}

export interface CoberturaAptidao {
  aptidao: Aptidao;
  requerido: number;
  /** Já presente na zona (modo complementar); 0 caso contrário. */
  atual: number;
  /** Contribuição dos Aniimo sugeridos. */
  adicionado: number;
  atingido: number;
  atendido: boolean;
}

export interface ResultadoSolver {
  /** false quando o roster disponível não alcança os requisitos; a sugestão é então a melhor parcial. */
  viavel: boolean;
  escolhidos: Escolhido[];
  /** Total de Aniimo sugeridos (somando cópias). */
  total: number;
  /** Soma dos níveis dos sugeridos nas aptidões que ainda faltavam (critério de desempate). */
  somaNiveis: number;
  cobertura: CoberturaAptidao[];
  /** Aptidões que não dá para atingir com o disponível, e quanto falta. */
  faltando: { aptidao: Aptidao; falta: number }[];
}

const OPCOES_HIGHS = { output_flag: false, mip_rel_gap: 0, mip_abs_gap: 0 };

export function otimizar(
  ilp: IlpBackend,
  aniimos: readonly AniimoLar[],
  requisitos: VetorAptidoes,
  opcoes: OpcoesSolver = {},
): ResultadoSolver {
  validarVetor(requisitos, 'requisitos');
  const alocados = opcoes.complementar?.alocados ?? {};
  const porId = new Map(aniimos.map((a) => [a.id, a]));
  for (const id of [...Object.keys(opcoes.roster ?? {}), ...Object.keys(alocados)])
    if (!porId.has(id)) throw new RangeError(`Aniimo desconhecido: ${id}`);

  const atual = opcoes.complementar
    ? (opcoes.complementar.atual ??
      distribuicao(Object.entries(alocados).map(([id, copias]) => ({ aniimo: porId.get(id)!, copias }))))
    : APTIDOES.map(() => 0);
  validarVetor(atual, 'distribuição atual');
  const falta = requisitos.map((r, j) => Math.max(0, r - atual[j]!));

  // Candidatos: disponíveis e com ao menos uma aptidão que ainda falta.
  const candidatos: { aniimo: AniimoLar; cap: number; peso: number }[] = [];
  for (const aniimo of aniimos) {
    if (opcoes.excluirPrismana && aniimo.prismana) continue;
    const cap = Math.max(0, capacidade(aniimo.id, opcoes) - (alocados[aniimo.id] ?? 0));
    const peso = APTIDOES.reduce((s, ap, j) => s + (falta[j]! > 0 ? (aniimo.aptidoes[ap] ?? 0) : 0), 0);
    if (cap > 0 && peso > 0) candidatos.push({ aniimo, cap, peso });
  }

  // Inviabilidade não precisa de ILP: sem limite de vagas, o máximo de cada aptidão é usar tudo.
  const maximo = APTIDOES.map((ap) => candidatos.reduce((s, c) => s + (c.aniimo.aptidoes[ap] ? c.cap : 0), 0));
  const faltando = APTIDOES.map((aptidao, j) => ({ aptidao, falta: falta[j]! - maximo[j]! })).filter((f) => f.falta > 0);
  // Se inviável, sugere a melhor cobertura possível: atinge o máximo onde não dá para atingir tudo.
  const alvo = falta.map((f, j) => Math.min(f, maximo[j]!));

  const x = alvo.some((r) => r > 0) ? resolver(ilp, candidatos, alvo) : [];
  const escolhidos = candidatos
    .map((c, i) => ({ aniimo: c.aniimo, copias: x[i] ?? 0 }))
    .filter((e) => e.copias > 0)
    .sort((a, b) => a.aniimo.id.localeCompare(b.aniimo.id));

  const adicionado = distribuicao(escolhidos);
  const cobertura = APTIDOES.map((aptidao, j) => {
    const atingido = atual[j]! + adicionado[j]!;
    return { aptidao, requerido: requisitos[j]!, atual: atual[j]!, adicionado: adicionado[j]!, atingido, atendido: atingido >= requisitos[j]! };
  });

  return {
    viavel: faltando.length === 0,
    escolhidos,
    total: escolhidos.reduce((s, e) => s + e.copias, 0),
    somaNiveis: escolhidos.reduce(
      (s, e) => s + e.copias * APTIDOES.reduce((t, ap, j) => t + (falta[j]! > 0 ? (e.aniimo.aptidoes[ap] ?? 0) : 0), 0),
      0,
    ),
    cobertura,
    faltando,
  };
}

function capacidade(id: string, opcoes: OpcoesSolver): number {
  if (opcoes.roster) return Math.min(opcoes.roster[id] ?? 0, opcoes.maxCopias ?? Infinity);
  return opcoes.maxCopias ?? 1;
}

function validarVetor(v: VetorAptidoes, nome: string) {
  if (v.length !== APTIDOES.length) throw new RangeError(`${nome}: esperado ${APTIDOES.length} valores, recebido ${v.length}`);
  if (v.some((n) => !Number.isInteger(n) || n < 0)) throw new RangeError(`${nome}: só inteiros ≥ 0`);
}

/** Resolve as duas fases e devolve x_i por candidato. `alvo` precisa ser atingível. */
function resolver(ilp: IlpBackend, candidatos: readonly { aniimo: AniimoLar; cap: number; peso: number }[], alvo: readonly number[]): number[] {
  const nomes = candidatos.map((_, i) => `x${i}`);
  const cobertura = APTIDOES.flatMap((ap, j) =>
    alvo[j]! > 0 ? [` c${j}: ${soma(nomes.filter((_, i) => candidatos[i]!.aniimo.aptidoes[ap]))} >= ${alvo[j]}`] : [],
  );
  const limites = candidatos.map((c, i) => (Number.isFinite(c.cap) ? ` 0 <= x${i} <= ${c.cap}` : ` x${i} >= 0`));
  const modelo = (objetivo: string, extras: string[] = []) =>
    [objetivo, 'Subject To', ...cobertura, ...extras, 'Bounds', ...limites, 'Generals', quebrar(nomes, ' '), 'End'].join('\n');

  const fase1 = executar(ilp, modelo(`Minimize\n obj: ${soma(nomes)}`));
  const total = Math.round(fase1.ObjectiveValue);

  const pesos = candidatos.map((c, i) => `${c.peso} x${i}`);
  const fase2 = executar(ilp, modelo(`Maximize\n obj: ${soma(pesos)}`, [` card: ${soma(nomes)} = ${total}`]));
  return nomes.map((n) => Math.round(fase2.Columns[n]?.Primal ?? 0));
}

function executar(ilp: IlpBackend, lp: string) {
  const r = ilp.solve(lp, OPCOES_HIGHS);
  if (r.Status !== 'Optimal') throw new Error(`Solver terminou com status ${r.Status}`);
  return r;
}

const soma = (termos: readonly string[]) => (termos.length ? quebrar(termos, ' + ') : '0');

/** Quebra expressões longas em várias linhas (o formato LP tem limite de tamanho de linha). */
function quebrar(termos: readonly string[], sep: string, porLinha = 10): string {
  const linhas: string[] = [];
  for (let i = 0; i < termos.length; i += porLinha) linhas.push(termos.slice(i, i + porLinha).join(sep));
  return linhas.join(sep.trim() ? `\n ${sep.trim()} ` : '\n ');
}

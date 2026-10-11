// Rearruma as Fazendas e os Bosques para a escolha de culturas, dentro dos terrenos de cultivo. O que é
// fixo na base são os terrenos, as sub-regiões de cultivo e as construções (inclusive as de ambiente e
// os armazéns); a posição e o tipo de cada lote podem mudar dentro das sub-regiões (decisão do
// usuário), e o total de Fazendas e de Bosques é o mesmo.
//
// Para cada combinação de modos dos ambientes, os lotes são reposicionados numa malha de 2 tiles que
// começa no canto de cada sub-região (então tudo que coube na base cabe de novo):
// 1. um lote "ativo" para cada cultura escolhida (em terreno já aberto no nível do jogador e em zona de
//    ambiente já construído, ou sem ambiente), começando pelos grupos com menos opções;
// 2. mais lotes úteis de ambiente, pelo valor por célula, até o limite de cada tipo (o total menos a parte
//    das culturas sem ambiente, calculada como na base e nunca menor que uma por cultura);
// 3. o resto em qualquer espaço livre, sem ambiente primeiro e nos terrenos que abrem antes.
// Vence a combinação em que mais culturas escolhidas têm lote ativo; depois mais lotes úteis; depois
// valor. Empate mantém os modos atuais. Se não couber tudo, a base fica como está. TS puro.
import { combinacoes } from './ambientes';
import { TAMANHO_LOTE } from './empacotamento';
import { type FonteAmbiente, type Retangulo, condicaoDoLote, contem, quadrado, sobrepoe } from './geometria';
import { moedasPorHora } from './inventario';
import type { Ambiente, DadosConstrucao } from './modelos-lar';
import type { ItemMapa, PlantaLar } from './planta';
import { type Sugestoes, type TipoLote, culturasPara } from './sugestao';
import { terreno } from './terrenos';

type ItemConstrucao = Extract<ItemMapa, { tipo: 'construcao' }>;
type Cobertura = Extract<ItemMapa, { tipo: 'cobertura' }>;
type Contagem = Record<TipoLote, number>;

const PASSO = 2;
const CELULAS: Readonly<Contagem> = { farmland: 1, woodland: 4 };
const TIPOS: readonly TipoLote[] = ['woodland', 'farmland'];

interface Posicao {
  regiao: number;
  tipo: TipoLote;
  area: Retangulo;
  condicao: Ambiente | null;
  /** O terreno está aberto e todos os ambientes que cobrem o lote já estão construídos no nível do jogador. */
  ativo: boolean;
  distancia: number;
  /** RV em que o terreno da sub-região abre. */
  rvTerreno: number;
}

interface Regiao {
  area: Retangulo;
  /** Índice do bloco (terreno de cultivo) da sub-região e o RV em que ele abre. */
  bloco: number;
  rvTerreno: number;
  ocupado: Retangulo[];
  ambientes: ItemConstrucao[];
}

export interface ResultadoRearranjo {
  /** Lotes que já produzem no nível do jogador (zona de ambiente construído, ou sem ambiente). */
  ativos: Set<ItemConstrucao>;
  /** false quando os lotes não couberam nas sub-regiões e a planta ficou como estava. */
  coube: boolean;
}

export interface OpcoesRearranjo {
  /** Nível do jogador: terrenos fechados e ambientes ainda não construídos não contam como zona ativa. */
  rv?: number;
  /** Mantém o modo atual de cada ambiente (montagem da base). */
  manterModos?: boolean;
}

const eLote = (i: ItemMapa): i is ItemConstrucao => i.tipo === 'construcao' && (i.construcao === 'farmland' || i.construcao === 'woodland');
const melhorNota = (a: readonly number[], b: readonly number[] | undefined) =>
  !b || a[0]! > b[0]! || (a[0] === b[0] && (a[1]! > b[1]! || (a[1] === b[1] && a[2]! > b[2]! + 1e-9)));
const centro = (r: Retangulo) => `${r.x + r.largura / 2},${r.y + r.altura / 2}`;

/** A cobertura de cada construção de ambiente (mesmo centro). */
export function coberturasDosAmbientes(itens: readonly ItemMapa[], ambientes: readonly ItemConstrucao[]): Map<ItemConstrucao, Cobertura> {
  const coberturas = itens.filter((i): i is Cobertura => i.tipo === 'cobertura');
  return new Map(ambientes.map((a) => [a, coberturas.find((c) => centro(c.area) === centro(a.area))!]));
}

/** Tamanho do grupo de cada ambiente: os que se sobrepõem (o par Forno de Calor + Resfriador) contam juntos. */
export function tamanhoDoGrupo(ambientes: readonly ItemConstrucao[], coberturaDe: ReadonlyMap<ItemConstrucao, Cobertura>): Map<ItemConstrucao, number> {
  return new Map(ambientes.map((a) => [a, ambientes.filter((b) => sobrepoe(coberturaDe.get(a)!.area, coberturaDe.get(b)!.area)).length]));
}

/** Ambientes construídos no RV: mesma ordem da liberação (grupos maiores primeiro, depois leitura). */
function construidos(
  ambientes: readonly ItemConstrucao[],
  coberturaDe: ReadonlyMap<ItemConstrucao, Cobertura>,
  dados: DadosConstrucao,
  rv: number | undefined,
): Set<ItemConstrucao> {
  if (rv === undefined) return new Set(ambientes);
  const grupo = tamanhoDoGrupo(ambientes, coberturaDe);
  const ordem = [...ambientes].sort((a, b) => grupo.get(b)! - grupo.get(a)! || a.area.y - b.area.y || a.area.x - b.area.x);
  const vistos = new Map<string, number>();
  const saida = new Set<ItemConstrucao>();
  for (const a of ordem) {
    const k = (vistos.get(a.construcao) ?? 0) + 1;
    vistos.set(a.construcao, k);
    if (k <= (dados.construcoes.find((c) => c.chave === a.construcao)?.quantidadePorRv[rv - 1] ?? 0)) saida.add(a);
  }
  return saida;
}

/**
 * Reposiciona os lotes e escolhe os modos. Altera os itens da planta no lugar (tipo, área e condição dos
 * lotes; modo dos ambientes e das coberturas). Sem `rv`, todos os terrenos e ambientes contam.
 */
export function rearranjar(planta: Pick<PlantaLar, 'itens' | 'blocos'>, dados: DadosConstrucao, sug: Sugestoes, opcoes: OpcoesRearranjo = {}): ResultadoRearranjo {
  const { rv } = opcoes;
  const regras = dados.regras;
  const itens = planta.itens;
  const lotes = itens.filter(eLote);
  const ambientes = itens.filter((i): i is ItemConstrucao => i.tipo === 'construcao' && i.construcao in regras.construcoes);
  const semMudanca = (coube: boolean) => ({ ativos: new Set(lotes), coube });
  const areasDasRegioes = planta.blocos.flatMap((b, bloco) => (b.regioes ?? []).map((area) => ({ area, bloco, rvTerreno: terreno(b.terreno).rv })));
  if (!areasDasRegioes.length) return semMudanca(!lotes.length);

  const coberturaDe = coberturasDosAmbientes(itens, ambientes);
  const prontos = construidos(ambientes, coberturaDe, dados, rv);
  // A malha começa no canto da sub-região; o que não é lote (ambientes, armazéns) ocupa as suas células.
  const fixas = itens.filter((i): i is ItemConstrucao => i.tipo === 'construcao' && !eLote(i));
  const regioes: Regiao[] = areasDasRegioes.map(({ area, bloco, rvTerreno }) => ({
    area,
    bloco,
    rvTerreno,
    ocupado: fixas.filter((f) => sobrepoe(area, f.area)).map((f) => f.area),
    ambientes: ambientes.filter((a) => sobrepoe(area, coberturaDe.get(a)!.area)),
  }));

  const familias = (tipo: TipoLote, condicao: Ambiente | null) => culturasPara(sug, tipo, condicao).length;
  const valor = (tipo: TipoLote, condicao: Ambiente | null) => {
    const c = culturasPara(sug, tipo, condicao)[0];
    return c ? moedasPorHora(c) : 0;
  };

  // Total de cada tipo e o limite em zona de ambiente (o resto fica para as culturas sem ambiente).
  const total: Contagem = { farmland: 0, woodland: 0 };
  for (const l of lotes) total[l.construcao as TipoLote]++;
  const limite: Contagem = { farmland: total.farmland, woodland: total.woodland };
  for (const tipo of TIPOS) {
    const neutras = familias(tipo, null);
    if (!neutras) continue;
    const todas = new Set([...sug.keys()].filter((k) => k.startsWith(`${tipo}|`)).flatMap((k) => sug.get(k)!.map((p) => p.chave))).size;
    limite[tipo] = Math.max(0, total[tipo] - Math.max(neutras, Math.round((total[tipo] * neutras) / Math.max(1, todas))));
  }

  // Os lotes que o jogador já pode ter no seu nível ficam em terrenos já abertos: nos que abrem depois só
  // cabe o que ele ainda vai ganhar.
  const permitido = (tipo: TipoLote, noRv: number) => dados.construcoes.find((c) => c.chave === tipo)?.quantidadePorRv[noRv - 1] ?? 0;
  const teto: Teto | undefined =
    rv === undefined
      ? undefined
      : { rv, depois: { farmland: Math.max(0, total.farmland - permitido('farmland', rv)), woodland: Math.max(0, total.woodland - permitido('woodland', rv)) } };

  const modosDe = ambientes.map((a) => {
    const modos = regras.construcoes[a.construcao]!.modos;
    if (opcoes.manterModos && a.condicao) return [a.condicao];
    return a.condicao ? [a.condicao, ...modos.filter((m) => m !== a.condicao)] : [...modos];
  });

  let melhor: { modos: Ambiente[]; posicoes: Posicao[]; nota: [number, number, number] } | undefined;
  for (const modos of combinacoes(modosDe)) {
    const modoDe = new Map(ambientes.map((a, i) => [a, modos[i]!]));
    const candidatos = regioes.flatMap((r, i) =>
      malha(
        i,
        r,
        r.ambientes.map((a) => ({ area: coberturaDe.get(a)!.area, modo: modoDe.get(a)!, pronto: prontos.has(a) })),
        regras,
        rv,
      ),
    );
    const r = arrumar(candidatos, familias, valor, total, limite, teto);
    if (r && melhorNota(r.nota, melhor?.nota)) melhor = { ...r, modos };
  }
  if (!melhor) return semMudanca(false);

  // Aplica: modos dos ambientes e novas posições e tipos dos lotes (reaproveitando os itens existentes).
  ambientes.forEach((a, i) => {
    a.condicao = melhor!.modos[i]!;
    coberturaDe.get(a)!.modo = melhor!.modos[i]!;
  });
  const nivel = (tipo: TipoLote) => lotes.find((l) => l.construcao === tipo)?.nivel ?? 1;
  const leitura = (a: { area: Retangulo }, b: { area: Retangulo }) => a.area.y - b.area.y || a.area.x - b.area.x;
  const sobra = [...lotes].sort((a, b) => (a.construcao === b.construcao ? 0 : a.construcao === 'woodland' ? -1 : 1) || leitura(a, b));
  const ativos = new Set<ItemConstrucao>();
  for (const tipo of TIPOS)
    for (const d of melhor.posicoes.filter((x) => x.tipo === tipo).sort(leitura)) {
      const i = sobra.findIndex((l) => l.construcao === tipo);
      const item = sobra.splice(i >= 0 ? i : 0, 1)[0]!;
      item.construcao = tipo;
      item.nivel = nivel(tipo);
      item.area = d.area;
      item.condicao = d.condicao;
      item.bloco = regioes[d.regiao]!.bloco;
      item.terreno = planta.blocos[item.bloco]!.terreno;
      if (d.ativo) ativos.add(item);
    }
  return { ativos, coube: true };
}

/** Quantos lotes de cada tipo podem ficar, no máximo, em terrenos que abrem depois do RV `rv`. */
interface Teto {
  rv: number;
  depois: Contagem;
}

/** Posiciona todos os lotes para uma combinação de modos; undefined se não couber tudo. */
function arrumar(
  candidatos: readonly Posicao[],
  familias: (tipo: TipoLote, condicao: Ambiente | null) => number,
  valor: (tipo: TipoLote, condicao: Ambiente | null) => number,
  total: Readonly<Contagem>,
  limite: Readonly<Contagem>,
  teto: Teto | undefined,
): { posicoes: Posicao[]; nota: [number, number, number] } | undefined {
  const util = (p: Posicao) => familias(p.tipo, p.condicao) > 0;
  const postos: Posicao[] = [];
  const usados: Contagem = { farmland: 0, woodland: 0 };
  const emAmbiente: Contagem = { farmland: 0, woodland: 0 };
  const livre = (p: Posicao) => !postos.some((q) => q.regiao === p.regiao && sobrepoe(q.area, p.area));
  const noTeto = (p: Posicao) =>
    !teto || p.rvTerreno <= teto.rv || postos.filter((q) => q.tipo === p.tipo && q.rvTerreno > teto.rv).length < teto.depois[p.tipo];
  const cabe = (p: Posicao) =>
    usados[p.tipo] < total[p.tipo] && (p.condicao === null || emAmbiente[p.tipo] < limite[p.tipo]) && noTeto(p) && livre(p);
  const por = (p: Posicao) => {
    postos.push(p);
    usados[p.tipo]++;
    if (p.condicao !== null) emAmbiente[p.tipo]++;
  };

  // 1ª passada: um lote ativo por cultura escolhida em cada (tipo, condição), grupos mais raros primeiro.
  const grupos = new Map<string, { faltam: number; opcoes: Posicao[] }>();
  for (const p of candidatos) {
    if (!p.ativo || !util(p)) continue;
    const k = `${p.tipo}|${p.condicao ?? ''}`;
    const g = grupos.get(k) ?? { faltam: familias(p.tipo, p.condicao), opcoes: [] };
    g.opcoes.push(p);
    grupos.set(k, g);
  }
  for (const g of [...grupos.values()].sort((a, b) => a.opcoes.length - b.opcoes.length))
    for (const p of [...g.opcoes].sort((x, y) => x.distancia - y.distancia)) {
      if (g.faltam <= 0) break;
      if (cabe(p)) {
        por(p);
        g.faltam--;
      }
    }

  // 2ª passada: mais lotes úteis de ambiente (ativos antes), pelo valor por célula, até o limite do tipo.
  const uteis = candidatos.filter((p) => p.condicao !== null && util(p));
  uteis.sort(
    (x, y) =>
      Number(y.ativo) - Number(x.ativo) ||
      valor(y.tipo, y.condicao) / CELULAS[y.tipo] - valor(x.tipo, x.condicao) / CELULAS[x.tipo] ||
      x.distancia - y.distancia,
  );
  for (const p of uteis) if (cabe(p)) por(p);

  // 3ª passada: o resto em qualquer espaço livre, Bosques antes (ocupam mais), sem ambiente primeiro.
  for (const tipo of TIPOS) {
    const resto = candidatos
      .filter((p) => p.tipo === tipo)
      .sort((x, y) => Number(x.condicao !== null) - Number(y.condicao !== null) || x.rvTerreno - y.rvTerreno || x.distancia - y.distancia);
    for (const p of resto) {
      if (usados[tipo] >= total[tipo]) break;
      if (livre(p) && noTeto(p) && (p.condicao === null || emAmbiente[tipo] < total[tipo])) por(p);
    }
  }
  if (usados.farmland !== total.farmland || usados.woodland !== total.woodland) return undefined;

  const nota: [number, number, number] = [0, 0, 0];
  const ativosPorGrupo = new Map<string, { n: number; tipo: TipoLote; condicao: Ambiente | null }>();
  for (const p of postos) {
    if (!util(p)) continue;
    nota[1]++;
    nota[2] += valor(p.tipo, p.condicao);
    if (!p.ativo) continue;
    const k = `${p.tipo}|${p.condicao ?? ''}`;
    ativosPorGrupo.set(k, { n: (ativosPorGrupo.get(k)?.n ?? 0) + 1, tipo: p.tipo, condicao: p.condicao });
  }
  for (const g of ativosPorGrupo.values()) nota[0] += Math.min(g.n, familias(g.tipo, g.condicao));
  return { posicoes: postos, nota };
}

/** Posições de lote de uma sub-região na malha de 2 tiles alinhada à base. */
function malha(indice: number, r: Regiao, fontes: readonly (FonteAmbiente & { pronto: boolean })[], regras: DadosConstrucao['regras'], rv: number | undefined): Posicao[] {
  const aberto = rv === undefined || r.rvTerreno <= rv;
  const cx = r.area.x + r.area.largura / 2;
  const cy = r.area.y + r.area.altura / 2;
  const saida: Posicao[] = [];
  for (const tipo of TIPOS) {
    const lado = TAMANHO_LOTE[tipo];
    for (let y = r.area.y; y + lado <= r.area.y + r.area.altura + 1e-9; y += PASSO)
      for (let x = r.area.x; x + lado <= r.area.x + r.area.largura + 1e-9; x += PASSO) {
        const area = quadrado(x, y, lado);
        if (!contem(r.area, area) || r.ocupado.some((o) => sobrepoe(o, area))) continue;
        const toca = fontes.filter((f) => sobrepoe(area, f.area));
        saida.push({
          regiao: indice,
          tipo,
          area,
          condicao: condicaoDoLote(area, fontes, regras),
          ativo: aberto && toca.every((f) => f.pronto),
          distancia: Math.hypot(x + lado / 2 - cx, y + lado / 2 - cy),
          rvTerreno: r.rvTerreno,
        });
      }
  }
  return saida;
}

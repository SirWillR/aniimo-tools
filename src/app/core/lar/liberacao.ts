// Em que nível do Lar (RV) cada espaço da base final é liberado. A base é montada para o RV máximo e o
// jogador vai construindo nos espaços reservados enquanto sobe: a cada RV, a quantidade permitida de
// cada construção cresce e os espaços novos são escolhidos assim:
// - ambientes primeiro, o par Fornalha + Resfriador antes dos avulsos (só funciona completo);
// - Fazendas e Bosques: entre os lotes que já servem naquele RV (ambiente do bloco construído e cultura
//   liberada), a cultura escolhida com menos lotes até ali ganha o próximo (revezamento), para cada
//   cultura marcada ter lote assim que possível; as coringas servem assim que o terreno abre e, depois
//   do primeiro lote de cada cultura, passam na frente dos lotes repetidos (semente de evento é para
//   plantar agora); lote sem cultura fica por último;
// - o resto, e os empates, pelos terrenos que abrem antes e, dentro do terreno, na ordem de leitura (de
//   cima para baixo, da esquerda para a direita);
// - nenhum espaço libera antes do seu terreno.
// Com `rvAtual`, os espaços que o jogador já tem são escolhidos primeiro, revezando entre as culturas
// úteis nesse nível; só depois cada um recebe o seu RV. Depende das culturas dos lotes. TS puro.
import type { DadosConstrucao, Produto } from './modelos-lar';
import type { ItemMapa, PlantaLar } from './planta';
import { sobrepoe } from './geometria';
import { coberturasDosAmbientes, tamanhoDoGrupo } from './rearranjo';
import { familia } from './sugestao';
import { terreno } from './terrenos';

type ItemConstrucao = Extract<ItemMapa, { tipo: 'construcao' }>;

/** RV em que cada construção da planta libera. Ausente = sem dado de nível (chocadeira, armazém): sempre disponível. */
export function liberacaoPorItem(planta: PlantaLar, dados: DadosConstrucao, rvAtual?: number): Map<ItemConstrucao, number> {
  const porChave = new Map(dados.construcoes.map((c) => [c.chave, c]));
  const saida = new Map<ItemConstrucao, number>();
  const rvDoTerreno = (i: ItemConstrucao) => terreno(i.terreno).rv;
  const leitura = (a: ItemConstrucao, b: ItemConstrucao) => rvDoTerreno(a) - rvDoTerreno(b) || a.area.y - b.area.y || a.area.x - b.area.x;
  const todos = planta.itens.filter((i): i is ItemConstrucao => i.tipo === 'construcao').sort(leitura);
  const ehAmbiente = (i: ItemConstrucao) => i.construcao in dados.regras.construcoes;
  const contagem = new Map<string, number>();
  const atribuir = (itens: readonly ItemConstrucao[]) => {
    for (const i of itens) {
      const c = porChave.get(i.construcao);
      if (!c) continue;
      const k = (contagem.get(i.construcao) ?? 0) + 1;
      contagem.set(i.construcao, k);
      const indice = c.quantidadePorRv.findIndex((q) => q >= k);
      if (indice >= 0) saida.set(i, Math.max(indice + 1, rvDoTerreno(i)));
    }
  };
  // Grupos maiores primeiro: o par Forno de Calor + Resfriador só funciona com os dois.
  const ambientes = todos.filter(ehAmbiente);
  const coberturaDe = coberturasDosAmbientes(planta.itens, ambientes);
  const tamanho = tamanhoDoGrupo(ambientes, coberturaDe);
  atribuir([...ambientes].sort((a, b) => tamanho.get(b)! - tamanho.get(a)! || leitura(a, b)));
  // RV em que o lote tem todos os ambientes que o cobrem funcionando (0 = nenhum o cobre).
  const rvDosAmbientes = (l: ItemConstrucao) =>
    Math.max(0, ...ambientes.filter((a) => sobrepoe(coberturaDe.get(a)!.area, l.area)).map((a) => saida.get(a) ?? 0));

  const lote = (i: ItemConstrucao) => i.construcao === 'farmland' || i.construcao === 'woodland';
  atribuir(todos.filter((i) => !ehAmbiente(i) && !lote(i)));

  // A partir de que RV o lote serve: terreno aberto, ambiente (se ele depende de um) e cultura liberada.
  const serveDesde = (i: ItemConstrucao) => {
    // Coringa serve assim que o terreno abre: a semente de evento é plantada quando aparecer.
    if (i.coringa) return rvDoTerreno(i);
    const rvCultura = i.cultura ? (rvDoProduto(i.cultura, dados) ?? Infinity) : Infinity;
    return Math.max(rvDoTerreno(i), i.condicao ? rvDosAmbientes(i) : 0, rvCultura);
  };
  const grupo = (i: ItemConstrucao) => (i.coringa ? 'coringa' : i.cultura ? familia(i.cultura.chave) : '');
  for (const chave of ['farmland', 'woodland']) {
    const c = porChave.get(chave);
    if (!c) continue;
    const doTipo = todos.filter((i) => i.construcao === chave).map((i) => ({ i, desde: serveDesde(i) }));
    type Lote = (typeof doTipo)[number];
    const porCultura = new Map<string, number>();
    // Coringa é para plantar agora (semente de evento): depois que cada cultura tem o seu primeiro lote,
    // as coringas passam na frente dos lotes repetidos.
    const vez = (r: Lote) => {
      const n = porCultura.get(grupo(r.i)) ?? 0;
      return r.i.coringa ? Math.min(n, 0.5) : n;
    };
    /**
     * Tira de `fila` o próximo lote: entre os que servem no RV, a cultura com menos lotes até ali; se
     * nenhum serve, um de terreno já aberto (o que serve antes); se nem isso, o do terreno que abre antes.
     */
    const proximo = (fila: Lote[], rv: number) => {
      const uteis = fila.filter((r) => r.desde <= rv);
      const abertos = fila.filter((r) => rvDoTerreno(r.i) <= rv);
      const escolhido = uteis.length
        ? uteis.reduce((a, b) => (vez(b) < vez(a) ? b : a))
        : abertos.length
          ? abertos.reduce((a, b) => (b.desde < a.desde ? b : a))
          : fila.reduce((a, b) => (rvDoTerreno(b.i) < rvDoTerreno(a.i) ? b : a));
      porCultura.set(grupo(escolhido.i), (porCultura.get(grupo(escolhido.i)) ?? 0) + 1);
      fila.splice(fila.indexOf(escolhido), 1);
      return escolhido;
    };

    // Primeiro, os espaços que o jogador já tem no seu nível: revezando entre as culturas úteis agora,
    // para cada cultura escolhida ter lote no nível atual (e não só lá na frente).
    const rvAgora = Math.min(rvAtual ?? c.quantidadePorRv.length, c.quantidadePorRv.length);
    const restantes = [...doTipo];
    const agora: Lote[] = [];
    for (let n = Math.min(c.quantidadePorRv[rvAgora - 1] ?? 0, restantes.length); n > 0; n--) agora.push(proximo(restantes, rvAgora));

    // Depois, o RV de cada um: os de agora nos RVs até o atual; os demais nos RVs seguintes.
    porCultura.clear();
    let anterior = 0;
    c.quantidadePorRv.forEach((qtd, indice) => {
      const rv = indice + 1;
      const fila = rv <= rvAgora ? agora : restantes;
      for (let novos = qtd - anterior; novos > 0 && fila.length; novos--) {
        const { i } = proximo(fila, rv);
        saida.set(i, Math.max(rv, rvDoTerreno(i)));
      }
      anterior = Math.max(anterior, qtd);
    });
  }
  return saida;
}

/** Primeiro RV em que o produto pode ser feito (nível da construção e módulo). */
export function rvDoProduto(produto: Produto, dados: DadosConstrucao): number | null {
  const c = dados.construcoes.find((x) => x.chave === produto.construcao);
  if (!c) return null;
  const i = c.nivelPorRv.findIndex(
    (nivel, rv) =>
      nivel >= produto.nivel && (!produto.modulo || (dados.modulosPorRv[produto.modulo.chave]?.[rv] ?? 0) >= produto.modulo.nivel),
  );
  return i >= 0 ? i + 1 : null;
}

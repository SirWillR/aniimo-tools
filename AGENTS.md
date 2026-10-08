# AGENTS.md

Contexto para agentes de IA. Para humanos, veja o [README.md](README.md).

Otimizador de Zona de Produção do Lar do jogo Aniimo: dado um vetor de 13 requisitos, sugere o menor
número de Aniimo que atinge todos. Angular 22 (standalone, signals, zoneless, control flow novo),
TypeScript strict, SCSS, Vitest via `ng test`. Textos da UI e do código em português.

## Ambiente

- Node ≥ 22.22.3 (Angular 22). O usuário usa nvm (nvm-sh no Git Bash) e o padrão dos shells ainda é o
  Node 20: prefixe comandos com `nvm use 24 >/dev/null &&`. Não mexa na instalação global do Node.
- O aviso "Node.js version v20.19.0 detected" no início de todo shell vem do `ng completion` do
  `~/.bashrc` do usuário. É inofensivo; não é o projeto.
- Comandos: `npm start`, `npm test` (`ng test --watch=false` para rodar uma vez), `npm run build`,
  `npm run data`, `npm run data:lar`.

## Decisões do usuário (não reabrir sem perguntar)

- **Dados só da wiki oficial** (wiki.aniimo.com). Não completar com Hideout Guides, game8 nem outros
  sites; pergunte antes de raspar qualquer outra fonte. Espécies ausentes da wiki ficam de fora.
  **Exceção aprovada (2026-09-26):** a construção do Lar (instalações, produtos, ambientes) usa o
  aniimax (github.com/ae-bii/aniimax, MIT, © aebii), num commit fixo. Só essa parte; os Aniimo
  continuam vindo só da wiki. Crédito ao aniimax obrigatório na UI.
- Nomes das 13 aptidões e as traduções PT (tabela abaixo) foram aprovados.
- Solver: HiGHS (`highs`, MIT). `glpk.js` descartado por ser GPL-3.0; `javascript-lp-solver` por
  problemas numéricos em ILP.
- Sem bibliotecas de UI sem perguntar.
- Trabalhar por etapas e parar para validação do usuário entre elas.

## Dados

Arquivo: `src/assets/data/aniimo-home-abilities.json`, gerado por `scripts/extract-home-abilities.ts`
(`npm run data`; `-- --fresh` ignora o cache em `scripts/.cache/`). Não edite o JSON à mão.

Formato:

```jsonc
{
  "fonte": { "site", "endpoint", "extraidoEm" /* ISO */, "formas", "nota" },
  "aptidoes": [{ "chave", "codigo", "en", "pt", "tipo": "elemental" | "trabalho" }],  // ordem do jogo
  "aniimos": [{
    "id": "001-basic-form",          // {numero}-{forma-slug}; numero pode ter 3 ou 5 dígitos (ex.: 10002)
    "nome": "Brasim", "nomeEn": "Emberpup",
    "forma": "Forma Básica", "formaEn": "Basic Form",
    "prismana": false,               // true quando a forma é prismana-form
    "elementos": ["fire"],           // elementos de combate, nomes internos da wiki
    "imagem": "https://worldx-website-cdn.aniimo.com/...",  // CDN oficial, hotlink
    "aptidoes": { "fire": 1, "hauling": 1 }  // aptidão → nível (1 a 4)
  }]
}
```

Extração de 2026-09-25: 208 formas de 88 espécies, 27 Prismana. Algumas espécies não têm "Basic Form"
(ex.: Somniwing só tem a forma Prismana), então não assuma que toda espécie tem forma básica.

### Como a wiki expõe os dados

- Índice: `https://wiki.aniimo.com/__sitemap__/en-US.xml` → rotas `/item/{numero}/{forma}`.
- Cada forma: `/item/{numero}/{forma}/_payload.json` (EN) e `/pt/item/...` (PT). É um payload Nuxt
  serializado com `devalue` (`unflatten` + revivers para `ShallowReactive`, `Ref` etc.).
- Em `data["aniimo-detail-..."].directories[].components[]`:
  - `type: "aniimoInfo"` → `props.formData` (name, currentMorphology, attributes, imagens…).
  - Bloco "Homeland Ability" → filhos `capsule` com `props.customKey = "home-XXXX"` e
    `props.title = nível`. A wiki **não** publica o nome das aptidões, só os códigos.
- `currentMorphology` é uma chave sempre em inglês; o nome PT da forma vem da tabela
  `data["morphology-tags-..."]` (`tagKey` → `name`).
- Rate limit do script: 2 requisições em paralelo, 300 ms entre elas, retry com backoff exponencial.

### Mapeamento código → aptidão (ordem da tela do jogo)

| # | Código | Chave | EN | PT | Elemento de combate |
|---|---|---|---|---|---|
| 1 | home-1000 | fire | Fire | Fogo | fire |
| 2 | home-1001 | grass | Grass | Planta | grass |
| 3 | home-1002 | water | Water | Água | water |
| 4 | home-1003 | rock | Rock | Rocha | rock |
| 5 | home-1004 | lightning | Lightning | Elétrico | electric |
| 6 | home-1005 | ice | Ice | Gelo | ice |
| 7 | home-1006 | wind | Wind | Vento | wind |
| 8 | home-1007 | dark | Dark | Trevas | dark |
| 9 | home-1008 | light | Light | Luz | holy |
| 10 | home-1100 | hauling | Hauling | Transporte | — |
| 11 | home-1101 | artisanship | Artisanship | Artesanato | — |
| 12 | home-1102 | leisure | Leisure | Lazer | — |
| 13 | home-1103 | perfumery | Perfumery | Perfumaria | — |

Como foi confirmado: nos elementais, cada `icon-home-100X` usa no CSS da wiki a mesma posição de sprite
que `icon-attributes-<elemento>`. Os de trabalho foram conferidos uma única vez contra o Hideout Guides
(via `data/homeland-hideout.json` do github.com/goul4rt/aniimo-tools): as 84 espécies em comum tinham
aptidões e níveis idênticos. Isso foi só validação; os dados vêm da wiki.

A ordem das 4 aptidões de trabalho na tela do jogo é suposição (ordem dos códigos). Se o usuário
indicar outra, ajuste `APTIDOES` em `src/app/core/data/models.ts` **e** no script.

### Regras do jogo (o script valida e avisa se alguma quebrar)

- As aptidões elementais de um Aniimo são exatamente os seus elementos de combate (dual-type = 2).
- 0 a 2 aptidões de trabalho por Aniimo. Na extração atual: 27 com 0, 178 com 1, 3 com 2.
- Formas regionais e Prismana têm aptidões próprias (75 de 120 formas alternativas diferem da primeira
  forma), por isso cada forma é uma entrada separada.
- Aptidões raras: Luz (9 formas, só 2 fora de Prismana) e Perfumaria (2: Orval e Odoran).

## Construção do Lar (`src/app/core/lar/`)

Arquivo: `src/assets/data/lar-construcao.json`, gerado por `scripts/extract-homeland-construction.ts`
(`npm run data:lar`; `-- --fresh` ignora o cache em `scripts/.cache/aniimax/`). Tipos em
`src/app/core/lar/modelos-lar.ts`. Não edite o JSON à mão.

- Baixa `data/*.csv` e `web/facility-config.js` do aniimax no commit `COMMIT` do script. Para
  atualizar, troque o commit e confira erros e avisos.
- Aptidões do aniimax → nossas: `Earth` → `rock`; as outras têm o mesmo nome em minúsculas.
- Tamanhos: todos vistos no jogo pelo usuário (lista de 2026-09-29) em `scripts/tamanhos-estimados.ts`
  (`MEDIDOS`; `ESTIMADOS` vazio). Construções fora do aniimax: Chocadeira e Unidade de
  Armazenamento, 2×2.
- Quantidades por RV conferidas no jogo só até RV 11 (`rvVerificado`); acima disso são extrapoladas,
  exceto as do RV 20 de Fazenda (40), Bosque (20) e Mina (10), vistas no jogo pelo usuário
  (`CORRECOES_USUARIO` no script; o aniimax dizia 42 e 21).
- **Decisão do usuário:** a planta é sempre a base completa do RV 20; o jogador monta a planta final
  e vai construindo nos espaços reservados enquanto sobe. O seletor "Seu nível" (`LarStore.rvAtual`)
  não muda a planta: só destaca o que já libera e apaga o resto. `liberacao.ts` diz em que RV cada
  espaço libera: ambientes primeiro (o par antes dos avulsos); Fazendas/Bosques a cada RV vão para
  lotes que já servem (ambiente construído e cultura liberada), revezando entre as culturas escolhidas
  (**pedido do usuário:** cultura marcada precisa ter lote já no nível atual, não no RV 19); depois
  ordem de leitura. Muda com a escolha de culturas; a posição dos lotes não. O motor (`plantaDoLar`) continua aceitando qualquer RV.
- Ambientes: cobrem 9×9 a partir do centro; lote coberto = sobreposição com área > 0 (quina não
  conta); grade de ¼ de tile; temperaturas somam onde Fornalha e Resfriador se sobrepõem.
- Nomes PT em `src/app/core/lar/nomes-pt.ts`: construções com os **nomes oficiais do jogo** (lista do
  usuário: Forno de Calor, Máquina de Garra Gurmê, Saltibarril, Forno com Chaminé…); culturas e os 148
  produtos de máquina são traduções propostas (há teste para nenhum faltar).
- Chocadeira (de ovos de Aniimo): não está no aniimax nem na wiki. Informado pelo usuário: 2×2 (o
  espaço de uma Fazenda), sem Aniimo trabalhando. A quantidade por RV é desconhecida, então o usuário
  informa na página (`LarStore`, chave `aniimo.lar.v1`); fica num bloco "ninhal" cercado.
- Unidade de armazenamento: também informada pelo usuário: 2×2, é para onde os Aniimo levam o que é
  produzido, e quem carrega usa Transporte (nível desconhecido, conta 1). Quantidade na página
  (`LarStore.armazens`, padrão 1). **Decisão do usuário:** espalhadas, não juntas. `armazens.ts` escolhe
  as posições (k-medianas guloso) entre os espaços livres encostados num caminho, preferindo o lado de
  dentro do anel, para diminuir a distância das construções produtivas ao armazém mais perto.
- **Decisão do usuário (2026-10-03): energia fora do app.** Gerador de Estalos e Poste de Energia
  Estalante não entram no mapa nem na página, e nada é calculado com watts; o jogador cuida disso no
  jogo. Não reintroduzir sem ele pedir. (Uma versão com a vila em anel em volta do gerador foi
  rejeitada: "horrível".) Para referência, o que ele informou no RV 12: cada máquina trabalha com
  energia OU com um Aniimo; Gerador 600 W; Poste a até 8 tiles do Gerador ou 6 de outro Poste; 1
  Gerador e 6 Postes no RV 12; consumo: Mina 90, Poço 60, Secadora Jukebox 60, Máquina de Garra Gurmê
  60, Mesa de Criação 60, Panela de Cozimento 45, Mesa Fonolfatória 45, Bancada de Marcenaria 15, Jogo
  de Dança Lapidador 90, Fabricante de Aniicápsula 90, as demais máquinas 30 W.
- Oficina (`vilaDeOficinas` em `planta.ts`, **pedido do usuário: lado a lado**): máquinas maiores
  primeiro em fileiras desencontradas com 2 tiles de passagem, cada uma no seu pátio (`piso` meio tile
  em volta). Mina e Poço ficam no bloco `recursos`, em grade.
- Decoração (`decoracao.ts`, só enfeite, RNG com semente): vinhetas por bloco (cultivo: espantalho,
  feno, bebedouro…; oficina: caixotes, barris, sacos junto aos pátios; minas: carrinho de minério,
  pedras; moradias: arco florido, casinha de passarinho; ninhal: feno) fora de construções, pátios,
  trilhas e sub-regiões de cultivo; praças nos espaços livres (fonte perto do centro com estátuas,
  lago longe dela, piquenique). **Feedback do usuário:** a oficina em fileiras sobre piso de pedra era
  "sem graça"; por isso hoje é gramado com pátios individuais e densidade baixa de enfeites.
- "Deve produzir" (`producao.ts`, `producaoPorUnidade`): ao selecionar uma máquina, Mina, Poço ou
  moradia liberada, o cartão mostra a receita daquela unidade (posição na ordem de liberação) no RV
  atual. Dinheiro/Minha seleção: finais de `melhoresParaVender` feitos com as culturas plantadas, em
  rodadas, e o intermediário de outra máquina é reservado antes (sem vaga para ele, o final fica de
  fora). Nível: Bancada de Marcenaria e Forno com Chaminé fazem o material do próximo RV
  (`custoPorRv`, do `LEVEL_UP_COSTS` do aniimax) e as outras unidades descem pela cadeia; Mina, o
  minério com mais Areia Mineral por hora. Sobras: coleta pelo maior moedas/h; Jogo de Dança Lapidador
  e Fabricante de Aniicápsula rendem XP/Aniicápsulas (`outra-moeda`).

### Culturas escolhidas (`LarStore.culturas`, `OpcoesPlanta.culturas`)

- O jogador escolhe as culturas (famílias: `quick_x`/`premium_x` contam como `x`); `null` = todas.
- **Área única de cultivo (pedido do usuário):** Fazendas, Bosques e ambientes ficam num só bloco
  `cultivo` cercado. `comporCultivo` (planta.ts) junta as sub-regiões da base (cada aglomerado de
  ambiente com sua cobertura 9×9 inteira, e os campos sem ambiente) em fileiras com trilhas de 1 tile
  (`tipo: 'trilha'`); `Bloco.regioes` guarda as sub-regiões. Nada disso muda com RV nem culturas.
- **Decisão do usuário:** o que fica fixo na base são os blocos, cercas, pisos, caminhos e construções
  (inclusive ambientes e armazéns, calculados antes da rearrumação). Fazendas e Bosques podem se mover
  e trocar de tipo dentro das sub-regiões, com o total fixo (40 e 20 no RV 20). `rearranjo.ts`: malha de
  2 tiles alinhada à base de cada sub-região (o que coube na base cabe de novo); para cada combinação de
  modos, 1 lote ativo por cultura escolhida (zona de ambiente já
  construído no RV do jogador), depois lotes úteis pelo valor até o limite do tipo (total menos a parte
  das culturas sem ambiente), o resto nos campos sem ambiente (se não couber, enchimento). Nota: culturas
  com lote ativo, lotes úteis, valor; empate mantém os modos. Se nada couber, a base fica como está.
- Resultado (testado RV 1–20, todas marcadas): toda cultura liberada tem lote liberado no nível. Nos
  RV 9–11 há 4 temperaturas pedidas e só 1 Fornalha + 1 Resfriador (3 zonas); **pedido do usuário:**
  a que sobra vai para o lote ativo de temperatura mais próxima, tirado de quem tem lote sobrando
  (`acomodarForaDoAmbiente` em `planta.ts`), com `eficiencia` = 0,8 / 0,5 / 0,2 a 1 / 2 / 3+ passos
  (regra do aniimax, `uncovered_efficiency`). Adequado só cresce sob a Lâmpada Solar (não acomoda).
  Mapa: contorno âmbar; cartão e legenda mostram a porcentagem.
- Ambientes na liberação e no rearranjo: grupos por sobreposição de cobertura (o par antes dos avulsos,
  `tamanhoDoGrupo`), e o lote depende dos ambientes cuja cobertura o toca (não do bloco inteiro).
- `liberacaoPorItem(planta, dados, rvAtual)`: os espaços que o jogador já tem são escolhidos primeiro,
  revezando entre as culturas úteis no RV atual; depois cada um ganha o seu número de RV.
- Repartição: em cada (tipo, condição), os lotes ativos são repartidos primeiro entre as culturas (cada
  uma ganha um), depois os demais. Coringas só saem de sobras (nunca tiram o lote de uma cultura).
- **Decisão do usuário (opção 2):** na montagem da base, o par é sempre Fornalha em Morno + Resfriador
  em Congelante (`MODOS_BASE_DO_PAR` em `ambientes.ts`), cuja sobreposição dá Frio: a base tem lotes
  de Fazenda e Bosque em Morno, Frio e Congelante ao mesmo tempo, e Frio e Congelante convivem
  (Xarope de Bordo, Cranberry, Rosa, Morango e Maçã juntos; há teste). Distâncias do par de 3 a 9.
- Na base (todas as culturas), as sem ambiente ficam com a parte proporcional dos lotes do tipo
  (lotes × neutras / famílias). Lotes da mesma (tipo, condição) são repartidos entre as culturas em
  faixas contínuas (`repartir`). Lote sem cultura escolhida que sirva fica vazio.
- O mapa e o seletor mostram só as culturas (e variantes) já liberadas no RV escolhido em "Seu nível"
  (`rvCulturas = RV atual`, sempre). **Decisão do usuário:** sem caixa para desligar isso. As que
  ainda não liberam somem do seletor mas continuam escolhidas para quando o nível subir.
- Fazendas coringa (`LarStore.coringas`, `OpcoesPlanta.coringas`, pedido do usuário): N Fazendas sem
  cultura fixa, para sementes de evento. Não mudam a disposição (`marcarCoringas` em `planta.ts`:
  primeiro lotes sem ambiente, depois lotes de zona sem cultura escolhida, depois o resto). Na
  liberação entram no revezamento como uma cultura que serve desde o RV 1.
- O painel "Culturas" abre recolhido.
- A legenda "Culturas no mapa" lista exatamente as culturas marcadas no filtro e liberadas no RV
  escolhido (nome da família, igual ao filtro), com os lotes de cada uma; 0 lotes aparece como
  "sem lote" (a base fixa não tem lote para ela). Coringas entram no fim.
- Card "O que vender" (pedido do usuário: simples, só produto final): `vendas.ts`, receitas de máquina
  liberadas no RV que não são ingrediente de outra receita liberada, ordenadas por ganho por hora de
  máquina = (venda − valor de venda dos ingredientes) ÷ carga de trabalho; top 10, no máximo 2 por
  máquina. Tooltip (hover, toque e teclado) com as culturas usadas, descendo pelos ingredientes
  intermediários até Fazenda/Bosque, e os outros insumos (Poço, Mina, moradias). **Pedido do usuário
  (opção 3):** `paraVender` separa "Com o que você planta" (culturas todas marcadas, ou nenhuma
  cultura; até 10) de "Plantando mais" (mostra o que falta plantar; até 5). **Foco** (`LarStore.foco`, `foco.ts`, pedido do usuário; substituiu
  o toggle "Plantar para vender", estado antigo migra para "dinheiro"): "Minha seleção" usa as culturas
  marcadas; "Dinheiro" usa as culturas dos 10 produtos que mais rendem no RV; "Nível" põe nos Bosques
  as árvores com mais Blocos de Madeira por hora (`Produto.subproduto`, do `byproduct_yield` do
  aniimax) e nas Fazendas as de dinheiro. Fora de "Minha seleção" o seletor fica travado mostrando as
  culturas do foco; a seleção do jogador nunca é apagada. Não considera a
  quantidade de lotes.
- Layout (pedido do usuário): mapa com uma coluna ao lado (Selecionado, que alterna com Como ler, e
  Culturas no mapa); "O que vender" abaixo do mapa, em largura total, com as listas "Com o que você
  planta" e "Plantando mais" lado a lado. No celular tudo empilha. Todos os produtos têm nome PT (`nomes-pt.spec.ts` garante).
- **Decisão do usuário:** a página é só o mapa (sem tabela nem equipe de Aniimo; ambas removidas).

## Solver (`src/app/core/solver/`)

- `solver.ts` é TS puro, sem Angular; recebe o backend (`LegacyHighs`) por parâmetro. Browser:
  `highs-browser.ts` no `solver.worker.ts`, via `SolverService`. Testes: `highs-node.ts`.
- Modelo: x_i inteiro; a_ij binário (**nunca** usar o nível como contribuição). Fase 1 minimiza Σx;
  fase 2 fixa Σx no ótimo e maximiza a soma dos níveis nas aptidões requeridas (lexicográfico).
- Inviabilidade é detectada sem ILP (sem limite de vagas, o máximo por aptidão é usar tudo).
- Referência para testes: o exemplo `[4,5,7,10,1,1,2,4,1,5,2,2,1]` dá **18** Aniimo (**20** sem
  Prismana), conferido com um segundo solver (YALPS). Se os dados mudarem, esses números podem mudar;
  reconfira antes de ajustar o teste.
- Empates são arbitrários entre soluções com o mesmo total e a mesma soma de níveis: em testes com
  dados sintéticos, torne o vencedor único.

## Armadilhas já resolvidas

- `highs.mjs` faz `import("node:module")` protegido por `ENVIRONMENT_IS_NODE`; por isso `node:module`
  está em `externalDependencies` no `angular.json`. O `highs.wasm` é copiado para `/wasm` pelos assets.
- `ng generate web-worker` grava `webWorkerTsConfig` também em `architect.test.options`, o que quebra o
  `ng test` (builder Vitest). Remova de lá se gerar outro worker.
- `backdrop-filter` num ancestral prende elementos `position: fixed`; o cabeçalho remove o filtro no
  celular para a navegação inferior funcionar.
- `localStorage` sempre via `core/data/armazenamento.ts` (tolerante a falhas e com validação).
  Chaves: `aniimo.roster.v1` e `aniimo.zona.v1`; mude a versão se mudar o formato.

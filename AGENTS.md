# AGENTS.md

Contexto para agentes de IA. Para humanos, veja o [README.md](README.md).

Planejador do Lar do jogo Aniimo: monta a planta do Lar e recomenda a equipe (o que cada instalação
faz e quais Aniimo colocar, escolhidos juntos pelo maior ganho dentro do limite do Lar). Angular 22 (standalone, signals, zoneless, control flow novo),
TypeScript strict, SCSS, Vitest via `ng test`. Textos da UI e do código em português.

## Ambiente

- Node ≥ 22.22.3 (Angular 22). O usuário usa nvm (nvm-sh no Git Bash) e o padrão dos shells ainda é o
  Node 20: prefixe comandos com `nvm use 24 >/dev/null &&`. Não mexa na instalação global do Node.
- O aviso "Node.js version v20.19.0 detected" no início de todo shell vem do `ng completion` do
  `~/.bashrc` do usuário. É inofensivo; não é o projeto.
- Comandos: `npm start`, `npm test` (`ng test --watch=false` para rodar uma vez), `npm run build`,
  `npm run data`, `npm run data:lar`, `npm run data:enfeites`.

## Decisões do usuário (não reabrir sem perguntar)

- **Dados só da wiki oficial** (wiki.aniimo.com). Não completar com Hideout Guides, game8 nem outros
  sites; pergunte antes de raspar qualquer outra fonte. Espécies ausentes da wiki ficam de fora.
  **Exceção aprovada (2026-09-26):** a construção do Lar (instalações, produtos, ambientes) usa o
  aniimax (github.com/ae-bii/aniimax, MIT, © aebii), num commit fixo. Só essa parte; os Aniimo
  continuam vindo só da wiki. Crédito ao aniimax obrigatório na UI.
  **Exceção aprovada (2026-10-10):** os fatos dos terrenos do Lar (quantos são, tamanho, RV e preço)
  vêm do planejador do Aniidex (aniidex.com/pt/homeland), que é "todos os direitos reservados": só
  esses fatos, nada de código, arte ou outros dados. Crédito ao Aniidex na UI. **Ampliada no mesmo
  dia:** também o nome, a categoria, o RV em que a loja libera, o preço e a habitabilidade dos itens
  decorativos escolhidos à mão (`scripts/enfeites-escolhidos.ts`), uma página por item. Nada de
  ícones nem de descrições. **E a quantidade de cada instalação por RV** (`capByRv`), a pedido do
  usuário ("ache uma fonte confiável"): o aniimax extrapolava acima do RV 11 e errava.
  **Exceção aprovada (2026-10-10):** os fatos do Festival da Lua da Colheita (datas, sementes, Trigo
  do Luar, pratos do Grande Banquete) vêm do Aniimo Tools
  (aniimotools.dev/pt-br/systems/homeland/home-season/), que proíbe reproduzir o conteúdo: só nomes,
  números e datas, escritos à mão em `src/app/core/lar/festival.ts`, sem script de extração. Crédito
  no rodapé. **Informado pelo usuário (2026-10-11), por capturas do jogo:** as seis receitas do
  festival (máquina, ingredientes, preço de venda), também em `festival.ts`.
  **Exceção aprovada (2026-10-11):** do Aniimo Tools, também as regras de velocidade de trabalho por
  nível da aptidão (página "Aniimos no trabalho") e a equipe de 1 Aniimo por tarefa para cada 8
  lotes; só os números, à mão, em `src/app/core/lar/velocidade.ts`. O método da recomendação de lá
  serviu de referência (o usuário pediu para ver como eles fazem); a conta é nossa.
- **Decoração:** para consultar itens decorativos, usar `aniidex.com/pt/items/furniture/` (pedido do
  usuário, 2026-10-11), dentro da exceção do Aniidex acima.
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
- Quantidades por RV: **Aniidex** (`limitesDoAniidex` no script lê `capByRv` de
  aniidex.com/pt/homeland; cache em `scripts/.cache/aniidex/homeland.html`), desde 2026-10-10. O usuário
  viu no jogo, no RV 14, 3 Poços, 3 Fornos com Chaminé e 3 Bancadas de Marcenaria, e o aniimax dizia 2.
  O Aniidex bate com isso, com o aniimax em todos os RVs até o 12 (os que ele conferiu) e com as
  correções do usuário no RV 20 (Fazenda 40, Bosque 20, Mina 10; `CORRECOES_USUARIO` continua no script
  como conferência). No RV 20 mudou: Poço, Bancada e Forno com Chaminé 4; 2 de cada moradia (menos o
  Moinho de Vento Floral), Tear, Mesa Fonolfatória, Saltibarril, Fogão de Brasa e Pote de Conservas; 3
  Fornos de Calor, Resfriadores e Lâmpadas Solares. `rvVerificado` agora é o RV máximo. Jogo de Dança
  Lapidador e Fabricante de Aniicápsula não existem lá e ficam com o aniimax. O limite do Aniidex vale
  desde o RV 1; a quantidade só conta a partir do RV em que a instalação libera (`nivelPorRv`, do
  aniimax). Não usados (para referência, o Aniidex também tem): área exata de cada instalação
  (ex.: Forno com Chaminé 5,5×5,5; os tamanhos do usuário são esses arredondados para cima), RV de
  cada nível, e a quantidade de Unidades de Armazenamento por RV (1 no RV 1 até 8 no RV 20).
- **Ambientes na planta** (`AMBIENTES_NA_PLANTA` em `planta.ts`): a planta usa no máximo 2 Fornos de
  Calor, 1 Resfriador e 1 Lâmpada Solar (o par mais dois avulsos), que já dão as cinco condições; os
  outros que o jogo permite ocupariam meio terreno cada sem render mais (com os 9, sobrava 1 terreno
  de jardim e a planta levava 1,4 s). A página avisa disso em "Como ler".
- **Decisão do usuário:** a planta é sempre a base completa do RV 20; o jogador monta a planta final
  e vai construindo nos espaços reservados enquanto sobe. O seletor "Seu nível" (`LarStore.rvAtual`)
  não muda a planta: só destaca o que já libera e apaga o resto. `liberacao.ts` diz em que RV cada
  espaço libera: ambientes primeiro (o par antes dos avulsos); Fazendas/Bosques a cada RV vão para
  lotes que já servem (terreno aberto, ambiente construído e cultura liberada), revezando entre as
  culturas escolhidas (**pedido do usuário:** cultura marcada precisa ter lote já no nível atual, não
  no RV 19); depois terrenos que abrem antes e ordem de leitura. Nenhum espaço libera antes do seu
  terreno. Muda com a escolha de culturas; a posição dos lotes não. O motor (`plantaDoLar`) continua
  aceitando qualquer RV.
- **Decisão do usuário (2026-10-10): planta por terrenos**, inspirada no Aniidex. `terrenos.ts`: 16
  terrenos de 20×15 tiles num tabuleiro 4×4 contíguo (80×60), o terreno *n* libera no RV *n*; a posição
  de cada um no tabuleiro veio de uma captura de tela do Lar do usuário. `planta.ts`: cada terreno
  ganha um tema (`TipoBloco`: cultivo, oficina, recursos, moradias, ninhal) e um `Bloco` que ocupa o
  terreno inteiro; `distribuir` percorre os RV 1→20 e o que libera no RV *n* só vai para terrenos
  ≤ *n* (o tema enche o seu terreno e só então abre o de número mais baixo ainda sem tema). **Decisão do
  usuário: base final que cresce** (nunca é preciso mudar algo de lugar); há teste de que, em todo RV,
  o que o jogador pode ter fica em terrenos já abertos. Se faltar terreno, a folga entre construções
  cai de 2 para 1 e 0; se os lotes não couberem, o cultivo abre mais um terreno. Com os dados atuais:
  10 terrenos usados no RV 20 (3 de cultivo, 3 de oficina, 2 de recursos, 1 de moradias, mais o ninhal),
  o resto fica livre para a decoração. **Aprovado pelo usuário (2026-10-10):** a distribuição dos temas
  e os 2 tiles de passagem entre máquinas. Trabalho em 4 etapas (plano aprovado): 1 motor por terrenos
  (feita), 2 cartões e zoom por terreno (feita), 3 decoração automática com controle "eficiente ↔
  bonito" e terrenos-jardim (feita), 4 editor por terreno (mover construções e enfeites, terreno editado fica
  fixado).
- Visualização por terrenos (etapa 2, `features/lar/`): a visão geral é um cartão por terreno
  (`TabuleiroTerrenos`: miniatura `MiniTerreno`, tema e "Produz por dia"), na posição do tabuleiro do
  jogo em telas largas e na ordem dos números no celular. Clicar abre o terreno no `MapaLar` (`foco`),
  com arrastar, zoom (Ctrl + rodinha, pinça, botões) e teclado (setas, +/−, Home); terrenos fechados
  também abrem, para ver o plano. O terreno aberto fica na URL (`?terreno=7`), então o Voltar do
  navegador fecha. As peças mostram "Nv. x" (nível no RV atual) ou "RV n" (espaço reservado). O cartão
  "Selecionado" flutua sobre o mapa (folha que sobe de baixo no celular). "Produz por dia"
  (`producaoPorTerreno` em `lar-page.ts`): lotes pela cultura sem parar × eficiência, máquinas e coleta
  pelo "Deve produzir" × 24; a faixa geral mostra os 12 maiores. Os `<symbol>`/`<pattern>` do mapa
  ficam em `MapaSimbolos`, uma vez por página, e valem para todos os SVG. **Decisão do usuário:** o
  controle "Girar mapa" foi removido (`rotacao` é descartado do estado salvo).
- Ambientes: cobrem 9×9 a partir do centro; lote coberto = sobreposição com área > 0 (quina não
  conta); grade de ¼ de tile; temperaturas somam onde Fornalha e Resfriador se sobrepõem.
- Nomes PT em `src/app/core/lar/nomes-pt.ts`: construções com os **nomes oficiais do jogo** (lista do
  usuário: Forno de Calor, Máquina de Garra Gurmê, Saltibarril, Forno com Chaminé…); culturas e os 148
  produtos de máquina são traduções propostas (há teste para nenhum faltar).
- Chocadeira (de ovos de Aniimo): não está no aniimax nem na wiki. Informado pelo usuário: 2×2 (o
  espaço de uma Fazenda), sem Aniimo trabalhando. A quantidade por RV é desconhecida, então o usuário
  informa na página (`LarStore`, chave `aniimo.lar.v1`); fica num bloco "ninhal" cercado. Sem terreno sobrando (ex.: RV 7), ficam soltas nos espaços livres dos outros
  terrenos, como os armazéns (`chocadeirasSoltas` em `montar`).
- Unidade de armazenamento: também informada pelo usuário: 2×2, é para onde os Aniimo levam o que é
  produzido, e quem carrega usa Transporte (nível desconhecido, conta 1). Quantidade na página
  (`LarStore.armazens`, padrão 1). **Decisão do usuário:** espalhadas, não juntas: uma por terreno
  produtivo antes de repetir, começando pelos que abrem primeiro (`vagaDeArmazem` em `planta.ts`; no
  cultivo ocupa uma célula da malha perto do meio). O antigo `armazens.ts` (k-medianas na beira dos
  caminhos) foi removido com a planta única.
- **Decisão do usuário (2026-10-03): energia fora do mapa.** Gerador de Estalos e Poste de Energia
  Estalante não entram no mapa nem na página do Lar. **Mudou em 2026-10-11 só para a equipe** ("use
  energia quando achar necessário"): a recomendação de Aniimo decide quais instalações ligar na rede
  (`energia.ts`, ver "Equipe do Lar"). Postes e distâncias continuam fora. (Uma versão com a vila em anel em volta do gerador foi
  rejeitada: "horrível".) Para referência, o que ele informou no RV 12: cada máquina trabalha com
  energia OU com um Aniimo; Gerador 600 W; Poste a até 8 tiles do Gerador ou 6 de outro Poste; 1
  Gerador e 6 Postes no RV 12; consumo: Mina 90, Poço 60, Secadora Jukebox 60, Máquina de Garra Gurmê
  60, Mesa de Criação 60, Panela de Cozimento 45, Mesa Fonolfatória 45, Bancada de Marcenaria 15, Jogo
  de Dança Lapidador 90, Fabricante de Aniicápsula 90, as demais máquinas 30 W.
- Oficina, recursos e moradias (`arrumar` em `planta.ts`, **pedido do usuário: lado a lado**):
  construções maiores primeiro em fileiras centradas na área útil do terreno, com 2 tiles de passagem
  (desencontradas na oficina); oficina e moradias com um pátio cada, um quadrado de peças de piso 2×2
  inteiras (`ladoDoPatio`: lado ímpar ganha meio tile de borda, lado par um tile) com a construção no
  meio. A passagem entre construções conta o piso dos dois pátios.
- Decoração (`decoracao.ts`, só enfeite, RNG com semente). **Pedido do usuário (2026-10-10):** o mapa
  sem enfeites era "sem graça"; ele quer os itens decorativos do jogo e os terrenos vazios decorados.
  - Catálogo: `src/assets/data/lar-enfeites.json`, gerado por `scripts/extract-enfeites.ts`
    (`npm run data:enfeites`; cache em `scripts/.cache/aniidex/`) a partir da curadoria em
    `scripts/enfeites-escolhidos.ts` (55 itens de exterior, só de loja). Não edite o JSON à mão.
    **O Aniidex não publica o tamanho em tiles:** `largura`/`altura` são estimativas nossas
    (`tamanhoEstimado`) até o usuário conferir no jogo; ao conferir, marque `medido: true` na
    curadoria. A maioria dos 1.033 móveis do jogo é peça de casa (paredes, pisos, sofás) e fica de fora.
  - Desenhos nossos: `forma` = `<symbol id="ml-{forma}">` em `mapa-simbolos.html` (há teste para nenhum
    faltar); `cor` quando o desenho é compartilhado (árvores, flores, arbustos).
  - Terrenos produtivos: vinhetas do tema (`VINHETAS`) nas células livres, com meio tile de respiro
    das construções; no cultivo usam o que sobra entre os lotes, então mudam com as culturas.
  - Terrenos sem construção viram `tema: 'jardim'` com `jardim`: praça e jardim, lago e piquenique,
    pomar e bosque, lazer dos Aniimo (os quatro pedidos pelo usuário). Composição fixa por tipo
    (`JARDINS`) mais miudezas sorteadas; o de lazer vai para o terreno livre mais perto das moradias e
    os outros se revezam.
  - **Informado pelo usuário (2026-10-10): o piso do jogo ocupa 2×2.** Todo piso da planta é feito de
    peças de 2×2 inteiras, sem sobreposição (há teste): ruas (itens `caminho`), pátios (itens `piso`) e
    o chão dos jardins. Suposição nossa, a confirmar: construções e enfeites podem ficar em cima do piso.
  - **Informado pelo usuário (2026-10-10): o limite dos terrenos é só visual; eles podem se unir.**
    **Decisões:** terrenos vizinhos do mesmo tema viram uma área só, sem rua nem margem entre eles, e a
    rua fica só na divisa entre duas áreas diferentes **e em toda a borda do tabuleiro** (pedido do
    usuário: não gostou do mapa sem rua na borda). `ruas.ts` (`malhaDeRuas`): as peças caem numa malha
    única de 2×2 que começa no canto do tabuleiro, sem fresta nem sobreposição. Por causa dela a rua
    nem sempre fica meio a meio na divisa: a de cima a baixo fica inteira no terreno da direita (2
    tiles); a de lado a lado fica em cima da divisa nas linhas 15 e 45 (1 tile em cada terreno) e
    inteira no terreno de baixo na linha 30. A última coluna (terrenos 16, 9, 6, 5) fica com 16 tiles
    úteis de largura; as outras, 18. `margens(t)` diz quanto a rua tira de cada lado e de que
    lados o terreno se une; em `distribuir` as margens usam os temas já dados (um vizinho que ganhar o
    mesmo tema depois só aumenta o espaço). Do lado unido, as construções ficam a meia passagem da
    divisa (`areaUtil`); os lotes vão até a divisa (`regiaoDeCultivo`), formando uma área de fazenda só.
    Minas e moradias usam 1 tile de passagem (`FOLGA_DO_TEMA`; a oficina mantém os 2 aprovados).
  - **Pedido do usuário (2026-10-10): os terrenos têm de se conectar**, não parecer ilhas soltas: são as
    ruas acima. Só a cerca fica sobre a rua (na metade de dentro, e só nos lados em que a rua está no
    próprio terreno). (b) Todo jardim tem caminhos em cruz que encostam na rua dos quatro lados, sem
    fresta (há teste): as composições (`JARDINS`) usam coordenadas do miolo do jardim (para dentro das
    ruas: 16 ou 18 de largura, 12 ou 14 de altura) e o largo do meio tem o tamanho que fecha os braços
    em peças inteiras (`largo`, `cruz`). O que fica em cima do chão do jardim (gazebo, fonte, fogueira)
    é posto de propósito (`sobreChao`). (c) **Jardim grande** (`jardinagem`): o primeiro par de terrenos livres
    lado a lado se une (`TerrenoDaPlanta.unidoA`), sem calçada no meio, numa composição de 40×15 com
    enfeites cruzando a divisa. (d) A visão geral da página é um mapa contínuo do tabuleiro
    (`MapaLar` com `geral`: clicar num terreno o abre), com os cartões por terreno embaixo; as
    miniaturas dos cartões só aparecem no celular. Com os dados atuais (RV 20): cultivo 1, 7, 8 (7 e 8
    unidos); oficina 2, 5, 6, 9, 11, 13; recursos 3, 10; moradias 4, 12; jardins 14+15 (o grande) e 16
    (lazer). São 13 terrenos, um a mais que antes do piso 2×2: a rua agora tira até 2 tiles de um lado e os
    pátios de construções de lado par têm 1 tile de borda. A praça não aparece mais no RV 20.
  - Controle "Decoração" (`LarStore.equilibrio`, `OpcoesPlanta.equilibrio`): Eficiente (sem enfeites,
    terrenos livres vazios), Equilibrado (padrão), Bonito (mais denso e Cerca de Jardim nos terrenos de
    cultivo e no ninhal). Nunca move construções (há teste).
  - Página: clicar num enfeite abre o cartão dele (nome oficial, tamanho estimado, RV, preço,
    habitabilidade); o terreno aberto lista a "Decoração" com quantidades, custo total e
    habitabilidade. Enfeite que a loja ainda não libera no RV do jogador aparece apagado.
  - **Feedback anterior do usuário:** a oficina em fileiras sobre piso de pedra era "sem graça"; por
    isso é gramado com pátios individuais.
- "Deve produzir" e "Produz por dia" (desde 2026-10-11): vêm do plano da equipe
  (`core/solver/equipe.service.ts`, o mesmo cálculo da página Equipe; ver "Equipe do Lar"). O cartão
  da máquina selecionada mostra a receita que o plano deixa naquela unidade (a k-ésima na ordem de
  liberação, `unidadesNoMapa`: as unidades de uma receita vêm juntas, as da rede primeiro), quanto
  do tempo ela trabalha, se vai na rede elétrica, ou "Fica parada". "Produz por dia" soma a receita
  de cada unidade. O antigo
  `producao.ts` (`producaoPorUnidade`: uma receita por unidade, escolhida sem olhar material nem
  Aniimo) foi removido.

### Culturas escolhidas (`LarStore.culturas`, `OpcoesPlanta.culturas`)

- O jogador escolhe as culturas (famílias: `quick_x`/`premium_x` contam como `x`); `null` = todas.
- **Terrenos de cultivo:** Fazendas, Bosques e ambientes ficam nos blocos `cultivo`. O primeiro (terreno
  1) não tem ambiente: é onde se planta antes de ter Fornalha. Cada grupo de ambiente vai para outro
  terreno de cultivo: o par ocupa o terreno inteiro e as avulsas meio terreno cada, sempre com a
  cobertura 9×9 inteira dentro do terreno. `Bloco.regioes` guarda a sub-região do terreno onde os lotes
  se movem (malha de 2 tiles alinhada pelos ambientes). Nada disso muda com RV nem culturas. (A antiga
  "área única de cultivo" num só bloco cercado com trilhas deixou de existir com os terrenos.)
- **Decisão do usuário:** o que fica fixo na base são os terrenos, pisos e construções (inclusive
  ambientes e armazéns, postos antes dos lotes). Fazendas e Bosques podem se mover e trocar de tipo
  dentro das sub-regiões, com o total fixo (40 e 20 no RV 20). `rearranjo.ts`: malha de 2 tiles a partir
  do canto de cada sub-região (o que coube na base cabe de novo); a própria base sai dele, com todas as
  culturas e os modos fixos (`manterModos`). Para cada combinação de modos, 1 lote ativo por cultura
  escolhida (terreno aberto e zona de ambiente já construído no RV do jogador), depois lotes úteis pelo
  valor até o limite do tipo (total menos a parte das culturas sem ambiente), o resto nos campos sem
  ambiente, primeiro nos terrenos que abrem antes. Nota: culturas com lote ativo, lotes úteis, valor;
  empate mantém os modos. Se nada couber, a base fica como está. Com o nível do jogador (`rv`), os
  lotes que ele já pode ter ficam em terrenos já abertos: nos que abrem depois só cabe o que ele ainda
  vai ganhar (`teto`; há teste nível a nível em `liberacao.spec.ts`).
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
  primeiro nos terrenos já abertos no RV do jogador; em cada parte, lotes sem ambiente, depois lotes
  de zona sem cultura escolhida, depois o resto; nunca tiram o lote de uma cultura). **Pedido do
  usuário (2026-10-10):** coringa é para plantar agora, então fica em Fazenda que o jogador já tem: na
  liberação, depois do primeiro lote de cada cultura, as coringas passam na frente dos lotes repetidos
  (há teste). São para o Festival da Lua da Colheita (`festival.ts`): enquanto ele dura, o lote mostra
  as sementes do festival e a página sugere quantas coringas usar (`coringasSugeridas`). **Informado
  pelo usuário (2026-10-11): são os Aniimo que replantam, sozinhos**, então cada coringa dá 36
  colheitas por dia (40 min cada) e as 150 sementes do dia cabem em 5; a conta antiga supunha o
  jogador replantando 8 vezes por dia e sugeria 19. O campo "replantios por dia"
  (`LarStore.plantiosPorDia`) saiu; `usoDasCoringas` diz o que as coringas do jogador fazem com as
  sementes do dia.
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
  aniimax) e nas Fazendas as de dinheiro. "Festival" (só enquanto `festivalAtivo`; salvo de antes,
  volta para "Minha seleção" em `focoAtual` da página) usa as culturas dos pratos do Grande Banquete
  que o RV já libera (`pratosDoBanquete` em `festival.ts`: Tanghulu, Geleia de Maçã com Bordo,
  Biscoitos de Lavanda) mais as de dinheiro, e no plano da equipe os pratos do banquete são a meta
  que vem antes das moedas (`metasDoFoco` em `entrada-equipe.ts`). **Receitas do festival** (`RECEITAS_DO_FESTIVAL`, capturas do usuário de 2026-10-11):
  Conserva Umbralina, Caçarola Umbralina e Travessa da Colheita (pratos do banquete), Pimenta da Lua
  Crescente Assada e Fatias de Rabanete Orvalho-lunar (viram a Travessa) e Molho Doce e Apimentado do
  Umbral (só venda). Confirmado por ele: o balde é Água Doce (`fresh_water`), os cristais são Açúcar
  Cristal (`rock_candy`) e o frasco é Vinagre de Cidra (`cider_vinegar`). Elas e as duas sementes
  (`moon_radish`, `crescent_pepper`, chaves nossas) só existem nos dados de `comFestival(dados)`, que
  a página usa nas contas de venda e produção (`dadosVenda`) enquanto o festival dura; a planta, o
  seletor e a legenda nunca as veem. As sementes contam como plantadas quando há Fazenda coringa.
  A carga de trabalho também veio de capturas dele (**informado pelo usuário: carga de trabalho é o
  tempo em segundos**), então elas entram em "O que vender" e disputam máquinas pelo ganho como
  qualquer receita; no RV 14 a Caçarola, a Conserva e o Molho são os três primeiros (~30 mil
  moedas/h). Falta só o preço de venda das sementes cruas (conta 0 como custo). O cartão "Grande
  Banquete" lista as seis com ingredientes e preço. Um prato só conta como liberado quando o
  que ele pede também libera (`rvDaReceita`: a Conserva espera o Vinagre de Cidra). Fora de "Minha seleção" o seletor fica travado mostrando as
  culturas do foco; a seleção do jogador nunca é apagada. Não considera a
  quantidade de lotes. **Todo foco leva uma cultura de Fazenda e uma de Bosque sem ambiente**
  (`comSemAmbiente` em `foco.ts`; no Nível, a árvore sem ambiente com mais Blocos de Madeira): o
  usuário viu Bosques vazios no terreno 1 (2026-10-11), porque o foco Nível só escolhia árvores de
  ambiente e os Bosques que não cabem nas zonas sobram no terreno sem ambiente. Em "Minha seleção" o
  lote sem cultura que sirva continua vazio, e o cartão dele explica o motivo.
- Layout (pedido do usuário): quadro dos terrenos com uma coluna ao lado (Como ler e Culturas no
  mapa); "O que vender" abaixo do mapa, em largura total, com as listas "Com o que você
  planta" e "Plantando mais" lado a lado. No celular tudo empilha. Todos os produtos têm nome PT (`nomes-pt.spec.ts` garante).
- **Decisão do usuário:** a página é só o mapa (sem tabela nem equipe de Aniimo; ambas removidas).

## Equipe do Lar (recomendação de Aniimo)

Rota `/equipe` (a inicial; `requisitos` e `resultado`, das telas antigas, redirecionam para ela).

**Histórico (2026-10-11), para não repetir:** (1) o solver dos 13 números digitados (`solver.ts`,
cobertura por aptidão sem nível) deixava máquinas paradas no jogo e foi removido; (2) "um Aniimo fixo
por posto, por faixas de prioridade", sobre o plano de `producaoPorUnidade`, foi **rejeitado pelo
usuário** ("não tá ficando legal"): o plano era montado sem olhar material nem Aniimo, metade das
máquinas ficava sem material e a lista saía com um Aniimo diferente por posto; (3) o modelo atual
escolhe tudo junto, no formato do Aniimo Tools.

Regras do jogo usadas, e de onde vêm:

- Usuário: os Aniimo postos no Lar vão sozinhos para o trabalho da aptidão deles, um trabalho de cada
  vez; quem produz matéria-prima trabalha 24 h e quem faz receita só quando há material; a receita
  pede um **nível mínimo** da aptidão ("não tenho certeza, mas acho": `NIVEL_MINIMO_OBRIGATORIO` em
  `velocidade.ts`; em `false`, abaixo do nível o Aniimo só fica mais lento, como diz o Aniimo Tools);
  ambiente e armazém ocupam um Aniimo fixo cada; regar pede Água; pode sacrificar produções.
- Usuário, famílias dos produtos de moradia (`especies-exigidas.ts`): Pérola = Conchita, Estrela =
  Celéstis, Lã = Nimbi, Sal Marinho = Timilontra, Aromatista = Orval, Pétalas = Íris, Escamas =
  Irisális, Borbossono e Sonhovino (esses três nomes são dele). Nas outras, quem é de cada família é
  dedução nossa por números vizinhos (a wiki não publica a linha evolutiva). `familiaPendente` existe
  para produto de moradia novo sem família cadastrada; hoje nenhum.
- Usuário (2026-10-11): **o jogo faz escolher entre Lunara e Hélion; a conta só tem um dos dois**
  (`ESCOLHAS_POR_CONTA`, também em `especies-exigidas.ts`); a recomendação pede no máximo um do par,
  mesmo sem limite de cópias.
- Usuário, energia (`energia.ts`): cada instalação trabalha com um Aniimo OU com energia; consumo por
  instalação (lista de 2026-10-03); o gerador dele está no nível 2, dá 800 W e pede um Aniimo de
  Elétrico nível 2 (600 W no nível 1). Suposições nossas, a confirmar: moradias, ambientes e armazéns
  não rodam com energia; na rede a instalação trabalha a 100% (o Aniimo Tools fala em "até 120%").
- Aniimo Tools (`velocidade.ts`): velocidade por nível do Aniimo × nível da receita, uma tabela para
  processamento e outra para Mina, Poço, moradias e Fabricante de Aniicápsula; 1 Aniimo por tarefa
  dos lotes para cada 8 Fazendas ou Bosques.

Código:

- `core/lar/entrada-equipe.ts` (`entradaDaEquipe`): todas as receitas liberadas de cada instalação
  (a coleta entra como receita: o solver decide se a Mina faz o que vende mais ou o que as máquinas
  pedem), a oferta dos lotes (`ofertaDosLotes` em `utilizacao.ts`: o que os lotes liberados colhem
  por hora; no festival, as coringas dão as duas sementes até onde o Trigo do Luar compra), preços,
  postos fixos (ambientes de `AMBIENTES_NA_PLANTA` e armazéns), tarefas dos lotes (automático
  `ceil(lotes / 8)` ou o que o jogador fixar), energia, limite e as metas do foco.
- `core/solver/equipe.ts` (`montarEquipe`): um MILP, descrito no topo do arquivo. Pontos que importam:
  Aniimo com as mesmas aptidões viram um perfil (sem limite de cópias, perfil superado por outro sai
  do modelo; Prismana não tira um comum); balanço de material por produto, e o que sobra é vendido;
  fases: postos fixos e lotes, metas do foco, moedas/h, e por fim menos Aniimo mantendo 99,5% das
  moedas (no empate, menos Prismana e mais moedas).
- **Pedido do usuário (2026-10-11): uma receita por máquina.** Uma versão em que as unidades de uma
  instalação repartiam o dia entre receitas foi rejeitada ("tenho 2 Secadoras e está me sugerindo 3
  receitas; o ideal é definir uma receita em cada máquina e deixar rolando, sem interferência
  minha"). Cada unidade fica com uma receita (`n_r` inteiro), e a que não tem o que fazer fica
  parada. Com todas as receitas isso leva 20 a 60 s, então `montarEquipe` roda em duas passadas: um
  rascunho rápido sem `n_r` inteiro diz quais receitas valem a pena, e o plano final escolhe só entre
  elas mais as duas de maior valor acrescentado por hora de cada instalação. É heurística: no RV 14
  fica a ~1% do ótimo e leva ~2 s; no RV 20 com o Lar cheio, ~12 s (cada fase para em 10 s com a
  melhor solução). A meta do banquete conta prato a prato (com uma receita por unidade nem sempre dá
  para fazer todos); a do nível continua sendo o item mais atrasado.
- Foco: Dinheiro e Minha seleção maximizam moedas/h; Nível põe na frente o ritmo dos itens de
  `custoPorRv` do próximo RV (o mais atrasado manda); Festival, os pratos do banquete no ritmo que
  fecha 5 de cada até o prazo. Instalação que não rende moedas (Jogo de Dança Lapidador, Fabricante
  de Aniicápsula) fica parada fora das metas.
- `core/lar/plano-lar.service.ts`: foco, culturas, planta, liberação, oferta e lotes liberados,
  compartilhados com a página do Lar. `SolverService`/worker transportam `montarEquipe`.
- `ZonaStore` (chave `aniimo.zona.v3`): `soMeus`, `excluirPrismana`, `maxCopias` (null = sem limite,
  **decisão do usuário**: padrão sem limite), `equipeLotes` (só o que o jogador fixou; **decisão do
  usuário**: automático com ajuste), `aniimoAUsar` (null = limite do Lar), `geradores`,
  `wattsPorGerador`.
- Tela (`features/equipe/`): plano em uso e "Aniimo a usar", opções, energia, equipe dos lotes,
  placar (Aniimo usados, moedas/h), "Quem colocar" (por forma, com quantidade e onde trabalha), "O
  que cada instalação faz" (quantas unidades em cada receita, itens/h e quanto trabalham; paradas no fim), ambientes e
  armazéns, e o que sobra para vender. **Decisão do usuário:** manter "só os meus" e "sem Prismana".
- **Aprovado pelo usuário (2026-10-11).** `EquipeService` (`core/solver/equipe.service.ts`) guarda a
  entrada e o resultado, e as duas páginas leem dele: na do Lar, "Deve produzir" e "Produz por dia".
  O card "O que vender" do Lar continua sendo o ranking de receitas por hora de máquina
  (`vendas.ts`), que serve para escolher culturas e alimenta os focos; o que o plano de fato vende
  está em "O que sobra para vender", na página Equipe.

## Solver (`src/app/core/solver/`)

- `equipe.ts` é TS puro, sem Angular; recebe o backend (`LegacyHighs`) por parâmetro. Browser:
  `highs-browser.ts` no `solver.worker.ts`, via `SolverService`. Testes: `highs-node.ts`.
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
  Chaves: `aniimo.roster.v1`, `aniimo.zona.v3` e `aniimo.lar.v1`; mude a versão se mudar o formato.

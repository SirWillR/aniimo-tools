# Otimizador de Zona de Produção do Aniimo

Informe os "Requisitos Estimados" de uma Zona de Produção do Lar e receba o **menor grupo de Aniimo**
que atinge todos eles. Cada Aniimo conta 1 em cada aptidão que possui, independente do nível; o nível
só desempata.

Angular 22 (standalone, signals, zoneless), TypeScript strict, SCSS, testes com Vitest.

## Rodando

Requer Node ≥ 22.22.3 (há um `.nvmrc`: `nvm use`).

```sh
npm install
npm start        # http://localhost:4200
npm test         # testes unitários (ng test)
npm run build    # produção em dist/aniimo/browser
```

## Como usar

1. **Requisitos**: preencha a tabela igual à do jogo (ou cole os 13 números de uma vez, na ordem Fogo,
   Planta, Água, Rocha, Elétrico, Gelo, Vento, Trevas, Luz, Transporte, Artesanato, Lazer, Perfumaria).
2. **Opções**:
   - *Só os meus*: usa apenas os Aniimo marcados em **Meus Aniimo** (com quantidade).
   - *Excluir Prismana*.
   - *Modo complementar*: informe a distribuição atual e/ou os Aniimo já alocados; o app sugere só o que
     falta. Com a distribuição zerada, ela é calculada a partir dos alocados.
   - *Cópias por Aniimo* (padrão 1). No modo "só os meus" vale a quantidade do roster.
3. **Resultado**: os Aniimo sugeridos com aptidões e níveis, e a cobertura por aptidão (atingido/requerido).
   Se for impossível, mostra o que falta em cada aptidão e a melhor cobertura parcial.

Roster e requisitos ficam salvos no `localStorage` do navegador.

### Construção do Lar (aba **Lar**)

O app monta a base completa do nível máximo (RV 20); enquanto sobe de nível, você constrói nos espaços
já reservados. Em "Seu nível", o que já dá para construir fica em destaque e o resto aparece apagado,
com o RV em que libera. O mapa pode ser girado de 0° a 359°. A planta traz Fazendas e Bosques em volta
da Fornalha, do Resfriador e da Lâmpada Solar (com a cultura sugerida para cada zona de temperatura),
numa única área de cultivo cercada, máquinas lado a lado numa vila de oficinas, mina e poço, moradias de
Aniimo e as chocadeiras, com caminhos, cercas, praças e decoração temática. Em **Culturas**, escolha o que quer cultivar: os modos dos ambientes e a
disposição das Fazendas e Bosques se ajustam. Em **Coringas**, informe quantas Fazendas deixar livres
para sementes de evento. Em **Foco**, escolha entre a sua seleção, dinheiro ou subir de nível. Toque numa construção para ver
as aptidões e os níveis que ela pede e, nas máquinas, o que ela deve produzir no seu nível;
"Ver grade" mostra o grid e o alcance exato de cada ambiente.

Os dados de construção vêm do [aniimax](https://github.com/ae-bii/aniimax) (MIT, por aebii). Os
tamanhos das construções foram medidos no jogo.

## Estrutura

```
scripts/extract-home-abilities.ts   extração da wiki oficial (npm run data)
scripts/extract-homeland-construction.ts   extração do aniimax (npm run data:lar)
src/assets/data/                    aniimo-home-abilities.json e lar-construcao.json (gerados)
src/app/core/lar/                   construção do Lar: inventário por RV, geometria, layout, decoração
src/app/core/data/                  modelos, carregamento dos dados, roster e estado da zona
src/app/core/solver/                solver puro em TS + Web Worker + carregadores do HiGHS
src/app/features/requisitos|roster|resultado|lar   páginas (lazy loading)
src/app/shared/                     ícones de aptidão, seletor de Aniimo e o mapa ilustrado do Lar
```

## Solver

Programação linear inteira com [HiGHS](https://highs.dev) compilado para WebAssembly (pacote
[`highs`](https://www.npmjs.com/package/highs), MIT), rodando num Web Worker.

- x_i = cópias do Aniimo i (0 ≤ x_i ≤ limite); a_ij = 1 se i tem a aptidão j.
- **Fase 1**: minimiza Σ x_i sujeito a Σ_i a_ij·x_i ≥ r_j.
- **Fase 2**: fixa Σ x_i no ótimo da fase 1 e maximiza a soma dos níveis nas aptidões requeridas.
  Otimização lexicográfica: o desempate nunca troca um Aniimo a mais por níveis maiores.
- Inviabilidade é detectada sem ILP (sem limite de vagas, o máximo de cada aptidão é usar tudo).

Por que HiGHS: `glpk.js` é GPL-3.0; `javascript-lp-solver` tem histórico de problemas numéricos no
branch-and-bound. O HiGHS é exato e rápido (~30 ms para o exemplo); o custo é o WASM de 3,5 MB, que só
é baixado ao abrir o resultado. O ótimo do exemplo (18 Aniimo; 20 sem Prismana) foi conferido com um
segundo solver (YALPS).

`highs.mjs` tem um `import("node:module")` usado só no Node; por isso `node:module` está em
`externalDependencies` no `angular.json`. O `highs.wasm` é copiado para `/wasm` pelos assets.

## Dados

`src/assets/data/aniimo-home-abilities.json` traz as habilidades de lar de cada forma de Aniimo
(formas regionais e Prismana são entradas separadas), com fonte e data em `fonte`.

### Atualizar

```sh
npm run data             # usa o cache em scripts/.cache (ignorado pelo git)
npm run data -- --fresh  # baixa tudo de novo (~420 requisições, ~2 min)
```

O script lê o sitemap da wiki oficial e o payload Nuxt de cada forma
(`https://wiki.aniimo.com/item/{numero}/{forma}/_payload.json`, em EN e PT), com 2 requisições em
paralelo, 300 ms de intervalo e retry com backoff. Ele falha se aparecer um código de habilidade
desconhecido e avisa se alguma entrada quebrar as regras do jogo (aptidões elementais diferentes do
elemento de combate, mais de 2 de trabalho, nenhuma aptidão).

Espécies que ainda não estão na wiki oficial não entram nos dados.

### De onde vem cada aptidão

A wiki só publica códigos (`home-1000`…) e níveis. O mapeamento está em `APTIDOES`, no script:

- `home-1000`…`home-1008` (elementais): o sprite de cada código usa a mesma posição do ícone
  `attributes-<elemento>` no CSS da wiki.
- `home-1100`…`home-1103` (trabalho): conferido uma vez contra o Hideout Guides (via o
  [aniimo-tools](https://github.com/goul4rt/aniimo-tools)); as 84 espécies em comum tinham aptidões e
  níveis idênticos. Os dados em si vêm só da wiki oficial.

Imagens: URLs do CDN oficial, carregadas direto de lá. Aniimo, nomes e imagens são © Pawprint Studio.

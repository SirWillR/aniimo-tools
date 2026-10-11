# Otimizador de Zona de Produção do Aniimo

Monta a planta do Lar e recomenda a **equipe**: o que cada instalação faz e quais Aniimo colocar,
escolhidos juntos pelo maior ganho dentro do limite de Aniimo do Lar.

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

1. **Lar**: escolha o seu nível (RV), o foco e as culturas. É daí que sai o que cada máquina deve
   produzir.
2. **Equipe**: a lista de quem colocar (por espécie, com quantidade) e o que cada instalação faz. A
   conta fecha o material (máquina sem insumo espera), respeita o nível que cada receita pede e as
   famílias dos produtos de moradia, usa energia onde compensa e deixa parado o que rende menos.
   Opções:
   - *Aniimo a usar*: menos que o limite do Lar, para ver o que se perde com uma equipe menor.
   - *Só os meus*: usa apenas os Aniimo marcados em **Meus Aniimo** (com quantidade).
   - *Excluir Prismana* e *Cópias por Aniimo* (vazio = sem limite).
   - *Geradores de Estalos* e *watts por gerador*.
   - *Equipe dos lotes*: automática (1 Aniimo por tarefa para cada 8 lotes) ou fixada por você.

Roster e opções ficam salvos no `localStorage` do navegador.

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
src/app/features/equipe|roster|lar  páginas (lazy loading)
src/app/shared/                     ícones de aptidão, seletor de Aniimo e o mapa ilustrado do Lar
```

## Solver

Programação linear inteira com [HiGHS](https://highs.dev) compilado para WebAssembly (pacote
[`highs`](https://www.npmjs.com/package/highs), MIT), rodando num Web Worker.

O modelo (em `src/app/core/solver/equipe.ts`) escolhe ao mesmo tempo a receita de cada máquina, o tempo
de cada Aniimo em cada receita, o que vai na rede elétrica e quantos Aniimo de cada tipo colocar:

- cada máquina fica com **uma receita** e só trabalha enquanto tem material (balanço por produto);
- o Aniimo precisa ter a aptidão no nível da receita, trabalha mais rápido acima dele e faz uma coisa
  de cada vez; alguns produtos só uma família faz;
- ambientes, armazéns, a equipe dos lotes e o gerador ocupam Aniimo; o total respeita o limite do Lar;
- objetivo em fases: postos obrigatórios, a meta do foco, moedas por hora e, por fim, a menor equipe
  que mantém 99,5% das moedas.

Para ficar rápido, roda em duas passadas: um rascunho sem a regra de uma receita por máquina escolhe as
receitas candidatas, e o plano final decide só entre elas (cerca de 2 s no RV 14; até uns 12 s no RV 20).

Por que HiGHS: `glpk.js` é GPL-3.0; `javascript-lp-solver` tem histórico de problemas numéricos no
branch-and-bound. O custo é o WASM de 3,5 MB, que só é baixado quando a equipe é calculada.

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

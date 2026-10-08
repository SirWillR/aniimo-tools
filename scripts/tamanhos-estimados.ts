// Lado do quadrado ocupado por cada instalação, em tiles.
//
// MEDIDOS: tamanhos vistos no jogo pelo usuário (lista de 2026-09-29), que batem com o `coverage.rs` do
// aniimax onde ele também tem o dado (Fazenda, Bosque, ambientes).
// ESTIMADOS: sem fonte; servem só para desenhar e aparecem marcados na UI. Hoje não há nenhum.
// Para corrigir, ajuste o valor e rode `npm run data:lar`.

export const MEDIDOS: Readonly<Record<string, number>> = {
  'farmland': 2,
  'woodland': 4,
  'mine': 5,
  'well': 2,
  'tidewhisper-sandcastle': 5,
  'dewy-house': 2,
  'nimbus-bed': 5,
  'starfall-hammock': 5,
  'floral-windmill': 5,
  'heat-furnace': 1,
  'cooling-unit': 2,
  'sunlamp': 1,
  'carousel-mill': 5,
  'crafting-table': 4,
  'claw-game-cooker': 4,
  'jukebox-dryer': 3,
  'simmering-pot': 2,
  'phonolfactory-table': 4,
  'bouncy-brew-keg': 4,
  'blazing-stove': 3,
  'pickling-jar': 3,
  'joy-wheel-loom': 4,
  'dance-pad-polisher': 3,
  'aniipod-maker': 5,
  'woodworking-bench': 2,
  'chimney-kiln': 6,
};

export const ESTIMADOS: Readonly<Record<string, number>> = {};

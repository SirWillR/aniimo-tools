// Nomes em português da construção do Lar. Construções: nomes oficiais do jogo, informados pelo usuário.
// Produtos: traduções propostas (nenhuma fonte publica os nomes PT). O que não estiver aqui aparece em inglês (há teste para não faltar).
import type { Ambiente } from './modelos-lar';

/** Nomes oficiais do jogo em PT (lista do usuário, 2026-09-29), salvo Fazenda e Bosque. */
export const CONSTRUCAO_PT: Readonly<Record<string, string>> = {
  'farmland': 'Fazenda',
  'woodland': 'Bosque',
  'mine': 'Mina',
  'well': 'Poço',
  'tidewhisper-sandcastle': 'Castelo de Areia',
  'dewy-house': 'Casa Orvalhada',
  'nimbus-bed': 'Cama Nimbo',
  'starfall-hammock': 'Rede Quedestrela',
  'floral-windmill': 'Moinho de Vento Floral',
  'heat-furnace': 'Forno de Calor',
  'cooling-unit': 'Resfriador',
  'sunlamp': 'Lâmpada Solar',
  'carousel-mill': 'Moinho Carrossel',
  'crafting-table': 'Mesa de Criação',
  'claw-game-cooker': 'Máquina de Garra Gurmê',
  'jukebox-dryer': 'Secadora Jukebox',
  'simmering-pot': 'Panela de Cozimento',
  'phonolfactory-table': 'Mesa Fonolfatória',
  'bouncy-brew-keg': 'Saltibarril',
  'blazing-stove': 'Fogão de Brasa',
  'pickling-jar': 'Pote de Conservas',
  'joy-wheel-loom': 'Tear Roda-Gigante',
  'dance-pad-polisher': 'Jogo de Dança Lapidador',
  'aniipod-maker': 'Fabricante de Aniicápsula',
  'woodworking-bench': 'Bancada de Marcenaria',
  'chimney-kiln': 'Forno com Chaminé',
  'chocadeira': 'Chocadeira',
  'armazem': 'Unidade de Armazenamento',
};

export const AMBIENTE_PT: Readonly<Record<Ambiente, string>> = {
  freeze: 'Congelante',
  cool: 'Frio',
  warm: 'Morno',
  scorching: 'Escaldante',
  adequate: 'Adequado',
};

/** Etapas do cultivo (os nomes vêm em inglês nos dados). */
export const ETAPA_PT: Readonly<Record<string, string>> = {
  Reclaiming: 'Preparar a terra', Sowing: 'Semear', Reaping: 'Colher', Collecting: 'Coletar', Logging: 'Cortar',
  Watering: 'Regar',
};

/** Produtos de coleta e cultivo (os que aparecem nos lotes do mapa). */
const CULTIVO_PT: Readonly<Record<string, string>> = {
  wheat: 'Trigo', potato: 'Batata', rice: 'Arroz', soybean: 'Soja', rose: 'Rosa', cotton: 'Algodão',
  strawberry: 'Morango', lavender: 'Lavanda', sugarcane: 'Cana-de-açúcar', ginseng: 'Ginseng', grape: 'Uva',
  cranberry: 'Cranberry', agave: 'Agave',
  willow_wood: 'Madeira de Salgueiro', bamboo: 'Bambu', lemon: 'Limão', cherry_blossom: 'Flor de Cerejeira',
  apple: 'Maçã', maple_syrup: 'Xarope de Bordo', palm_bark: 'Casca de Palmeira', chestnut: 'Castanha',
  walnut: 'Noz', natural_rubber: 'Borracha Natural', coconut: 'Coco', cocoa: 'Cacau',
  orange_flower: 'Flor de Laranjeira',
  rock: 'Pedra', clay: 'Argila', shell: 'Concha', copper_ore: 'Minério de Cobre', quartz_ore: 'Minério de Quartzo',
  gem: 'Gema',
  well_water: 'Água de Poço', fresh_water: 'Água Doce', deep_rock_spring_water: 'Água de Nascente Profunda',
  natural_mineral_spring_water: 'Água Mineral Natural',
  sea_salt: 'Sal Marinho', pearl: 'Pérola', aromathyst: 'Aromatista', wool: 'Lã', petals: 'Pétalas',
  star: 'Estrela', scales: 'Escamas',
};

/** Produtos das máquinas e subprodutos. PROPOSTA de tradução (nenhuma fonte publica os nomes PT). */
const MAQUINAS_PT: Readonly<Record<string, string>> = {
  // Moinho Carrossel
  wheatmeal: 'Farinha de Trigo', tofu: 'Tofu', milled_rice: 'Arroz Beneficiado', lavender_powder: 'Pó de Lavanda',
  rice_drink: 'Bebida de Arroz', ginseng_powder: 'Pó de Ginseng', refined_flour: 'Farinha Refinada',
  coconut_oil: 'Óleo de Coco', cocoa_powder: 'Cacau em Pó', coconut_milk: 'Leite de Coco',
  // Mesa de Artesanato
  wood_sculpture: 'Escultura de Madeira', bamboo_ware: 'Utensílios de Bambu', river_washed_stones: 'Pedras de Rio',
  rose_freshener: 'Aromatizador de Rosa', pottery: 'Cerâmica', bouquet: 'Buquê', shell_ornament: 'Enfeite de Concha',
  lavender_sachet: 'Sachê de Lavanda', wind_chime: 'Sino dos Ventos', star_wish_lantern: 'Lanterna dos Desejos',
  dream_catcher: 'Filtro dos Sonhos', advanced_wind_chime: 'Sino dos Ventos Avançado', rubber_duck: 'Patinho de Borracha',
  pearl_necklace: 'Colar de Pérolas', woven_toy: 'Brinquedo Trançado', porcelain: 'Porcelana', dye: 'Tintura',
  gemstone_dust: 'Pó de Gema', flowers_in_a_bottle: 'Flores na Garrafa', advanced_gemstone_dust: 'Pó de Gema Avançado',
  doll: 'Boneca',
  // Forno Máquina de Garra
  bread: 'Pão', roasted_soybeans: 'Soja Torrada', maple_candy_roasted_potatoes: 'Batatas Assadas com Bordo',
  apple_tart: 'Torta de Maçã', rose_shortbread: 'Biscoito Amanteigado de Rosa', lavender_cookies: 'Biscoitos de Lavanda',
  apple_candy: 'Maçã do Amor', grape_candy: 'Bala de Uva', caramel_nut_chips: 'Crocante de Nozes com Caramelo',
  maple_candy_star: 'Estrela de Bordo', coconut_cookie: 'Biscoito de Coco', flower_bread: 'Pão de Flor',
  berry_chocolate_coconut_pudding: 'Pudim de Coco com Chocolate e Frutas Vermelhas',
  // Secador Jukebox
  potato_chips: 'Batata Chips', dried_lemon_slices: 'Limão Desidratado', dried_cherry_blossom: 'Flor de Cerejeira Seca',
  dried_bean_curd: 'Tofu Seco', dried_apple_slices: 'Maçã Desidratada', dried_strawberries: 'Morango Desidratado',
  nuts: 'Mix de Castanhas', dried_ginseng: 'Ginseng Seco', dried_grapes: 'Uva-passa', shredded_coconut: 'Coco Ralado',
  dried_cranberries: 'Cranberry Desidratado', dried_flowers: 'Flores Secas',
  // Caldeirão
  plain_rice_porridge: 'Mingau de Arroz', rose_concentrate: 'Concentrado de Rosa', rock_candy: 'Açúcar Cristal',
  strawberry_jam: 'Geleia de Morango', maple_candy_apple_jam: 'Geleia de Maçã com Bordo', chestnut_puree: 'Purê de Castanha',
  grape_jam: 'Geleia de Uva', ginseng_porridge: 'Mingau de Ginseng', maple_sugar_chunk: 'Torrão de Açúcar de Bordo',
  malt_sugar: 'Açúcar de Malte', cocoa_spread: 'Creme de Cacau', cranberry_jam: 'Geleia de Cranberry',
  agave_syrup: 'Xarope de Agave',
  // Mesa Fonolfativa
  bamboo_joss_stick: 'Incenso de Bambu', rose_incense: 'Incenso de Rosa', cherry_incense: 'Incenso de Cerejeira',
  lavender_incense: 'Incenso de Lavanda', lemon_incense: 'Incenso de Limão', advanced_lemon_incense: 'Incenso de Limão Avançado',
  herbal_ginseng_aroma: 'Aroma Herbal de Ginseng', soap: 'Sabonete', orange_flower_incense: 'Incenso de Flor de Laranjeira',
  mixed_perfume: 'Perfume Misto', lotion: 'Loção',
  // Barril Saltitante
  wheat_tea: 'Chá de Trigo', toasted_rice_green_tea: 'Chá Verde com Arroz Tostado', potato_kvass: 'Kvass de Batata',
  strawberry_juice: 'Suco de Morango', apple_juice: 'Suco de Maçã', sugarcane_juice: 'Caldo de Cana', grape_juice: 'Suco de Uva',
  ginseng_water: 'Água de Ginseng', grape_lemon_drink: 'Bebida de Uva e Limão', walnut_milk: 'Leite de Noz',
  cranberry_juice: 'Suco de Cranberry', coconut_cooler: 'Refresco de Coco', agave_drink: 'Bebida de Agave',
  hot_cocoa: 'Chocolate Quente', coconut_cocoa: 'Cacau com Coco', orange_flower_dew: 'Orvalho de Flor de Laranjeira',
  // Fogão Ardente
  soy_sauce_fried_rice: 'Arroz Frito com Shoyu', creamy_potato_soup: 'Creme de Batata', cherry_blossom_rice_ball: 'Bolinho de Arroz com Cerejeira',
  potato_soup: 'Sopa de Batata', tanghulu: 'Tanghulu', soy_sauce_tofu: 'Tofu com Shoyu', sugar_roasted_chestnuts: 'Castanhas Caramelizadas',
  steamed_vermicelli_roll: 'Rolinho de Arroz no Vapor', ginseng_chestnut_cake: 'Bolo de Ginseng e Castanha', walnut_cake: 'Bolo de Nozes',
  jello: 'Gelatina', strawberry_candy: 'Bala de Morango', rich_grape_compote: 'Compota de Uva', strawberry_cream_puff: 'Carolina de Morango',
  cranberry_chocolate: 'Chocolate com Cranberry',
  // Pote de Conserva
  soy_sauce: 'Shoyu', salted_cherry_blossom: 'Flor de Cerejeira em Conserva', sweet_rice_drink: 'Bebida Doce de Arroz',
  cider_vinegar: 'Vinagre de Cidra', sweet_rice_wine: 'Vinho Doce de Arroz', rice_vinegar: 'Vinagre de Arroz', salted_lemon: 'Limão em Conserva',
  candied_strawberries: 'Morangos Cristalizados', candied_orange_flower: 'Flor de Laranjeira Cristalizada',
  // Tear Roda da Alegria
  cotton_thread: 'Linha de Algodão', woolen_yarn: 'Fio de Lã', cotton_fabric: 'Tecido de Algodão', palm_rope: 'Corda de Palmeira',
  wool_fabric: 'Tecido de Lã', dyed_cotton_fabric: 'Tecido de Algodão Tingido',
  // Polidor Pista de Dança e Fábrica de Aniipod
  growth_bud: 'Broto de Crescimento', growth_flower: 'Flor de Crescimento', growth_fruit: 'Fruto de Crescimento',
  aniipod: 'Aniipod', aniipod_pro: 'Aniipod Pro', aniipod_mega: 'Aniipod Mega',
  // Bancada de Marcenaria e Forno de Chaminé (materiais de subir de nível)
  rough_lumber: 'Madeira Bruta', standard_planks: 'Tábuas Padrão', laminated_beams: 'Vigas Laminadas',
  densified_timber_component: 'Peça de Madeira Adensada', coarse_sifted_ore: 'Minério Peneirado',
  sintered_ore_brick: 'Tijolo de Minério Sinterizado', refined_ore: 'Minério Refinado', microcrystalline_ore_plate: 'Placa de Minério Microcristalino',
  // Subprodutos
  wood_block: 'Bloco de Madeira', mineral_sand: 'Areia Mineral',
};

/** Festival da Lua da Colheita (`festival.ts`): nomes oficiais do jogo, das capturas do usuário. */
const FESTIVAL_PT: Readonly<Record<string, string>> = {
  moon_radish: 'Rabanete do Orvalho-lunar', crescent_pepper: 'Pimenta da Lua Crescente',
  umbral_pickle: 'Conserva Umbralina', umbral_casserole: 'Caçarola Umbralina', harvest_platter: 'Travessa da Colheita',
  roasted_crescent_pepper: 'Pimenta da Lua Crescente Assada', moon_radish_slices: 'Fatias de Rabanete Orvalho-lunar',
  umbral_sweet_spicy_sauce: 'Molho Doce e Apimentado do Umbral',
};

export const PRODUTO_PT: Readonly<Record<string, string>> = { ...CULTIVO_PT, ...MAQUINAS_PT, ...FESTIVAL_PT };

/** Variantes: `quick_x` → "X (rápido)", `premium_x` → "X Premium". */
export function nomeProduto(chave: string, nomeEn: string): string {
  const [, variante, base] = /^(quick|premium)_(.+)$/.exec(chave) ?? [];
  if (variante && base && PRODUTO_PT[base])
    return variante === 'quick' ? `${PRODUTO_PT[base]} (rápido)` : `${PRODUTO_PT[base]} Premium`;
  return PRODUTO_PT[chave] ?? nomeEn;
}

export function nomeConstrucao(chave: string, nomeEn: string): string {
  return CONSTRUCAO_PT[chave] ?? nomeEn;
}

// Curadoria dos itens decorativos do jogo que o mapa do Lar usa (`npm run data:enfeites`). Feita à mão:
// só itens de exterior que fazem sentido vistos de cima num terreno.
//
// O Aniidex (fonte dos nomes, RV, preço e habitabilidade) NÃO publica o tamanho em tiles: `largura` e
// `altura` aqui são ESTIMATIVAS nossas, até o usuário conferir no jogo. Quando ele conferir um item,
// ponha `medido: true` na linha. `forma` é o nosso desenho (`<symbol id="ml-...">` em
// src/app/shared/mapa-lar/mapa-simbolos.html) e `cor` a cor principal dele, quando o desenho é
// compartilhado (árvores, flores, arbustos).

/** Onde o enfeite pode aparecer: os quatro tipos de terreno decorativo e os temas produtivos. */
export type Uso = 'praca' | 'lago' | 'pomar' | 'lazer' | 'cultivo' | 'oficina' | 'recursos' | 'moradias' | 'ninhal';

export interface Escolhido {
  /** Slug da página do item no Aniidex (`/pt/items/{slug}/`) e o id do item, para conferência. */
  slug: string;
  id: string;
  forma: string;
  cor?: string;
  largura: number;
  altura: number;
  medido?: true;
  usos: Uso[];
}

const e = (slug: string, id: string, forma: string, largura: number, altura: number, usos: Uso[], cor?: string): Escolhido => ({
  slug, id, forma, largura, altura, usos, ...(cor ? { cor } : {}),
});

export const ESCOLHIDOS: readonly Escolhido[] = [
  // ---- árvores ----
  e('cherry-tree', '40300004', 'arvore', 2, 2, ['pomar', 'praca'], '#f0a3c0'),
  e('apple-tree', '40300005', 'arvore', 2, 2, ['pomar'], '#5c9b45'),
  e('oak', '40300009', 'arvore', 2, 2, ['lago', 'lazer', 'oficina'], '#3f7f3f'),
  e('maple-tree', '40300003', 'arvore', 2, 2, ['pomar'], '#d98a3a'),
  e('willow', '40300001', 'arvore', 2, 2, ['lago'], '#86b86a'),
  e('pine-tree', '40300007', 'pinheiro', 2, 2, ['recursos', 'lago']),
  e('coconut-tree', '40300008', 'palmeira', 2, 2, ['lazer']),
  e('golden-trumpet-tree', '40300016', 'arvore', 2, 2, ['praca'], '#f6d04d'),
  e('wisteria', '40400018', 'arvore', 2, 2, ['praca', 'moradias'], '#b58be0'),
  // ---- arbustos e flores ----
  e('round-shrubs', '40700007', 'arbusto', 1, 1, ['praca', 'lago', 'pomar', 'lazer', 'cultivo', 'oficina', 'recursos'], '#5a9a4a'),
  e('flowering-shrubs', '40700016', 'arbusto', 1, 1, ['praca', 'moradias'], '#e58fb0'),
  e('box-hedge', '40700001', 'cerca-viva', 2, 1, ['praca']),
  e('endless-summer', '40400004', 'flores', 1, 1, ['praca', 'moradias'], '#7fa8e8'),
  e('red-rose', '40400031', 'flores', 1, 1, ['praca'], '#e0455f'),
  e('sunflower', '40400012', 'flores', 1, 1, ['cultivo', 'pomar'], '#f6c343'),
  e('lavender', '40400002', 'flores', 1, 1, ['cultivo', 'lago'], '#9c7fd6'),
  e('pink-tulip', '40400033', 'flores', 1, 1, ['praca', 'moradias', 'lazer', 'oficina'], '#f28ab2'),
  e('daisy', '40400006', 'flores', 1, 1, ['pomar', 'lago', 'ninhal'], '#fdfbf5'),
  // ---- água ----
  e('spinning-fountain', '40600038', 'fonte', 2, 2, ['praca']),
  e('curved-pond', '40700005', 'lago', 4, 3, ['lago']),
  e('pond', '40700003', 'laguinho', 2, 2, ['lazer']),
  e('stone-bridge', '40500003', 'ponte', 3, 2, ['lago']),
  e('wooden-waterwheel', '40500016', 'roda-dagua', 2, 2, ['lago']),
  // ---- estruturas ----
  e('gazebo', '40500002', 'gazebo', 4, 4, ['pomar']),
  e('garden-gate', '40500006', 'portao', 2, 1, ['praca', 'pomar', 'lazer']),
  e('floral-arch', '40700019', 'arco-florido', 2, 1, ['praca', 'moradias'], '#f28ab2'),
  e('puffby-flower-trellis', '40500014', 'trelica', 2, 1, ['pomar', 'moradias']),
  e('pawprint-swing', '40500007', 'balanco', 2, 2, ['lazer']),
  e('aniimo-climbing-frame', '50900004', 'escalada', 3, 3, ['lazer']),
  e('camping-canopy', '40500004', 'tenda', 3, 3, ['lago']),
  e('bonfire', '40600012', 'fogueira', 1, 1, ['lago', 'lazer']),
  e('playful-adventure-den', '50900001', 'toca-aventura', 3, 3, ['lazer']),
  e('balloon', '40600004', 'balao', 1, 1, ['lazer']),
  e('cozy-bear-den', '51130010', 'toca', 2, 2, ['lazer', 'moradias']),
  // ---- móveis e luzes ----
  e('grassland-dining-table', '50200001', 'piquenique', 2, 2, ['lago']),
  e('solid-wood-low-stool', '40900009', 'banquinho', 1, 1, ['praca', 'lago']),
  e('sun-umbrella', '40600036', 'sombrinha', 2, 2, ['lago', 'lazer']),
  e('retro-streetlamp', '41100007', 'poste', 1, 1, ['praca', 'oficina', 'moradias'], '#ffd98a'),
  e('mushroom-light', '41100003', 'cogumelo', 1, 1, ['pomar', 'lazer']),
  e('glowstone-lamp-i', '40600065', 'lanterna', 1, 1, ['lago', 'recursos']),
  e('stone-carved-figure', '40600027', 'estatua', 1, 1, ['praca']),
  // ---- chão e cercas ----
  e('gravel-path', '40100010', 'cascalho-chao', 2, 2, ['lago', 'pomar', 'lazer']),
  e('flagstone-pavement', '40100002', 'laje', 2, 2, ['praca']),
  e('garden-fence', '40200004', 'cerca-jardim', 2, 0.5, ['cultivo', 'ninhal']),
  // ---- fazenda, minas e oficina ----
  e('hayrick', '40600001', 'feno', 1, 1, ['cultivo', 'ninhal']),
  e('wheelbarrow', '40600075', 'carrinho-mao', 1, 1, ['cultivo']),
  e('hay-cart', '40600008', 'carroca', 2, 1, ['cultivo']),
  e('empty-cart', '40600007', 'carrinho-minerio', 2, 1, ['recursos']),
  e('rock---repose', '40700028', 'pedra', 1, 1, ['recursos', 'lago'], '#a9a397'),
  e('starine-pile-medium', '40600016', 'pedras-minerio', 1, 1, ['recursos']),
  e('stacked-wood-pile', '40600002', 'lenha', 1, 1, ['oficina']),
  e('terracotta-vase', '40600032', 'vaso', 1, 1, ['oficina', 'moradias'], '#f28ab2'),
  e('wooden-signpost', '40600009', 'placa', 1, 1, ['oficina']),
  e('moss-covered-stump', '40700017', 'toco', 1, 1, ['pomar']),
  e('woven-grass-nest', '40900017', 'ninho', 1, 1, ['ninhal', 'moradias']),
];

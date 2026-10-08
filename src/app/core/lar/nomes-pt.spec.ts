import json from '../../../assets/data/lar-construcao.json';
import type { DadosConstrucao } from './modelos-lar';
import { nomeConstrucao, nomeProduto } from './nomes-pt';

const dados = json as unknown as DadosConstrucao;

describe('nomes em português', () => {
  it('todo produto e toda construção têm nome traduzido', () => {
    const semProduto = dados.produtos.filter((p) => nomeProduto(p.chave, '§') === '§').map((p) => p.chave);
    const semConstrucao = dados.construcoes.filter((c) => nomeConstrucao(c.chave, '§') === '§').map((c) => c.chave);
    expect([...semProduto, ...semConstrucao]).toEqual([]);
  });
});

import { TestBed } from '@angular/core/testing';
import { RosterService } from './roster.service';
import { CHAVE_ZONA, ZonaStore } from './zona.store';

describe('ZonaStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  const criar = () => TestBed.inject(ZonaStore);

  it('começa zerado, com 1 cópia e sem modos especiais', () => {
    const zona = criar();
    expect(zona.requisitos()).toEqual(Array(13).fill(0));
    expect(zona.temRequisitos()).toBe(false);
    expect(zona.opcoes()).toEqual({ excluirPrismana: false, maxCopias: 1 });
  });

  it('edita requisitos por aptidão e aceita os 13 de uma vez', () => {
    const zona = criar();
    zona.definirRequisito('rock', 10);
    expect(zona.requisitos()[3]).toBe(10);
    zona.definirRequisitos([4, 5, 7, 10, 1, 1, 2, 4, 1, 5, 2, 2, 1]);
    expect(zona.requisitos()).toEqual([4, 5, 7, 10, 1, 1, 2, 4, 1, 5, 2, 2, 1]);
    zona.definirRequisitos([1, 2]); // tamanho errado: ignora
    expect(zona.requisitos()[0]).toBe(4);
  });

  it('"só os meus" passa o roster e deixa o limite de cópias com ele', () => {
    TestBed.inject(RosterService).definir('001-basic-form', 2);
    const zona = criar();
    zona.definirMaxCopias(3);
    zona.alternar('soMeus', true);
    expect(zona.opcoes()).toEqual({ excluirPrismana: false, roster: { '001-basic-form': 2 } });
  });

  it('modo complementar só manda a distribuição atual quando preenchida', () => {
    const zona = criar();
    zona.alternar('complementar', true);
    zona.definirAlocado('001-basic-form', 1);
    expect(zona.opcoes().complementar).toEqual({ alocados: { '001-basic-form': 1 } });

    zona.definirAtual('fire', 2);
    expect(zona.opcoes().complementar?.atual?.[0]).toBe(2);
  });

  it('persiste no localStorage', () => {
    criar().definirRequisito('water', 7);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem(CHAVE_ZONA)!).requisitos[2]).toBe(7);

    TestBed.resetTestingModule();
    expect(criar().requisitos()[2]).toBe(7);
  });
});

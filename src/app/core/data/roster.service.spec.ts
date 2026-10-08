import { TestBed } from '@angular/core/testing';
import { CHAVE_ROSTER, RosterService } from './roster.service';

describe('RosterService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  const criar = () => TestBed.inject(RosterService);
  const salvo = () => JSON.parse(localStorage.getItem(CHAVE_ROSTER) ?? 'null');

  it('define, soma e remove quantidades', () => {
    const roster = criar();
    roster.definir('001-basic-form', 2);
    roster.definir('002-basic-form', 1);
    expect(roster.total()).toBe(3);
    expect(roster.distintos()).toBe(2);

    roster.definir('001-basic-form', 0);
    expect(roster.itens()).toEqual({ '002-basic-form': 1 });
  });

  it('limita a quantidade entre 0 e 99', () => {
    const roster = criar();
    roster.definir('a', 500);
    roster.definir('b', -3);
    roster.definir('c', Number.NaN);
    expect(roster.itens()).toEqual({ a: 99 });
  });

  it('salva no localStorage e recarrega', () => {
    criar().definir('001-basic-form', 2);
    TestBed.tick();
    expect(salvo()).toEqual({ '001-basic-form': 2 });

    TestBed.resetTestingModule();
    expect(criar().quantidade('001-basic-form')).toBe(2);
  });

  it('ignora dados corrompidos no localStorage', () => {
    localStorage.setItem(CHAVE_ROSTER, '{"a": "muitos"}');
    expect(criar().itens()).toEqual({});
    localStorage.setItem(CHAVE_ROSTER, 'não é json');
    TestBed.resetTestingModule();
    expect(criar().itens()).toEqual({});
  });
});

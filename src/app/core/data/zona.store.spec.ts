import { TestBed } from '@angular/core/testing';
import { RosterService } from './roster.service';
import { CHAVE_ZONA, MAX_EQUIPE_LOTES, ZonaStore } from './zona.store';

describe('ZonaStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  const criar = () => TestBed.inject(ZonaStore);

  it('começa sem limite de cópias, sem modos especiais e com tudo no automático', () => {
    const zona = criar();
    expect(zona.opcoes()).toEqual({ excluirPrismana: false });
    expect(zona.equipeLotes()).toEqual({});
    expect(zona.aniimoAUsar()).toBeNull();
    expect(zona.geradores()).toBeNull();
    expect(zona.wattsPorGerador()).toBe(800);
  });

  it('cópias: um número limita, vazio ou zero volta a "sem limite"', () => {
    const zona = criar();
    zona.definirMaxCopias(3);
    expect(zona.opcoes()).toEqual({ excluirPrismana: false, maxCopias: 3 });
    zona.definirMaxCopias(0);
    expect(zona.opcoes()).toEqual({ excluirPrismana: false });
  });

  it('"só os meus" passa o roster e deixa o limite de cópias com ele', () => {
    TestBed.inject(RosterService).definir('001-basic-form', 2);
    const zona = criar();
    zona.definirMaxCopias(3);
    zona.alternar('soMeus', true);
    expect(zona.opcoes()).toEqual({ excluirPrismana: false, roster: { '001-basic-form': 2 } });
  });

  it('equipe dos lotes: o jogador fixa por tarefa, dentro do teto, e pode devolver ao automático', () => {
    const zona = criar();
    zona.definirEquipeLotes('grass', 3);
    zona.definirEquipeLotes('water', 99);
    zona.definirEquipeLotes('rock', -2);
    expect(zona.equipeLotes()).toEqual({ grass: 3, water: MAX_EQUIPE_LOTES, rock: 0 });
    zona.definirEquipeLotes('grass', null);
    expect(zona.equipeLotes()).toEqual({ water: MAX_EQUIPE_LOTES, rock: 0 });
  });

  it('Aniimo a usar e energia', () => {
    const zona = criar();
    zona.definirAniimoAUsar(30);
    zona.definirGeradores(2);
    zona.definirWattsPorGerador(600);
    expect([zona.aniimoAUsar(), zona.geradores(), zona.wattsPorGerador()]).toEqual([30, 2, 600]);
    zona.definirAniimoAUsar(null);
    zona.definirGeradores(null);
    expect([zona.aniimoAUsar(), zona.geradores()]).toEqual([null, null]);
  });

  it('persiste no localStorage', () => {
    criar().definirEquipeLotes('water', 2);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem(CHAVE_ZONA)!).equipeLotes.water).toBe(2);

    TestBed.resetTestingModule();
    expect(criar().equipeLotes().water).toBe(2);
  });

  it('estado salvo inválido volta ao inicial', () => {
    localStorage.setItem(CHAVE_ZONA, JSON.stringify({ soMeus: true, excluirPrismana: false, maxCopias: 1, equipeLotes: { fogo: 2 } }));
    expect(criar().soMeus()).toBe(false);
  });
});

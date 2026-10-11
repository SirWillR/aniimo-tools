import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('mostra a marca, as três seções e a data dos dados', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('assets/data/aniimo-home-abilities.json')
      .flush({ fonte: { extraidoEm: '2026-09-25T12:00:00Z' }, aptidoes: [], aniimos: [] });
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.marca-nome')?.textContent).toContain('Zona de Produção');
    const abas = [...el.querySelectorAll('.abas a')].map((a) => a.textContent?.trim());
    expect(abas).toEqual(['Equipe', 'Meus Aniimo', 'Lar']);
    expect(el.querySelector('.rodape')?.textContent).toContain('25/09/2026');
  });
});

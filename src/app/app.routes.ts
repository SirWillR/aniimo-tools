import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'equipe' },
  {
    path: 'equipe',
    title: 'Equipe · Zona de Produção',
    loadComponent: () => import('./features/equipe/equipe-page').then((m) => m.EquipePage),
  },
  {
    path: 'roster',
    title: 'Meus Aniimo · Zona de Produção',
    loadComponent: () => import('./features/roster/roster-page').then((m) => m.RosterPage),
  },
  {
    path: 'lar',
    title: 'Construção do Lar · Zona de Produção',
    loadComponent: () => import('./features/lar/lar-page').then((m) => m.LarPage),
  },
  // `requisitos` e `resultado` (telas antigas) caem aqui.
  { path: '**', redirectTo: 'equipe' },
];

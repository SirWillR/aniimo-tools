import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'requisitos' },
  {
    path: 'requisitos',
    title: 'Requisitos · Zona de Produção',
    loadComponent: () => import('./features/requisitos/requisitos-page').then((m) => m.RequisitosPage),
  },
  {
    path: 'roster',
    title: 'Meus Aniimo · Zona de Produção',
    loadComponent: () => import('./features/roster/roster-page').then((m) => m.RosterPage),
  },
  {
    path: 'resultado',
    title: 'Resultado · Zona de Produção',
    loadComponent: () => import('./features/resultado/resultado-page').then((m) => m.ResultadoPage),
  },
  {
    path: 'lar',
    title: 'Construção do Lar · Zona de Produção',
    loadComponent: () => import('./features/lar/lar-page').then((m) => m.LarPage),
  },
  { path: '**', redirectTo: 'requisitos' },
];

import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Texturas e peças (`<pattern>` e `<symbol>`) usadas pelo mapa do Lar e pelas miniaturas dos terrenos.
 * Ponha uma vez na página que mostra algum deles.
 */
@Component({
  selector: 'app-mapa-simbolos',
  templateUrl: './mapa-simbolos.html',
  // Fora do fluxo, mas não `display: none`: senão as texturas deixam de valer nos outros SVG.
  styles: ':host { position: absolute; width: 0; height: 0; overflow: hidden; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapaSimbolos {}

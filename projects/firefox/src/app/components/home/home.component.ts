import { Component, inject } from '@angular/core';
import { Router, RouterModule, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterOutlet, RouterModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  readonly #router = inject(Router);

  onWalletTab() {
    if (this.#router.url.startsWith('/home/wallet')) {
      window.dispatchEvent(new CustomEvent('wallet-reset'));
    }
  }
}

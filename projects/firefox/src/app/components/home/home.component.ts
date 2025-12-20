import { Component, inject } from '@angular/core';
import { Router, RouterModule, RouterOutlet } from '@angular/router';
import { LoggerService, StorageService } from '@common';

@Component({
  selector: 'app-home',
  imports: [RouterOutlet, RouterModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  readonly #storage = inject(StorageService);
  readonly #router = inject(Router);
  readonly #logger = inject(LoggerService);

  async onClickLock() {
    this.#logger.logVaultLock();
    await this.#storage.lockVault();
    this.#router.navigateByUrl('/vault-login');
  }
}

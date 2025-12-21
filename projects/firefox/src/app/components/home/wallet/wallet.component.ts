import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LoggerService, StorageService } from '@common';

@Component({
  selector: 'app-wallet',
  templateUrl: './wallet.component.html',
  styleUrl: './wallet.component.scss',
  imports: [],
})
export class WalletComponent {
  readonly #logger = inject(LoggerService);
  readonly #storage = inject(StorageService);
  readonly #router = inject(Router);

  async onClickLock() {
    this.#logger.logVaultLock();
    await this.#storage.lockVault();
    this.#router.navigateByUrl('/vault-login');
  }
}

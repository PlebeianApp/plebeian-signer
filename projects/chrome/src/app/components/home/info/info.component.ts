import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LoggerService, StorageService } from '@common';
import packageJson from '../../../../../../../package.json';

@Component({
  selector: 'app-info',
  templateUrl: './info.component.html',
  styleUrl: './info.component.scss',
})
export class InfoComponent {
  readonly #logger = inject(LoggerService);
  readonly #storage = inject(StorageService);
  readonly #router = inject(Router);

  version = packageJson.custom.chrome.version;

  async onClickLock() {
    this.#logger.logVaultLock();
    await this.#storage.lockVault();
    this.#router.navigateByUrl('/vault-login');
  }
}

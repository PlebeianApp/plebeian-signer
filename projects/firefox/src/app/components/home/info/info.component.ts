import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LoggerService, NavComponent } from '@common';
import packageJson from '../../../../../../../package.json';

@Component({
  selector: 'app-info',
  templateUrl: './info.component.html',
  styleUrl: './info.component.scss',
})
export class InfoComponent extends NavComponent {
  readonly #logger = inject(LoggerService);
  readonly #router = inject(Router);

  version = packageJson.custom.firefox.version;

  async onClickLock() {
    this.#logger.logVaultLock();
    await this.storage.lockVault();
    this.#router.navigateByUrl('/vault-login');
  }
}

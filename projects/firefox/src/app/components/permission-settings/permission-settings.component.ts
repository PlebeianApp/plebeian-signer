import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  NavComponent,
  PermissionLevel,
  StorageService,
} from '@common';

@Component({
  selector: 'app-permission-settings',
  templateUrl: './permission-settings.component.html',
  styleUrl: './permission-settings.component.scss',
})
export class PermissionSettingsComponent extends NavComponent {
  override readonly storage = inject(StorageService);
  readonly #router = inject(Router);

  readonly levels: { value: PermissionLevel; label: string; description: string }[] = [
    {
      value: 'cautious',
      label: 'Always Ask',
      description: 'Every request prompts for approval. Decisions are never remembered.',
    },
    {
      value: 'session',
      label: 'Remember for Session',
      description: 'Approved requests are remembered until the browser restarts.',
    },
    {
      value: 'forever',
      label: 'Remember Forever',
      description: 'Approved requests are stored permanently in the vault.',
    },
    {
      value: 'reckless',
      label: 'Auto-Approve',
      description: 'All requests are approved without prompting. Use with caution.',
    },
  ];

  get currentLevel(): PermissionLevel {
    return this.storage.getSignerMetaHandler().getPermissionLevel();
  }

  async onSelectLevel(level: PermissionLevel) {
    await this.storage.getSignerMetaHandler().setPermissionLevel(level);
  }

  onClickWhitelistedApps() {
    this.#router.navigateByUrl('/whitelisted-apps');
  }

  onClickBack() {
    this.#router.navigateByUrl('/home/identities');
  }
}

import { Component, inject, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { LoggerService, StartupService } from '@common';
import { filter } from 'rxjs';
import { getNewStorageServiceConfig } from './common/data/get-new-storage-service-config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  readonly #startup = inject(StartupService);
  readonly #logger = inject(LoggerService);
  readonly #router = inject(Router);

  ngOnInit(): void {
    this.#logger.initialize('Plebeian Signer Firefox Extension');

    this.#router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const url = e.urlAfterRedirects;
        if (url.startsWith('/home/') || url.startsWith('/edit-identity/') ||
            url.startsWith('/new-identity') || url.startsWith('/whitelisted-apps') ||
            url.startsWith('/profile-edit')) {
          chrome.storage.session.set({ lastPopupRoute: url }).catch(() => { /* noop */ });
        }
      });

    this.#startup.startOver(getNewStorageServiceConfig());
  }
}

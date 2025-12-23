import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { LoggerService, LogEntry, NavComponent } from '@common';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-logs',
  templateUrl: './logs.component.html',
  styleUrl: './logs.component.scss',
  imports: [DatePipe],
})
export class LogsComponent extends NavComponent implements OnInit {
  readonly #logger = inject(LoggerService);
  readonly #router = inject(Router);

  get logs(): LogEntry[] {
    return this.#logger.logs;
  }

  ngOnInit() {
    // Refresh logs from storage to get background script logs
    this.#logger.refreshLogs();
  }

  async onRefresh() {
    await this.#logger.refreshLogs();
  }

  async onClear() {
    await this.#logger.clear();
  }

  getLevelClass(level: LogEntry['level']): string {
    switch (level) {
      case 'error':
        return 'log-error';
      case 'warn':
        return 'log-warn';
      case 'debug':
        return 'log-debug';
      default:
        return 'log-info';
    }
  }

  async onClickLock() {
    this.#logger.logVaultLock();
    await this.storage.lockVault();
    this.#router.navigateByUrl('/vault-login');
  }
}

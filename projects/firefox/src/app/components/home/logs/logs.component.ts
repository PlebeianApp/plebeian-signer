import { Component, inject } from '@angular/core';
import { LoggerService, LogEntry } from '@common';
import { DatePipe, JsonPipe } from '@angular/common';

@Component({
  selector: 'app-logs',
  templateUrl: './logs.component.html',
  styleUrl: './logs.component.scss',
  imports: [DatePipe, JsonPipe],
})
export class LogsComponent {
  readonly #logger = inject(LoggerService);

  get logs(): LogEntry[] {
    return this.#logger.logs;
  }

  onClear() {
    this.#logger.clear();
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
}

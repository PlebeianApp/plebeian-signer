/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@angular/core';

export interface LogEntry {
  timestamp: Date;
  level: 'log' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

@Injectable({
  providedIn: 'root',
})
export class LoggerService {
  #namespace: string | undefined;
  #logs: LogEntry[] = [];
  #maxLogs = 500;

  get logs(): LogEntry[] {
    return this.#logs;
  }

  initialize(namespace: string): void {
    this.#namespace = namespace;
  }

  log(value: any, data?: any) {
    this.#assureInitialized();
    this.#addLog('log', value, data);
    const nowString = new Date().toLocaleString();
    console.log(`[${this.#namespace} - ${nowString}]`, JSON.stringify(value));
  }

  warn(value: any, data?: any) {
    this.#assureInitialized();
    this.#addLog('warn', value, data);
    const nowString = new Date().toLocaleString();
    console.warn(`[${this.#namespace} - ${nowString}]`, JSON.stringify(value));
  }

  error(value: any, data?: any) {
    this.#assureInitialized();
    this.#addLog('error', value, data);
    const nowString = new Date().toLocaleString();
    console.error(`[${this.#namespace} - ${nowString}]`, JSON.stringify(value));
  }

  debug(value: any, data?: any) {
    this.#assureInitialized();
    this.#addLog('debug', value, data);
    const nowString = new Date().toLocaleString();
    console.debug(`[${this.#namespace} - ${nowString}]`, JSON.stringify(value));
  }

  clear() {
    this.#logs = [];
  }

  #addLog(level: LogEntry['level'], message: any, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      data,
    };
    this.#logs.unshift(entry);

    // Limit stored logs
    if (this.#logs.length > this.#maxLogs) {
      this.#logs.pop();
    }
  }

  #assureInitialized() {
    if (!this.#namespace) {
      throw new Error(
        'LoggerService not initialized. Please call initialize(..) first.'
      );
    }
  }
}

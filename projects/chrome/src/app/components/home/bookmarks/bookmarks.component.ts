import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Bookmark, LoggerService, NavComponent, SignerMetaData } from '@common';
import { ChromeMetaHandler } from '../../../common/data/chrome-meta-handler';

@Component({
  selector: 'app-bookmarks',
  templateUrl: './bookmarks.component.html',
  styleUrl: './bookmarks.component.scss',
  imports: [],
})
export class BookmarksComponent extends NavComponent implements OnInit {
  readonly #logger = inject(LoggerService);
  readonly #metaHandler = new ChromeMetaHandler();
  readonly #router = inject(Router);

  bookmarks: Bookmark[] = [];
  isLoading = true;

  readonly #defaultBookmarks: { title: string; url: string }[] = [
    { title: 'Plebeian Market', url: 'https://plebeian.market/' },
    { title: 'YakiHonne', url: 'https://yakihonne.com/' },
    { title: 'Primal', url: 'https://primal.net/' },
    { title: 'HiveTalk', url: 'https://hivetalk.org/' },
    { title: 'Shakespeare', url: 'https://shakespeare.diy/' },
  ];

  async ngOnInit() {
    await this.loadBookmarks();
  }

  async loadBookmarks() {
    this.isLoading = true;
    try {
      const metaData = await this.#metaHandler.loadFullData() as SignerMetaData;
      this.#metaHandler.setFullData(metaData);
      this.bookmarks = this.#metaHandler.getBookmarks();
      await this.ensureDefaultBookmarks();
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async ensureDefaultBookmarks() {
    const normalize = (url: string) => url.replace(/\/$/, '');
    const existing = new Set(this.bookmarks.map((b) => normalize(b.url)));

    const missing: Bookmark[] = this.#defaultBookmarks
      .filter((b) => !existing.has(normalize(b.url)))
      .map((b) => ({
        id: crypto.randomUUID(),
        url: b.url,
        title: b.title,
        createdAt: Date.now(),
      }));

    if (missing.length === 0) {
      return;
    }

    this.bookmarks = [...missing, ...this.bookmarks];
    await this.saveBookmarks();
  }

  async onBookmarkThisPage() {
    try {
      // Get the current tab URL and title
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !tab?.title) {
        console.error('Could not get current tab info');
        return;
      }

      // Check if already bookmarked
      if (this.bookmarks.some(b => b.url === tab.url)) {
        console.log('Page already bookmarked');
        return;
      }

      const newBookmark: Bookmark = {
        id: crypto.randomUUID(),
        url: tab.url,
        title: tab.title,
        createdAt: Date.now(),
      };

      this.bookmarks = [newBookmark, ...this.bookmarks];
      await this.saveBookmarks();
      this.#logger.logBookmarkAdded(newBookmark.url, newBookmark.title);
    } catch (error) {
      console.error('Failed to bookmark page:', error);
    }
  }

  async onRemoveBookmark(bookmark: Bookmark) {
    this.bookmarks = this.bookmarks.filter(b => b.id !== bookmark.id);
    await this.saveBookmarks();
    this.#logger.logBookmarkRemoved(bookmark.url, bookmark.title);
  }

  async saveBookmarks() {
    try {
      await this.#metaHandler.setBookmarks(this.bookmarks);
    } catch (error) {
      console.error('Failed to save bookmarks:', error);
    }
  }

  openBookmark(bookmark: Bookmark) {
    chrome.tabs.create({ url: bookmark.url });
  }

  getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  async onClickLock() {
    this.#logger.logVaultLock();
    await this.storage.lockVault();
    this.#router.navigateByUrl('/vault-login');
  }
}

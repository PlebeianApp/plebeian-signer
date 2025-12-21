import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Bookmark, LoggerService, SignerMetaData, StorageService } from '@common';
import { FirefoxMetaHandler } from '../../../common/data/firefox-meta-handler';
import browser from 'webextension-polyfill';

@Component({
  selector: 'app-bookmarks',
  templateUrl: './bookmarks.component.html',
  styleUrl: './bookmarks.component.scss',
  imports: [],
})
export class BookmarksComponent implements OnInit {
  readonly #logger = inject(LoggerService);
  readonly #metaHandler = new FirefoxMetaHandler();
  readonly #storage = inject(StorageService);
  readonly #router = inject(Router);

  bookmarks: Bookmark[] = [];
  isLoading = true;

  async ngOnInit() {
    await this.loadBookmarks();
  }

  async loadBookmarks() {
    this.isLoading = true;
    try {
      const metaData = await this.#metaHandler.loadFullData() as SignerMetaData;
      this.#metaHandler.setFullData(metaData);
      this.bookmarks = this.#metaHandler.getBookmarks();
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async onBookmarkThisPage() {
    try {
      // Get the current tab URL and title
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
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
    browser.tabs.create({ url: bookmark.url });
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
    await this.#storage.lockVault();
    this.#router.navigateByUrl('/vault-login');
  }
}

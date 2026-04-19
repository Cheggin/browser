import { ipcMain, BrowserWindow } from 'electron';
import { mainLogger } from '../logger';
import { listChromeProfiles } from './ChromeProfileReader';
import { importChromeCookes } from './ChromeCookieImporter';
import { readChromeBookmarks } from './ChromeBookmarkImporter';
import type { ChromeProfile } from './ChromeProfileReader';

export interface ChromeImportResult {
  cookies: { imported: number; failed: number; total: number };
  bookmarks: { imported: number; folders: number };
}

export function registerChromeImportHandlers(onboardingWindow: BrowserWindow): void {
  mainLogger.info('chromeImport.registerHandlers');

  ipcMain.handle('chrome-import:list-profiles', (): ChromeProfile[] => {
    mainLogger.info('chromeImport.listProfiles');
    return listChromeProfiles();
  });

  ipcMain.handle('chrome-import:run', async (_event, profilePath: string): Promise<ChromeImportResult> => {
    mainLogger.info('chromeImport.run', { profilePath });

    const sendProgress = (phase: string, current: number, total: number) => {
      if (!onboardingWindow.isDestroyed()) {
        onboardingWindow.webContents.send('chrome-import:progress', { phase, current, total });
      }
    };

    // Import cookies
    let cookieResult = { imported: 0, failed: 0, total: 0 };
    try {
      cookieResult = await importChromeCookes(profilePath, (imported, total) => {
        sendProgress('cookies', imported, total);
      });
    } catch (err) {
      mainLogger.error('chromeImport.run.cookiesFailed', {
        error: (err as Error).message,
      });
    }

    // Import bookmarks
    let bookmarkResult = { imported: 0, folders: 0 };
    try {
      const { bookmarks, folders } = readChromeBookmarks(profilePath);
      bookmarkResult = { imported: bookmarks.length, folders };
      sendProgress('bookmarks', bookmarks.length, bookmarks.length);
    } catch (err) {
      mainLogger.error('chromeImport.run.bookmarksFailed', {
        error: (err as Error).message,
      });
    }

    const result: ChromeImportResult = {
      cookies: cookieResult,
      bookmarks: bookmarkResult,
    };

    mainLogger.info('chromeImport.run.complete', {
      cookiesImported: cookieResult.imported,
      bookmarksImported: bookmarkResult.imported,
    });

    return result;
  });
}

export function unregisterChromeImportHandlers(): void {
  ipcMain.removeHandler('chrome-import:list-profiles');
  ipcMain.removeHandler('chrome-import:run');
  mainLogger.info('chromeImport.handlersUnregistered');
}

import { ipcMain, BrowserWindow } from 'electron';
import { mainLogger } from '../logger';
import { listChromeProfiles } from './ChromeProfileReader';
import { importChromeCookes } from './ChromeCookieImporter';
import type { ChromeProfile } from './ChromeProfileReader';
import type { ChromeImportResult } from './ChromeCookieImporter';

export function registerChromeImportHandlers(onboardingWindow: BrowserWindow): void {
  mainLogger.info('chromeImport.registerHandlers');

  ipcMain.handle('chrome-import:list-profiles', (): ChromeProfile[] => {
    mainLogger.info('chromeImport.listProfiles');
    return listChromeProfiles();
  });

  ipcMain.handle('chrome-import:run', async (_event, profile: ChromeProfile): Promise<ChromeImportResult> => {
    mainLogger.info('chromeImport.run', {
      browserName: profile.browserName,
      profilePath: profile.profilePath,
    });

    const sendProgress = (phase: string, current: number, total: number) => {
      if (!onboardingWindow.isDestroyed()) {
        onboardingWindow.webContents.send('chrome-import:progress', { phase, current, total });
      }
    };

    try {
      const result = await importChromeCookes(profile.browserPath, profile.profilePath, (imported, total) => {
        sendProgress('cookies', imported, total);
      });
      sendProgress('bookmarks', result.bookmarks.imported, result.bookmarks.imported);
      mainLogger.info('chromeImport.run.complete', {
        browserName: profile.browserName,
        cookiesImported: result.cookies.imported,
        bookmarksImported: result.bookmarks.imported,
      });
      return result;
    } catch (err) {
      mainLogger.error('chromeImport.run.failed', {
        browserName: profile.browserName,
        error: (err as Error).message,
      });
      throw err;
    }
  });
}

export function unregisterChromeImportHandlers(): void {
  ipcMain.removeHandler('chrome-import:list-profiles');
  ipcMain.removeHandler('chrome-import:run');
  mainLogger.info('chromeImport.handlersUnregistered');
}

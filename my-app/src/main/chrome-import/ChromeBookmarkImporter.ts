import fs from 'node:fs';
import path from 'node:path';
import { mainLogger } from '../logger';

export interface ImportedBookmark {
  name: string;
  url: string;
  dateAdded: number;
}

export interface BookmarkImportResult {
  imported: number;
  folders: number;
}

interface ChromeBookmarkNode {
  type: 'url' | 'folder';
  name: string;
  url?: string;
  date_added?: string;
  children?: ChromeBookmarkNode[];
}

interface ChromeBookmarksFile {
  roots: {
    bookmark_bar: ChromeBookmarkNode;
    other: ChromeBookmarkNode;
    synced: ChromeBookmarkNode;
  };
}

function flattenBookmarks(node: ChromeBookmarkNode, results: ImportedBookmark[]): number {
  let folders = 0;

  if (node.type === 'url' && node.url) {
    results.push({
      name: node.name,
      url: node.url,
      dateAdded: node.date_added ? Math.floor(parseInt(node.date_added, 10) / 1000) : Date.now(),
    });
  } else if (node.type === 'folder') {
    folders++;
  }

  if (node.children) {
    for (const child of node.children) {
      folders += flattenBookmarks(child, results);
    }
  }

  return folders;
}

export function readChromeBookmarks(profilePath: string): {
  bookmarks: ImportedBookmark[];
  folders: number;
} {
  const bookmarksPath = path.join(profilePath, 'Bookmarks');

  if (!fs.existsSync(bookmarksPath)) {
    mainLogger.info('ChromeBookmarkImporter.noBookmarksFile', { profilePath });
    return { bookmarks: [], folders: 0 };
  }

  let data: ChromeBookmarksFile;
  try {
    data = JSON.parse(fs.readFileSync(bookmarksPath, 'utf-8'));
  } catch (err) {
    mainLogger.error('ChromeBookmarkImporter.parseError', {
      error: (err as Error).message,
    });
    return { bookmarks: [], folders: 0 };
  }

  const bookmarks: ImportedBookmark[] = [];
  let folders = 0;

  if (data.roots.bookmark_bar) {
    folders += flattenBookmarks(data.roots.bookmark_bar, bookmarks);
  }
  if (data.roots.other) {
    folders += flattenBookmarks(data.roots.other, bookmarks);
  }
  if (data.roots.synced) {
    folders += flattenBookmarks(data.roots.synced, bookmarks);
  }

  mainLogger.info('ChromeBookmarkImporter.read', {
    bookmarkCount: bookmarks.length,
    folderCount: folders,
  });

  return { bookmarks, folders };
}

import fs from 'node:fs';
import path from 'node:path';

/**
 * For local non-packaged runs, Vite's built renderer HTML under dist/ uses
 * absolute /assets/... URLs. Under file:// those module scripts can fail MIME
 * checks in Electron. Build a sibling HTML file with the referenced CSS/JS
 * inlined so the renderer can boot without a dev server.
 */
export function getLocalRendererHtmlPath(subdir: string, fileName: string): string | null {
  const distHtmlPath = path.join(
    __dirname,
    '../../dist/src/renderer',
    subdir,
    fileName,
  );

  if (!fs.existsSync(distHtmlPath)) {
    return null;
  }

  const localHtmlPath = path.join(
    path.dirname(distHtmlPath),
    fileName.replace(/\.html$/, '.local.html'),
  );

  const raw = fs.readFileSync(distHtmlPath, 'utf-8');
  const assetsDir = path.join(__dirname, '../../dist/assets');

  const rewritten = raw
    .replace(
      /<link[^>]+href="\/assets\/([^"]+)"[^>]*>/g,
      (_match, assetName: string) => {
        const cssPath = path.join(assetsDir, assetName);
        if (!fs.existsSync(cssPath)) return '';
        const css = fs.readFileSync(cssPath, 'utf-8');
        return `<style>\n${css}\n</style>`;
      },
    )
    .replace(
      /<script type="module" crossorigin src="\/assets\/([^"]+)"><\/script>/g,
      (_match, assetName: string) => {
        const jsPath = path.join(assetsDir, assetName);
        if (!fs.existsSync(jsPath)) return '';
        const js = fs.readFileSync(jsPath, 'utf-8');
        return `<script type="module">\n${js}\n</script>`;
      },
    );

  fs.writeFileSync(localHtmlPath, rewritten, 'utf-8');
  return localHtmlPath;
}

export async function isRendererDevUrlReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

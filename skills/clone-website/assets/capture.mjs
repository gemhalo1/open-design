#!/usr/bin/env node
// capture.mjs — pixel-level snapshot of any URL into a self-contained, editable index.html
//
// Default mode renders the page in headless Chromium (so SPAs that paint client-side
// are captured the way a human sees them), inlines stylesheets, base64-inlines images,
// drops <script> (a static snapshot must not re-run hydration that would wipe the DOM),
// and injects <base href> so any asset we did not inline still resolves over the network.
//
// Static mode (--static) skips the browser entirely and pulls the raw HTML + assets with
// Node fetch. Use it as a fallback when Chromium / Playwright is unavailable, or when you
// already know the target is server-rendered.
//
//   node capture.mjs <url> [options]
//     --out <file>          output HTML path        (default: index.html)
//     --shot <file>         full-page screenshot     (default: reference.png; rendered mode only)
//     --static              skip the browser, fetch raw HTML only
//     --keep-scripts        keep <script> tags (rarely wanted; risks re-render/redirect)
//     --max-asset-kb <n>    skip inlining assets larger than n KB (default: 512)
//     --wait-ms <n>         extra settle time after network idle (default: 1200)
//     --viewport <w>x<h>    rendered viewport        (default: 1440x900)

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);

if (!url) {
  console.error('usage: node capture.mjs <url> [--out index.html] [--static] [--shot reference.png]');
  process.exit(2);
}

const OUT = opt('out', 'index.html');
const SHOT = opt('shot', 'reference.png');
const MAX_ASSET = Number(opt('max-asset-kb', '512')) * 1024;
const WAIT_MS = Number(opt('wait-ms', '1200'));
const [VPW, VPH] = opt('viewport', '1440x900').split('x').map(Number);
const KEEP_SCRIPTS = flag('keep-scripts');
const STATIC = flag('static');

const origin = new URL(url).origin;
const abs = (href) => {
  try { return new URL(href, url).href; } catch { return href; }
};

// Fetch a binary asset and return a data: URI, or null on failure / oversize.
async function inlineAsset(assetUrl) {
  try {
    const res = await fetch(assetUrl, { redirect: 'follow' });
    if (!res.ok) return null;
    const type = res.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_ASSET) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

// Replace every absolute asset URL in `html` (img src/srcset + url(...) in inline CSS we
// already inlined) with a base64 data URI. Best-effort: anything that fails stays as a
// network URL and still loads thanks to <base href>.
async function inlineImages(html, urls) {
  const unique = [...new Set(urls)].filter((u) => /^https?:/.test(u));
  const map = new Map();
  const limit = 8;
  for (let i = 0; i < unique.length; i += limit) {
    const batch = unique.slice(i, i + limit);
    const dataUris = await Promise.all(batch.map(inlineAsset));
    batch.forEach((u, j) => dataUris[j] && map.set(u, dataUris[j]));
  }
  for (const [u, data] of map) {
    html = html.split(u).join(data);
  }
  return { html, inlined: map.size, total: unique.length };
}

function finalizeHtml(html) {
  // Guarantee a <base href> so non-inlined relative assets resolve against the origin.
  if (!/<base\s/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n  <base href="${origin}/">`);
  }
  const banner = `<!-- cloned from ${url} via clone-website skill — static snapshot, edit freely -->\n`;
  return banner + html;
}

async function runStatic() {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 clone-website' } });
  let html = await res.text();
  // Pull <img src> + srcset targets to absolute, then inline.
  const imgUrls = [];
  html = html.replace(/\b(src|href)=(["'])(.*?)\2/gi, (m, attr, q, val) => {
    if (attr === 'src' && /\.(png|jpe?g|gif|webp|svg|avif|ico)(\?|$)/i.test(val)) {
      const a = abs(val); imgUrls.push(a); return `${attr}=${q}${a}${q}`;
    }
    return m;
  });
  const { html: inlined, inlined: n, total } = await inlineImages(html, imgUrls);
  if (!KEEP_SCRIPTS) html = stripScripts(inlined); else html = inlined;
  await (await import('node:fs/promises')).writeFile(OUT, finalizeHtml(html), 'utf8');
  console.log(`[static] wrote ${OUT} (${n}/${total} assets inlined)`);
}

function stripScripts(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<script\b[^>]*\/>/gi, '');
}

async function runRendered() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    try { ({ chromium } = await import('playwright-core')); } catch {
      console.error('[rendered] Playwright not found. Install it or use --static.');
      console.error('  npm i -D playwright && npx playwright install chromium');
      process.exit(3);
    }
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: VPW || 1440, height: VPH || 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 clone-website',
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});

  // Trigger lazy-loaded content: scroll to the bottom in steps, then back to top.
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let y = 0;
      const step = () => {
        window.scrollTo(0, y);
        y += window.innerHeight;
        if (y < document.body.scrollHeight) setTimeout(step, 120);
        else { window.scrollTo(0, 0); resolve(); }
      };
      step();
    });
  });
  await page.waitForTimeout(WAIT_MS);

  if (SHOT) await page.screenshot({ path: SHOT, fullPage: true }).catch(() => {});

  // In-page: inline cross-origin stylesheets, absolutize img src/srcset, collect asset URLs.
  const { html, imgUrls } = await page.evaluate(async () => {
    const toAbs = (h, base) => { try { return new URL(h, base || location.href).href; } catch { return h; } };

    // CSS url(...) and @import resolve relative to the STYLESHEET's location, not the
    // document. Once a sheet is inlined into a <style>, that base is lost — fonts and
    // background-images would 404 and the page falls back to system fonts (wrong sizes,
    // wrong weights). Rewrite every relative reference to an absolute URL against the
    // sheet's own href before inlining.
    const absolutizeCss = (css, baseHref) => {
      css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) =>
        /^(data:|https?:|blob:|#)/i.test(u) ? m : `url(${q}${toAbs(u, baseHref)}${q})`);
      css = css.replace(/@import\s+(['"])([^'"]+)\1/g, (m, q, u) =>
        /^(data:|https?:)/i.test(u) ? m : `@import ${q}${toAbs(u, baseHref)}${q}`);
      return css;
    };

    // Replace each <link rel=stylesheet> with a <style> holding its (url-rewritten) rules.
    for (const link of [...document.querySelectorAll('link[rel~="stylesheet"]')]) {
      try {
        let cssText = '';
        const baseHref = link.href || location.href;
        const sheet = [...document.styleSheets].find((s) => s.href === link.href);
        if (sheet) {
          try { cssText = [...sheet.cssRules].map((r) => r.cssText).join('\n'); } catch { cssText = ''; }
        }
        if (!cssText && link.href) {
          const res = await fetch(link.href).catch(() => null);
          if (res && res.ok) cssText = await res.text();
        }
        if (cssText) {
          const style = document.createElement('style');
          style.textContent = absolutizeCss(cssText, baseHref);
          link.replaceWith(style);
        } else if (link.href) {
          link.setAttribute('href', link.href); // pin the surviving link to an absolute URL
        }
      } catch { /* leave the link; <base> keeps it loading */ }
    }

    // CSS-in-JS (styled-components, emotion, …) injects rules straight into the CSSOM via
    // insertRule, leaving the <style> tag's text node EMPTY — so a raw outerHTML snapshot
    // loses every one of those rules and the page collapses to default sizing. Re-serialize
    // each live sheet's cssRules back into its <style> text. This is what fixes "fonts load
    // but sizes are wrong" on styled-components sites.
    for (const styleEl of [...document.querySelectorAll('style')]) {
      try {
        const sheet = styleEl.sheet;
        if (!sheet) continue;
        let rules; try { rules = [...sheet.cssRules]; } catch { continue; }
        if (!rules.length) continue;
        const serialized = rules.map((r) => r.cssText).join('\n');
        if (serialized.length > (styleEl.textContent || '').length) {
          styleEl.textContent = absolutizeCss(serialized, location.href);
        }
      } catch { /* keep whatever text the tag already had */ }
    }

    // Constructable stylesheets (document.adoptedStyleSheets) live in no <style> at all —
    // materialize them into appended <style> tags so they survive serialization.
    try {
      for (const sheet of document.adoptedStyleSheets || []) {
        let rules; try { rules = [...sheet.cssRules]; } catch { continue; }
        if (!rules.length) continue;
        const s = document.createElement('style');
        s.setAttribute('data-adopted', '');
        s.textContent = absolutizeCss(rules.map((r) => r.cssText).join('\n'), location.href);
        document.head.appendChild(s);
      }
    } catch { /* adoptedStyleSheets unsupported or blocked */ }

    // Absolutize image URLs so Node can fetch + inline them afterwards.
    const imgUrls = [];
    for (const img of [...document.querySelectorAll('img')]) {
      if (img.getAttribute('src')) { const a = toAbs(img.getAttribute('src')); img.setAttribute('src', a); imgUrls.push(a); }
      img.removeAttribute('srcset'); // collapse responsive sets onto the resolved src
      img.removeAttribute('loading');
    }
    return { html: '<!doctype html>\n' + document.documentElement.outerHTML, imgUrls };
  });

  await browser.close();

  let out = KEEP_SCRIPTS ? html : stripScripts(html);
  const { html: inlined, inlined: n, total } = await inlineImages(out, imgUrls);
  await (await import('node:fs/promises')).writeFile(OUT, finalizeHtml(inlined), 'utf8');
  console.log(`[rendered] wrote ${OUT} (${n}/${total} images inlined)${SHOT ? `, screenshot ${SHOT}` : ''}`);
}

(STATIC ? runStatic() : runRendered()).catch((err) => {
  console.error('[capture] failed:', err?.message || err);
  process.exit(1);
});

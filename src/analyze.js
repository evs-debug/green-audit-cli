const puppeteer = require('puppeteer');

async function analyzePage(url) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const resources = [];
  page.on('response', async (response) => {
    try {
      const request = response.request();
      const headers = response.headers();
      let size = headers['content-length'] ? parseInt(headers['content-length'], 10) : 0;
      if (!size) {
        try {
          const buffer = await response.buffer();
          size = buffer.length;
        } catch (e) { size = 0; }
      }
      resources.push({ url: request.url(), type: request.resourceType(), size });
    } catch (e) {}
  });

  const start = Date.now();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  const loadTime = Date.now() - start;

  const domNodeCount = await page.evaluate(() => document.querySelectorAll('*').length);
  const metrics = await page.metrics();

  await browser.close();

  const totalBytes = resources.reduce((sum, r) => sum + r.size, 0);
  const scriptBytes = resources.filter(r => r.type === 'script').reduce((sum, r) => sum + r.size, 0);
  const imageBytes = resources.filter(r => r.type === 'image').reduce((sum, r) => sum + r.size, 0);
  const topResources = [...resources].sort((a, b) => b.size - a.size).slice(0, 5);

  return {
    url, loadTime, totalBytes, scriptBytes, imageBytes, domNodeCount,
    scriptDuration: metrics.ScriptDuration || 0,
    jsHeapUsed: metrics.JSHeapUsedSize || 0,
    topResources, resourceCount: resources.length
  };
}

module.exports = { analyzePage };

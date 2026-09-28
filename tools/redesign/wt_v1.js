const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=ko-KR'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto('http://localhost:8777/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise(r => setTimeout(r, 6000));
  await p.screenshot({ path: 'shots/walkthrough/v1_00_first_view.png' });
  const info = await p.evaluate(() => [...document.querySelectorAll('button')].filter(b => /제단|고급|턴 피해|확률|체력/.test(b.textContent)).map(b => b.textContent.trim().slice(0,30) + ' y=' + ((b.getBoundingClientRect().y + scrollY)|0) + ' x=' + (b.getBoundingClientRect().x|0)));
  console.log(info.join('\n'));
  const lbl = await p.evaluate(() => [...document.querySelectorAll('label,span')].filter(b => /확률 100|체력 10|턴 피해/.test(b.textContent) && b.textContent.length < 30).map(b => b.textContent.trim() + ' y=' + ((b.getBoundingClientRect().y + scrollY)|0)));
  console.log(lbl.join('\n'));
  await b.close();
})();

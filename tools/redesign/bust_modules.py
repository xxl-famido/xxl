"""배포 빌드용 캐시 버스팅: <out>/src/**/*.js 의 모든 '....js' · '....css' 지정자와 index/lounge.html 의 진입 모듈·로컬 스타일시트에 ?v=<버전>.
같은 쿼리를 모든 지정자에 붙이므로 모듈 동일성은 유지된다.  python bust_modules.py <out> <version>

스타일시트도 버전을 붙인다 — GitHub Pages 는 모든 파일을 10분(max-age=600) 캐시하므로, 버전 없는 css/*.css 는
배포 직후 새 JS 와 옛 CSS 가 섞여 화면이 깨졌다(2026-09-30 v2.0.2: 새 칸 모양·메뉴 줄 스타일이 옛 plan.css 로 그려짐).
ensureStyle('css/plan.css') 같은 JS 문자열과 index/lounge.html 의 <link href="app.css"> 가 대상이고 CDN(https:) 은 제외."""
import re, sys, pathlib
out, ver = pathlib.Path(sys.argv[1]), re.sub(r'[^0-9A-Za-z]', '', sys.argv[2])
pat = re.compile(r'\.(js|css)(["\'`])')
n = 0
for f in (out / 'src').rglob('*.js'):
    s = f.read_text(encoding='utf-8'); t = pat.sub(lambda m: f'.{m.group(1)}?v={ver}{m.group(2)}', s)
    if t != s: f.write_text(t, encoding='utf-8'); n += 1
for name in ('index.html', 'lounge.html'):
    f = out / name
    if f.exists():
        s = f.read_text(encoding='utf-8')
        s = re.sub(r'(src/(?:lounge/)?main\.js)(")', rf'\1?v={ver}\2', s)
        s = re.sub(r'(href="(?!https?:)[^"]+\.css)(")', rf'\1?v={ver}\2', s)
        f.write_text(s, encoding='utf-8')
print(f'modules·styles: ?v={ver} ({n} files)')

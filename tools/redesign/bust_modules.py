"""배포 빌드용 ES 모듈 캐시 버스팅: <out>/src/**/*.js 의 모든 '....js' 지정자와 index/lounge.html 의 진입 모듈에 ?v=<버전>.
같은 쿼리를 모든 지정자에 붙이므로 모듈 동일성은 유지된다.  python bust_modules.py <out> <version>"""
import re, sys, pathlib
out, ver = pathlib.Path(sys.argv[1]), re.sub(r'[^0-9A-Za-z]', '', sys.argv[2])
pat = re.compile(r'\.js(["\'`])')
n = 0
for f in (out / 'src').rglob('*.js'):
    s = f.read_text(encoding='utf-8'); t = pat.sub(lambda m: f'.js?v={ver}{m.group(1)}', s)
    if t != s: f.write_text(t, encoding='utf-8'); n += 1
for name in ('index.html', 'lounge.html'):
    f = out / name
    if f.exists():
        s = f.read_text(encoding='utf-8')
        f.write_text(re.sub(r'(src/(?:lounge/)?main\.js)(")', rf'\1?v={ver}\2', s), encoding='utf-8')
print(f'modules: ?v={ver} ({n} files)')

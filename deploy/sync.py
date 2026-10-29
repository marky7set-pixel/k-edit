"""Make the repo exactly the K-Edit source in one zip (from a temporary link, checked by sha256): new files in, changed files updated, old files gone."""
import hashlib, io, json, os, subprocess, sys, urllib.request, zipfile

cfg = json.load(open('deploy/src.json'))
done = open('deploy/applied.txt').read().strip() if os.path.exists('deploy/applied.txt') else ''
if cfg['sha256'] == done:
    print('source already applied:', cfg.get('file')); sys.exit(0)
req = urllib.request.Request(cfg['url'], headers={'User-Agent': 'k-edit-ci'})
data = urllib.request.urlopen(req, timeout=180).read()
h = hashlib.sha256(data).hexdigest()
if h != cfg['sha256']:
    print('sha256 mismatch', h); sys.exit(1)
KEEP = ('.github/', 'deploy/')  # the build itself lives here and is never replaced from the zip
z = zipfile.ZipFile(io.BytesIO(data)); n = 0; names = set()
for name in z.namelist():
    if name.endswith('/') or name.startswith(KEEP):
        continue
    p = os.path.normpath(name)
    if p.startswith('..') or os.path.isabs(p):
        continue
    os.makedirs(os.path.dirname(p) or '.', exist_ok=True)
    with open(p, 'wb') as f: f.write(z.read(name))
    names.add(p.replace(os.sep, '/')); n += 1
tracked = subprocess.run(['git', 'ls-files'], capture_output=True, text=True, check=True).stdout.split('\n')
old = [f for f in tracked if f and not f.startswith(KEEP) and f not in names]
if n < 20 or len(old) > n:  # a broken zip never wipes the repo
    print('refusing to remove', len(old), 'files for a zip of', n); sys.exit(1)
for f in old: subprocess.run(['git', 'rm', '-q', '--', f], check=True)
print('removed', len(old), 'old files:', ' '.join(old[:40]))
open('deploy/applied.txt', 'w').write(h + '\n')
print('extracted', n, 'files from', cfg.get('file'))
run = lambda *a: subprocess.run(a, check=True)
run('git', 'config', 'user.name', 'k-edit-bot'); run('git', 'config', 'user.email', 'k-edit-bot@users.noreply.github.com')
run('git', 'add', '-A')
if subprocess.run(['git', 'diff', '--cached', '--quiet']).returncode:
    run('git', 'commit', '-q', '-m', 'K-Edit source ' + cfg.get('file', ''))
    run('git', 'push', '-q', 'origin', 'HEAD:main')

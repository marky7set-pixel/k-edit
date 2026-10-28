"""Download the official Real-ESRGAN general x4v3 weights (BSD-3-Clause) and turn them into ui/ai/x4v3.bin (float16) + x4v3.json.
Standard library only. Network: GitHub release of xinntao/Real-ESRGAN."""
import hashlib, io, json, os, pickle, struct, sys, urllib.request, zipfile
from array import array

URL = 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth'
SHA = '8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292'
OUT = os.path.join(os.path.dirname(__file__), '..', 'ui', 'ai')

class Storage:
    def __init__(self, dtype, key): self.dtype, self.key = dtype, key
class Tensor:
    def __init__(self, storage, offset, size, stride): self.storage, self.offset, self.size, self.stride = storage, offset, tuple(size), tuple(stride)

def rebuild(storage, offset, size, stride, *a, **k): return Tensor(storage, offset, size, stride)
class DtypeStub:
    def __init__(self, name): self.name = name
class Unp(pickle.Unpickler):
    def find_class(self, mod, name):
        if name in ('_rebuild_tensor_v2', '_rebuild_tensor'): return rebuild
        if mod == 'collections' and name == 'OrderedDict':
            import collections; return collections.OrderedDict
        if mod.startswith('torch') and name.endswith('Storage'): return DtypeStub(name)
        if mod == 'torch._utils' and name == '_rebuild_parameter': return lambda t, *a: t
        if mod.startswith('torch'): return DtypeStub(name)
        return super().find_class(mod, name)
    def persistent_load(self, pid):
        # ('storage', storage_type, key, location, numel)
        return Storage(pid[1].name if isinstance(pid[1], DtypeStub) else str(pid[1]), str(pid[2]))

def load_pth(raw):
    z = zipfile.ZipFile(io.BytesIO(raw))
    pkl = [n for n in z.namelist() if n.endswith('data.pkl')][0]
    root = pkl[:-len('data.pkl')]
    obj = Unp(io.BytesIO(z.read(pkl))).load()
    if isinstance(obj, dict) and ('params_ema' in obj or 'params' in obj): obj = obj.get('params_ema') or obj.get('params')
    out = {}
    for k, t in obj.items():
        if not isinstance(t, Tensor): continue
        if 'Float' not in t.storage.dtype and t.storage.dtype not in ('float', 'float32'): raise SystemExit('unexpected dtype ' + t.storage.dtype)
        data = z.read(root + 'data/' + t.storage.key)
        a = array('f'); a.frombytes(data)
        if sys.byteorder != 'little': a.byteswap()
        n = 1
        for s in t.size: n *= s
        # contiguous check
        exp, acc = [], 1
        for s in reversed(t.size): exp.insert(0, acc); acc *= s
        if tuple(exp) != t.stride and n > 1: raise SystemExit('non-contiguous ' + k)
        out[k] = (t.size, a[t.offset:t.offset + n])
    return out

def convert(sd):
    convs = sorted({int(k.split('.')[1]) for k in sd if k.startswith('body.') and k.endswith('.weight') and len(sd[k][0]) == 4})
    layers, blob = [], bytearray()
    for i, ci in enumerate(convs):
        ws, w = sd['body.%d.weight' % ci]; bs, b = sd['body.%d.bias' % ci]
        cout, cin = ws[0], ws[1]
        act = ('body.%d.weight' % (ci + 1)) in sd and len(sd['body.%d.weight' % (ci + 1)][0]) == 1
        al = sd['body.%d.weight' % (ci + 1)][1] if act else None
        layers.append({'cin': cin, 'cout': cout, 'act': 1 if act else 0})
        for arr in ([w, b] + ([al] if act else [])):
            blob += struct.pack('<%de' % len(arr), *arr)
    return layers, bytes(blob)

def main():
    os.makedirs(OUT, exist_ok=True)
    src = sys.argv[1] if len(sys.argv) > 1 else None
    if src and os.path.exists(src): raw = open(src, 'rb').read()
    else:
        raw = urllib.request.urlopen(urllib.request.Request(URL, headers={'User-Agent': 'k-edit-ci'}), timeout=180).read()
        h = hashlib.sha256(raw).hexdigest()
        if h != SHA: raise SystemExit('sha256 mismatch ' + h)
    sd = load_pth(raw)
    layers, blob = convert(sd)
    assert layers[0]['cin'] == 3 and layers[-1]['cout'] == 48 and len(layers) == 34, layers
    open(os.path.join(OUT, 'x4v3.bin'), 'wb').write(blob)
    json.dump({'name': 'realesr-general-x4v3', 'license': 'BSD-3-Clause (c) 2021 Xintao Wang', 'scale': 4, 'layers': layers}, open(os.path.join(OUT, 'x4v3.json'), 'w'))
    print('ai weights ok:', len(layers), 'layers,', len(blob), 'bytes')

if __name__ == '__main__': main()

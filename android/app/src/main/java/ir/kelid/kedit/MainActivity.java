package ir.kelid.kedit;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** K-Edit: one WebView, local files only (no internet permission), native save / share / file pick. */
public class MainActivity extends Activity {
    private static final int PICK = 41, PERM = 42;
    private static final String HOST = "appassets.androidplatform.net";
    private WebView web;
    private ValueCallback<Uri[]> fileCb;
    private final Map<String, ByteArrayOutputStream> bufs = new HashMap<>();
    private Uri sharedUri;
    private String sharedType = "", sharedName = "";
    private Runnable afterPerm;
    private String permId;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(0xFF060A15);
        getWindow().setNavigationBarColor(0xFF060A15);
        web = new WebView(this);
        web.setBackgroundColor(0xFF060A15);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/shared/", path -> sharedResponse())
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return loader.shouldInterceptRequest(r.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                String type = "*/*";
                String[] t = p.getAcceptTypes();
                if (t != null && t.length > 0 && t[0] != null && !t[0].isEmpty()) type = t[0];
                try {
                    Intent i;
                    if (Build.VERSION.SDK_INT >= 33 && (type.startsWith("image") || type.startsWith("video"))) {
                        i = new Intent(MediaStore.ACTION_PICK_IMAGES);
                        i.setType(type);
                    } else {
                        i = new Intent(Intent.ACTION_GET_CONTENT);
                        i.addCategory(Intent.CATEGORY_OPENABLE);
                        i.setType(type);
                    }
                    startActivityForResult(i, PICK);
                } catch (Exception e) {
                    try {
                        Intent g = new Intent(Intent.ACTION_GET_CONTENT);
                        g.addCategory(Intent.CATEGORY_OPENABLE);
                        g.setType(type);
                        startActivityForResult(g, PICK);
                    } catch (Exception e2) {
                        fileCb.onReceiveValue(null);
                        fileCb = null;
                        return false;
                    }
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "KEditNative");
        readIntent(getIntent());
        web.loadUrl("https://" + HOST + "/assets/ui/mobile.html");
    }

    private WebResourceResponse sharedResponse() {
        try {
            if (sharedUri == null) return null;
            InputStream in = getContentResolver().openInputStream(sharedUri);
            return new WebResourceResponse(sharedType.isEmpty() ? "application/octet-stream" : sharedType, null, in);
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        if (readIntent(i)) web.evaluateJavascript("window.kOpenShared&&kOpenShared()", null);
    }

    private boolean readIntent(Intent i) {
        if (i == null) return false;
        Uri u = null;
        try {
            if (Intent.ACTION_SEND.equals(i.getAction())) u = i.getParcelableExtra(Intent.EXTRA_STREAM);
            else if (Intent.ACTION_VIEW.equals(i.getAction())) u = i.getData();
        } catch (Exception ignored) { }
        if (u == null) return false;
        String t = i.getType();
        if (t == null || t.endsWith("/*")) { String r = getContentResolver().getType(u); if (r != null) t = r; }
        sharedUri = u;
        sharedType = t == null ? "" : t;
        sharedName = nameOf(u);
        return !sharedType.isEmpty();
    }

    private String nameOf(Uri u) {
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) { String n = c.getString(0); if (n != null) return n; }
        } catch (Exception ignored) { }
        return "";
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != PICK || fileCb == null) return;
        Uri[] out = null;
        if (res == RESULT_OK && data != null) {
            if (data.getData() != null) out = new Uri[]{data.getData()};
            else if (data.getClipData() != null && data.getClipData().getItemCount() > 0) out = new Uri[]{data.getClipData().getItemAt(0).getUri()};
        }
        fileCb.onReceiveValue(out);
        fileCb = null;
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("!!(window.kBack&&window.kBack())", v -> { if (!"true".equals(v)) finish(); });
    }

    private void reply(String id, JSONObject o) {
        final String js = "window.__keSaved(" + JSONObject.quote(id) + "," + JSONObject.quote(o.toString()) + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    private JSONObject obj(boolean ok, String key, Object val) {
        JSONObject o = new JSONObject();
        try { o.put("ok", ok); if (key != null) o.put(key, val); } catch (Exception ignored) { }
        return o;
    }

    private void saveOrAsk(String id, byte[] data, String name, String mime) {
        if (Build.VERSION.SDK_INT < 29 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            afterPerm = () -> save(id, data, name, mime);
            permId = id;
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, PERM);
            return;
        }
        save(id, data, name, mime);
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] p, int[] g) {
        super.onRequestPermissionsResult(req, p, g);
        if (req != PERM) return;
        Runnable r = afterPerm; afterPerm = null;
        if (g.length > 0 && g[0] == PackageManager.PERMISSION_GRANTED && r != null) r.run();
        else if (permId != null) reply(permId, obj(false, "perm", true));
    }

    private void save(final String id, final byte[] data, final String name, final String mime) {
        new Thread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/K-Edit");
                    cv.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    Uri u = getContentResolver().insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), cv);
                    if (u == null) throw new Exception("insert");
                    try (OutputStream os = getContentResolver().openOutputStream(u)) { os.write(data); }
                    cv.clear();
                    cv.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    getContentResolver().update(u, cv, null, null);
                    reply(id, obj(true, "where", "Pictures/K-Edit/" + name));
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "K-Edit");
                    if (!dir.exists()) dir.mkdirs();
                    File f = new File(dir, name);
                    int n = 1;
                    String base = name.contains(".") ? name.substring(0, name.lastIndexOf('.')) : name;
                    String ext = name.contains(".") ? name.substring(name.lastIndexOf('.')) : "";
                    while (f.exists()) f = new File(dir, base + " (" + (n++) + ")" + ext);
                    try (FileOutputStream os = new FileOutputStream(f)) { os.write(data); }
                    MediaScannerConnection.scanFile(this, new String[]{f.getAbsolutePath()}, new String[]{mime}, null);
                    reply(id, obj(true, "where", "Pictures/K-Edit/" + f.getName()));
                }
            } catch (Exception e) {
                reply(id, obj(false, "error", String.valueOf(e.getMessage())));
            }
        }).start();
    }

    private void share(String id, byte[] data, String name, String mime) {
        try {
            File dir = new File(getCacheDir(), "share");
            if (!dir.exists()) dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) for (File o : old) o.delete();
            File f = new File(dir, name);
            try (FileOutputStream os = new FileOutputStream(f)) { os.write(data); }
            Uri u = FileProvider.getUriForFile(this, "ir.kelid.kedit.files", f);
            Intent s = new Intent(Intent.ACTION_SEND);
            s.setType(mime);
            s.putExtra(Intent.EXTRA_STREAM, u);
            s.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(s, "اشتراک فایل"));
            reply(id, obj(true, "where", "share"));
        } catch (Exception e) {
            reply(id, obj(false, "error", String.valueOf(e.getMessage())));
        }
    }

    public class Bridge {
        @JavascriptInterface
        public String begin() {
            String id = UUID.randomUUID().toString();
            synchronized (bufs) { bufs.put(id, new ByteArrayOutputStream()); }
            return id;
        }

        @JavascriptInterface
        public void append(String id, String b64) {
            byte[] d = Base64.decode(b64, Base64.DEFAULT);
            ByteArrayOutputStream o;
            synchronized (bufs) { o = bufs.get(id); }
            if (o != null) o.write(d, 0, d.length);
        }

        @JavascriptInterface
        public void finish(final String id, final String name, final String mime, final String action) {
            final byte[] data;
            synchronized (bufs) {
                ByteArrayOutputStream o = bufs.remove(id);
                data = o == null ? new byte[0] : o.toByteArray();
            }
            runOnUiThread(() -> {
                if ("share".equals(action)) share(id, data, name, mime);
                else saveOrAsk(id, data, name, mime);
            });
        }

        @JavascriptInterface
        public String sharedType() { return sharedType; }

        @JavascriptInterface
        public String sharedName() { return sharedName; }

        @JavascriptInterface
        public void clearShared() { sharedType = ""; }
    }
}

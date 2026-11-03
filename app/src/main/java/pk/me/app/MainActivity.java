package pk.me.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    // The app's screens live on GitHub. The phone keeps the last copy so it works offline,
    // and swaps in a newer one when it finds it. No reinstall needed for screen changes.
    private static final String REMOTE =
            "https://raw.githubusercontent.com/fixngoltd-rgb/job-tracker/me-app-android/web/index.html";
    private static final String BASE = "https://appassets.androidplatform.net/assets/index.html";
    private static final String MARKER = "<!--me-app-->";

    private WebView web;
    private String current = "";
    private volatile boolean checking = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });
        web.addJavascriptInterface(new Bridge(), "MeNative");
        setContentView(web);
        current = cached();
        show(current);
        checkForUpdate();
    }

    private void show(String html) {
        web.loadDataWithBaseURL(BASE, html, "text/html", "utf-8", null);
    }

    private File cacheFile() { return new File(getFilesDir(), "index.html"); }

    private String cached() {
        try {
            File f = cacheFile();
            if (f.exists()) {
                String s = new String(readAll(new java.io.FileInputStream(f)), StandardCharsets.UTF_8);
                if (s.contains(MARKER)) return s;
            }
            return new String(readAll(getAssets().open("index.html")), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "<p>Couldn't open the app. Reinstall it.</p>";
        }
    }

    private void checkForUpdate() {
        if (checking) return;
        checking = true;
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(REMOTE + "?t=" + System.currentTimeMillis()).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(15000);
                c.setUseCaches(false);
                if (c.getResponseCode() == 200) {
                    String html = new String(readAll(c.getInputStream()), StandardCharsets.UTF_8);
                    if (html.contains(MARKER) && !html.equals(current)) {
                        try (FileOutputStream out = new FileOutputStream(cacheFile())) {
                            out.write(html.getBytes(StandardCharsets.UTF_8));
                        }
                        current = html;
                        runOnUiThread(() -> show(html));
                    }
                }
                c.disconnect();
            } catch (Exception ignored) {
                // Offline or GitHub unreachable: keep the copy on the phone.
            } finally {
                checking = false;
            }
        }).start();
    }

    private static byte[] readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toByteArray();
    }

    private class Bridge {
        @JavascriptInterface
        public void update() { checkForUpdate(); }
    }

    @Override
    protected void onResume() {
        super.onResume();
        checkForUpdate();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}

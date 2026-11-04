package com.vortexarena.game;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
    private static final String TAG = "VortexArena";
    private static final String PREFS_NAME = "VortexPrefs";
    private static final String PREF_SERVER_URL = "server_url";
    public static final String PRODUCTION_SERVER_URL = "https://vortex-arena-1nmx.onrender.com";
    private static final String LOCAL_GAME_URL = "https://appassets.androidplatform.net/index.html";

    private WebView mWebView;
    private FrameLayout mRootLayout;
    private LinearLayout mErrorLayout;
    private ProgressBar mLoadingBar;
    private TextView mErrorMsgText;
    private SharedPreferences mPrefs;
    private String mCurrentServerUrl;
    private WebViewAssetLoader mAssetLoader;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Hardware acceleration & Immersive Fullscreen
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        mPrefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        mCurrentServerUrl = mPrefs.getString(PREF_SERVER_URL, PRODUCTION_SERVER_URL);

        // Configure secure AndroidX WebViewAssetLoader for local bundled asset streaming
        mAssetLoader = new WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        setupViews();
        setImmersiveMode();
        loadGame();
    }

    private void setupViews() {
        mRootLayout = new FrameLayout(this);
        mRootLayout.setBackgroundColor(Color.parseColor("#0a0f18"));

        // 1. Hardware Accelerated Game WebView
        mWebView = new WebView(this);
        mWebView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        mWebView.setBackgroundColor(Color.parseColor("#0a0f18"));
        mWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        setupWebViewSettings();

        // 2. Loading Bar
        mLoadingBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        FrameLayout.LayoutParams pbParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 8);
        pbParams.gravity = Gravity.TOP;
        mLoadingBar.setLayoutParams(pbParams);
        mLoadingBar.setIndeterminate(false);
        mLoadingBar.setMax(100);

        // 3. Error / Disconnected Overlay
        setupErrorLayout();

        mRootLayout.addView(mWebView);
        mRootLayout.addView(mLoadingBar);
        mRootLayout.addView(mErrorLayout);

        setContentView(mRootLayout);
    }

    private void setupWebViewSettings() {
        WebSettings s = mWebView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);

        // Security: Restrict direct file-scheme access (WebViewAssetLoader replaces file://)
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);

        // Media, viewport, and rendering optimization
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Identify official native Android client
        String defaultUa = s.getUserAgentString();
        s.setUserAgentString(defaultUa + " VortexArenaNative/1.2.0");

        mWebView.addJavascriptInterface(new WebAppInterface(this), "Android");

        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                mLoadingBar.setProgress(newProgress);
                if (newProgress >= 100) {
                    mLoadingBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage msg) {
                Log.d(TAG, "[GameJS] " + msg.message() + " -- (" + msg.sourceId() + ":" + msg.lineNumber() + ")");
                return true;
            }
        });

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                android.net.Uri url = request.getUrl();
                if (url != null && "appassets.androidplatform.net".equals(url.getHost())) {
                    String path = url.getPath();
                    if (path == null || path.isEmpty() || "/".equals(path)) {
                        path = "/index.html";
                    }

                    // Extract relative path within assets/www
                    String cleanPath = path;
                    if (cleanPath.startsWith("/assets/www/")) {
                        cleanPath = cleanPath.substring("/assets/www/".length());
                    } else if (cleanPath.startsWith("/assets/")) {
                        cleanPath = cleanPath.substring("/assets/".length());
                    }
                    if (cleanPath.startsWith("/")) {
                        cleanPath = cleanPath.substring(1);
                    }

                    try {
                        String assetPath = "www/" + cleanPath;
                        java.io.InputStream is = getAssets().open(assetPath);

                        String mime = "application/octet-stream";
                        if (cleanPath.endsWith(".html")) mime = "text/html";
                        else if (cleanPath.endsWith(".css")) mime = "text/css";
                        else if (cleanPath.endsWith(".js") || cleanPath.endsWith(".mjs")) mime = "application/javascript";
                        else if (cleanPath.endsWith(".svg")) mime = "image/svg+xml";
                        else if (cleanPath.endsWith(".png")) mime = "image/png";
                        else if (cleanPath.endsWith(".ico")) mime = "image/x-icon";
                        else if (cleanPath.endsWith(".json")) mime = "application/json";

                        java.util.Map<String, String> headers = new java.util.HashMap<>();
                        headers.put("Access-Control-Allow-Origin", "*");
                        headers.put("Cache-Control", "no-cache");
                        return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, is);
                    } catch (Exception e) {
                        Log.e(TAG, "Asset not found: " + cleanPath + " (requested: " + path + ")", e);
                    }
                }
                return mAssetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                mLoadingBar.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    showErrorScreen("Game initialization failed: " + error.getDescription());
                }
            }
        });
    }

    private void setupErrorLayout() {
        mErrorLayout = new LinearLayout(this);
        mErrorLayout.setOrientation(LinearLayout.VERTICAL);
        mErrorLayout.setGravity(Gravity.CENTER);
        mErrorLayout.setBackgroundColor(Color.parseColor("#0a0f18"));
        mErrorLayout.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        mErrorLayout.setPadding(64, 32, 64, 32);
        mErrorLayout.setVisibility(View.GONE);

        TextView title = new TextView(this);
        title.setText("VORTEX ARENA");
        title.setTextColor(Color.parseColor("#00f0ff"));
        title.setTextSize(24f);
        title.setGravity(Gravity.CENTER);
        mErrorLayout.addView(title);

        mErrorMsgText = new TextView(this);
        mErrorMsgText.setTextColor(Color.parseColor("#94a3b8"));
        mErrorMsgText.setTextSize(14f);
        mErrorMsgText.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.setMargins(0, 24, 0, 32);
        mErrorMsgText.setLayoutParams(p);
        mErrorLayout.addView(mErrorMsgText);

        android.widget.Button retryBtn = new android.widget.Button(this);
        retryBtn.setText("Retry Connection");
        retryBtn.setTextColor(Color.parseColor("#0a0f18"));
        retryBtn.setBackgroundColor(Color.parseColor("#00f0ff"));
        retryBtn.setPadding(32, 16, 32, 16);
        retryBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                loadGame();
            }
        });
        mErrorLayout.addView(retryBtn);
    }

    private void showErrorScreen(String message) {
        mErrorMsgText.setText(message + "\n\nPlease ensure your device is connected to the internet.");
        mErrorLayout.setVisibility(View.VISIBLE);
    }

    private void loadGame() {
        mErrorLayout.setVisibility(View.GONE);
        mLoadingBar.setVisibility(View.VISIBLE);
        // Load high-speed bundled local assets via secure WebViewAssetLoader
        mWebView.loadUrl(LOCAL_GAME_URL);
    }

    private void setImmersiveMode() {
        View decorView = getWindow().getDecorView();
        decorView.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            setImmersiveMode();
        }
    }

    @Override
    public void onBackPressed() {
        // First check if web UI has open modals to dismiss
        mWebView.evaluateJavascript(
            "(function() { " +
            "  if (window.app && typeof window.app.handleNativeBackPress === 'function') { " +
            "    return window.app.handleNativeBackPress(); " +
            "  } " +
            "  return false; " +
            "})();",
            new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    if ("true".equals(value)) {
                        return; // Modal closed by web app
                    }
                    showExitDialog();
                }
            }
        );
    }

    private void showExitDialog() {
        new AlertDialog.Builder(this)
            .setTitle("Exit Vortex Arena?")
            .setMessage("Are you sure you want to exit the match?")
            .setPositiveButton("Exit", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    finish();
                }
            })
            .setNegativeButton("Resume", null)
            .show();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (mWebView != null) {
            mWebView.onPause();
            mWebView.evaluateJavascript("if (window.app && typeof window.app.onAppPause === 'function') { window.app.onAppPause(); }", null);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (mWebView != null) {
            mWebView.onResume();
            mWebView.evaluateJavascript("if (window.app && typeof window.app.onAppResume === 'function') { window.app.onAppResume(); }", null);
        }
        setImmersiveMode();
    }

    @Override
    protected void onDestroy() {
        if (mWebView != null) {
            mWebView.destroy();
        }
        super.onDestroy();
    }

    public static class WebAppInterface {
        Context mContext;

        WebAppInterface(Context c) {
            mContext = c;
        }

        @JavascriptInterface
        public void vibrate(long ms) {
            try {
                Vibrator v = (Vibrator) mContext.getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) {
                    long duration = Math.min(Math.max(ms, 10), 500);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE));
                    } else {
                        v.vibrate(duration);
                    }
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void showToast(String toast) {
            Toast.makeText(mContext, toast, Toast.LENGTH_SHORT).show();
        }

        @JavascriptInterface
        public String getServerUrl() {
            return PRODUCTION_SERVER_URL;
        }

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public String getAppVersion() {
            return "1.2.0";
        }
    }
}

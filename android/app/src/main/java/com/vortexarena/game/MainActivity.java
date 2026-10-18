package com.vortexarena.game;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String TAG = "VortexArena";
    private static final String PREFS_NAME = "VortexPrefs";
    private static final String PREF_SERVER_URL = "server_url";
    private static final String DEFAULT_SERVER_URL = "http://192.168.1.3:3000";

    private WebView mWebView;
    private FrameLayout mRootLayout;
    private LinearLayout mErrorLayout;
    private ProgressBar mLoadingBar;
    private TextView mErrorMsgText;
    private SharedPreferences mPrefs;
    private String mCurrentServerUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Immersive Fullscreen and Notch Handling
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        mPrefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        mCurrentServerUrl = mPrefs.getString(PREF_SERVER_URL, DEFAULT_SERVER_URL);

        setupViews();
        setImmersiveMode();
        loadGame();
    }

    private void setupViews() {
        mRootLayout = new FrameLayout(this);
        mRootLayout.setBackgroundColor(Color.parseColor("#0a0f18"));

        // 1. WebView
        mWebView = new WebView(this);
        mWebView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        mWebView.setBackgroundColor(Color.parseColor("#0a0f18"));
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

        // 4. Quick Server Settings Floating Button (discreet top-right gear pill)
        Button settingsBtn = new Button(this);
        settingsBtn.setText("⚙ SERVER");
        settingsBtn.setTextColor(Color.parseColor("#00f0ff"));
        settingsBtn.setTextSize(10f);
        settingsBtn.setBackgroundColor(Color.parseColor("#800a0f18"));
        FrameLayout.LayoutParams btnParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        btnParams.gravity = Gravity.TOP | Gravity.END;
        btnParams.setMargins(0, 16, 24, 0);
        settingsBtn.setLayoutParams(btnParams);
        settingsBtn.setPadding(20, 8, 20, 8);
        settingsBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showServerConfigDialog();
            }
        });

        mRootLayout.addView(mWebView);
        mRootLayout.addView(mLoadingBar);
        mRootLayout.addView(mErrorLayout);
        mRootLayout.addView(settingsBtn);

        setContentView(mRootLayout);
    }

    private void setupWebViewSettings() {
        WebSettings s = mWebView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        mWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        mWebView.addJavascriptInterface(new WebAppInterface(this), "Android");

        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    mLoadingBar.setVisibility(View.VISIBLE);
                    mLoadingBar.setProgress(newProgress);
                } else {
                    mLoadingBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.d(TAG + "-Web", cm.message() + " -- From line " + cm.lineNumber() + " of " + cm.sourceId());
                return true;
            }
        });

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                mErrorLayout.setVisibility(View.GONE);
                setImmersiveMode();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showErrorScreen("Failed to connect to " + mCurrentServerUrl);
                }
            }
        });
    }

    private void setupErrorLayout() {
        mErrorLayout = new LinearLayout(this);
        mErrorLayout.setOrientation(LinearLayout.VERTICAL);
        mErrorLayout.setGravity(Gravity.CENTER);
        mErrorLayout.setBackgroundColor(Color.parseColor("#0f172a"));
        mErrorLayout.setVisibility(View.GONE);
        mErrorLayout.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        TextView title = new TextView(this);
        title.setText("VORTEX ARENA");
        title.setTextSize(26f);
        title.setTextColor(Color.parseColor("#00f0ff"));
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, 0, 0, 12);
        mErrorLayout.addView(title);

        mErrorMsgText = new TextView(this);
        mErrorMsgText.setText("Unable to connect to game server");
        mErrorMsgText.setTextColor(Color.parseColor("#ff3366"));
        mErrorMsgText.setTextSize(14f);
        mErrorMsgText.setGravity(Gravity.CENTER);
        mErrorMsgText.setPadding(24, 0, 24, 24);
        mErrorLayout.addView(mErrorMsgText);

        LinearLayout btnRow = new LinearLayout(this);
        btnRow.setOrientation(LinearLayout.HORIZONTAL);
        btnRow.setGravity(Gravity.CENTER);

        Button retryBtn = new Button(this);
        retryBtn.setText("🔄 Retry");
        retryBtn.setTextColor(Color.WHITE);
        retryBtn.setBackgroundColor(Color.parseColor("#00a8ff"));
        retryBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                loadGame();
            }
        });
        btnRow.addView(retryBtn);

        Button changeIpBtn = new Button(this);
        changeIpBtn.setText("⚙ Change Server");
        changeIpBtn.setTextColor(Color.WHITE);
        changeIpBtn.setBackgroundColor(Color.parseColor("#334155"));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.setMargins(16, 0, 0, 0);
        changeIpBtn.setLayoutParams(p);
        changeIpBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showServerConfigDialog();
            }
        });
        btnRow.addView(changeIpBtn);

        Button offlineBtn = new Button(this);
        offlineBtn.setText("📦 Offline Assets");
        offlineBtn.setTextColor(Color.WHITE);
        offlineBtn.setBackgroundColor(Color.parseColor("#1e293b"));
        LinearLayout.LayoutParams p2 = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p2.setMargins(16, 0, 0, 0);
        offlineBtn.setLayoutParams(p2);
        offlineBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                mErrorLayout.setVisibility(View.GONE);
                mWebView.loadUrl("file:///android_asset/www/index.html");
                Toast.makeText(MainActivity.this, "Loaded local bundled assets", Toast.LENGTH_SHORT).show();
            }
        });
        btnRow.addView(offlineBtn);

        mErrorLayout.addView(btnRow);
    }

    private void showErrorScreen(String message) {
        mErrorMsgText.setText(message + "\n\nMake sure the server is running and your phone is on the same Wi-Fi.");
        mErrorLayout.setVisibility(View.VISIBLE);
    }

    private void loadGame() {
        mErrorLayout.setVisibility(View.GONE);
        mLoadingBar.setVisibility(View.VISIBLE);
        mWebView.loadUrl(mCurrentServerUrl);
    }

    private void showServerConfigDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("Configure Match Server");

        final EditText input = new EditText(this);
        input.setHint("http://192.168.1.3:3000");
        input.setText(mCurrentServerUrl);
        input.setSingleLine();
        input.setPadding(32, 24, 32, 24);
        builder.setView(input);

        builder.setPositiveButton("Connect", new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                String newUrl = input.getText().toString().trim();
                if (!newUrl.isEmpty()) {
                    if (!newUrl.startsWith("http://") && !newUrl.startsWith("https://")) {
                        newUrl = "http://" + newUrl;
                    }
                    mCurrentServerUrl = newUrl;
                    mPrefs.edit().putString(PREF_SERVER_URL, mCurrentServerUrl).apply();
                    Toast.makeText(MainActivity.this, "Connecting to " + mCurrentServerUrl, Toast.LENGTH_SHORT).show();
                    loadGame();
                }
            }
        });
        builder.setNegativeButton("Cancel", null);
        builder.show();
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
        new AlertDialog.Builder(this)
            .setTitle("Exit Vortex Arena?")
            .setMessage("Are you sure you want to exit the game?")
            .setPositiveButton("Exit", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    finish();
                }
            })
            .setNegativeButton("Resume", null)
            .show();
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
                    v.vibrate(Math.min(ms, 500));
                }
            } catch (Exception e) {}
        }

        @JavascriptInterface
        public void showToast(String toast) {
            Toast.makeText(mContext, toast, Toast.LENGTH_SHORT).show();
        }

        @JavascriptInterface
        public String getServerUrl() {
            SharedPreferences p = mContext.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            return p.getString(PREF_SERVER_URL, DEFAULT_SERVER_URL);
        }
    }
}

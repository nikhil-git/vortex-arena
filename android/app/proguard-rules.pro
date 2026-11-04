# Keep JavascriptInterface methods so WebView bridge works in release builds
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-keep class com.vortexarena.game.MainActivity$WebAppInterface {
    public *;
}

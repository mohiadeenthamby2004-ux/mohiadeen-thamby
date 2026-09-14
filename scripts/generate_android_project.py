import os
import zipfile
import shutil

OUTPUT_DIR = "/tmp/android_project"
ZIP_PATH = os.path.abspath("public/PhotoAdditionCalculator-AndroidProject.zip")

if os.path.exists(OUTPUT_DIR):
    shutil.rmtree(OUTPUT_DIR)

os.makedirs(os.path.join(OUTPUT_DIR, "app/src/main/java/com/photoaddition/calculator"), exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, "app/src/main/res/values"), exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, "app/src/main/res/xml"), exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, "app/src/main/res/mipmap-hdpi"), exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, "app/src/main/res/mipmap-xhdpi"), exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, "app/src/main/res/mipmap-xxhdpi"), exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, "app/src/main/res/mipmap-xxxhdpi"), exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, "gradle/wrapper"), exist_ok=True)

# 1. settings.gradle
with open(os.path.join(OUTPUT_DIR, "settings.gradle"), "w") as f:
    f.write('''pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "PhotoAdditionCalculator"
include ':app'
''')

# 2. build.gradle (root)
with open(os.path.join(OUTPUT_DIR, "build.gradle"), "w") as f:
    f.write('''buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.2.2'
    }
}

plugins {
    id 'com.android.application' version '8.2.2' apply false
}

tasks.register('clean', Delete) {
    delete rootProject.buildDir
}
''')

# 3. gradle.properties
with open(os.path.join(OUTPUT_DIR, "gradle.properties"), "w") as f:
    f.write('''org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.enableJetifier=true
android.nonTransitiveRClass=true
''')

# 4. app/build.gradle
with open(os.path.join(OUTPUT_DIR, "app/build.gradle"), "w") as f:
    f.write('''plugins {
    id 'com.android.application'
}

android {
    namespace 'com.photoaddition.calculator'
    compileSdk 34

    defaultConfig {
        applicationId "com.photoaddition.calculator"
        minSdk 24
        targetSdk 34
        versionCode 1
        versionName "1.0.0"

        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
        debug {
            applicationIdSuffix ".debug"
            debuggable true
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'com.google.android.material:material:1.11.0'
    implementation 'androidx.webkit:webkit:1.10.0'
    implementation 'androidx.swiperefreshlayout:swiperefreshlayout:1.1.0'
    implementation 'androidx.activity:activity:1.8.2'
    implementation 'androidx.core:core:1.12.0'
}
''')

# 5. AndroidManifest.xml
with open(os.path.join(OUTPUT_DIR, "app/src/main/AndroidManifest.xml"), "w") as f:
    f.write('''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />

    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher"
        android:supportsRtl="true"
        android:theme="@style/Theme.PhotoAdditionCalculator.NoActionBar"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="true"
        tools:targetApi="31">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
    </application>

</manifest>
''')

# 6. MainActivity.java
with open(os.path.join(OUTPUT_DIR, "app/src/main/java/com/photoaddition/calculator/MainActivity.java"), "w") as f:
    f.write('''package com.photoaddition.calculator;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {

    private static final String APP_URL = "https://ais-pre-r6w7sigcxwp7vzj2y2b3l7-750761806589.asia-southeast1.run.app";

    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private ValueCallback<Uri[]> fileUploadCallback;
    private Uri cameraImageUri;

    private final ActivityResultLauncher<Intent> fileChooserLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (fileUploadCallback == null) return;

                Uri[] results = null;
                if (result.getResultCode() == RESULT_OK) {
                    if (result.getData() != null && result.getData().getData() != null) {
                        results = new Uri[]{result.getData().getData()};
                    } else if (cameraImageUri != null) {
                        results = new Uri[]{cameraImageUri};
                    }
                }
                fileUploadCallback.onReceiveValue(results);
                fileUploadCallback = null;
            }
    );

    private final ActivityResultLauncher<String> requestCameraPermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            isGranted -> {
                if (!isGranted) {
                    Toast.makeText(this, "Camera permission needed to take photos of numbers", Toast.LENGTH_SHORT).show();
                }
            }
    );

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        checkPermissions();

        swipeRefresh = findViewById(R.id.swipeRefresh);
        webView = findViewById(R.id.webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);

        // Hardware acceleration support
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                swipeRefresh.setRefreshing(false);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // Auto-grant camera permissions requested inside webview for direct video capture
                runOnUiThread(() -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        request.grant(request.getResources());
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (fileUploadCallback != null) {
                    fileUploadCallback.onReceiveValue(null);
                }
                fileUploadCallback = filePathCallback;

                Intent takePictureIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                File photoFile = null;
                try {
                    photoFile = createImageFile();
                } catch (IOException ex) {
                    ex.printStackTrace();
                }

                if (photoFile != null) {
                    cameraImageUri = FileProvider.getUriForFile(
                            MainActivity.this,
                            getApplicationContext().getPackageName() + ".fileprovider",
                            photoFile
                    );
                    takePictureIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
                }

                Intent contentSelectionIntent = new Intent(Intent.ACTION_GET_CONTENT);
                contentSelectionIntent.addCategory(Intent.CATEGORY_OPENABLE);
                contentSelectionIntent.setType("image/*");

                Intent[] intentArray = (takePictureIntent != null && photoFile != null)
                        ? new Intent[]{takePictureIntent}
                        : new Intent[0];

                Intent chooserIntent = new Intent(Intent.ACTION_CHOOSER);
                chooserIntent.putExtra(Intent.EXTRA_INTENT, contentSelectionIntent);
                chooserIntent.putExtra(Intent.EXTRA_TITLE, "Select or Take Photo");
                chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, intentArray);

                fileChooserLauncher.launch(chooserIntent);
                return true;
            }
        });

        swipeRefresh.setOnRefreshListener(() -> webView.reload());

        // Handle Back button navigation
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    finish();
                }
            }
        });

        webView.loadUrl(APP_URL);
    }

    private File createImageFile() throws IOException {
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        String imageFileName = "PHOTO_CALC_" + timeStamp + "_";
        File storageDir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        return File.createTempFile(imageFileName, ".jpg", storageDir);
    }

    private void checkPermissions() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestCameraPermissionLauncher.launch(Manifest.permission.CAMERA);
        }
    }
}
''')

# 7. Layout activity_main.xml
os.makedirs(os.path.join(OUTPUT_DIR, "app/src/main/res/layout"), exist_ok=True)
with open(os.path.join(OUTPUT_DIR, "app/src/main/res/layout/activity_main.xml"), "w") as f:
    f.write('''<?xml version="1.0" encoding="utf-8"?>
<androidx.swiperefreshlayout.widget.SwipeRefreshLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/swipeRefresh"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <WebView
        android:id="@+id/webView"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

</androidx.swiperefreshlayout.widget.SwipeRefreshLayout>
''')

# 8. Strings, Colors, Themes, File Paths
with open(os.path.join(OUTPUT_DIR, "app/src/main/res/values/strings.xml"), "w") as f:
    f.write('''<resources>
    <string name="app_name">Photo Addition Calculator</string>
</resources>
''')

with open(os.path.join(OUTPUT_DIR, "app/src/main/res/values/colors.xml"), "w") as f:
    f.write('''<resources>
    <color name="primary">#2563EB</color>
    <color name="primary_dark">#1E40AF</color>
    <color name="accent">#F59E0B</color>
    <color name="background">#0F172A</color>
</resources>
''')

with open(os.path.join(OUTPUT_DIR, "app/src/main/res/values/themes.xml"), "w") as f:
    f.write('''<resources>
    <style name="Theme.PhotoAdditionCalculator" parent="Theme.MaterialComponents.DayNight.DarkActionBar">
        <item name="colorPrimary">@color/primary</item>
        <item name="colorPrimaryDark">@color/primary_dark</item>
        <item name="colorAccent">@color/accent</item>
    </style>

    <style name="Theme.PhotoAdditionCalculator.NoActionBar" parent="Theme.MaterialComponents.DayNight.NoActionBar">
        <item name="android:statusBarColor">@color/background</item>
        <item name="android:navigationBarColor">@color/background</item>
    </style>
</resources>
''')

with open(os.path.join(OUTPUT_DIR, "app/src/main/res/xml/file_paths.xml"), "w") as f:
    f.write('''<?xml version="1.0" encoding="utf-8"?>
<paths>
    <external-files-path name="my_images" path="Pictures" />
</paths>
''')

# Copy launcher icons from public directory
icon192 = os.path.abspath("public/pwa-192x192.png")
icon512 = os.path.abspath("public/pwa-512x512.png")

for folder in ["mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"]:
    dest = os.path.join(OUTPUT_DIR, "app/src/main/res", folder, "ic_launcher.png")
    if os.path.exists(icon192):
        shutil.copyfile(icon192, dest)

# 9. README.md with build instructions
with open(os.path.join(OUTPUT_DIR, "README.md"), "w") as f:
    f.write('''# Photo Addition Calculator - Android Project

This is the official native Android project for Photo Addition Calculator.

## How to Build the APK File

### Option 1: Using Android Studio (Easiest)
1. Open **Android Studio**.
2. Click **Open** and select this extracted folder.
3. Wait for Gradle sync to finish (1-2 minutes).
4. In the top menu, click **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
5. Once built, a popup will appear at the bottom right: click **locate** to open the folder containing `app-debug.apk`.
6. Transfer `app-debug.apk` to your phone or emulator and install!

### Option 2: Using Command Line (Gradle)
```bash
./gradlew assembleDebug
```
The output APK file will be at:
`app/build/outputs/apk/debug/app-debug.apk`

For release APK:
```bash
./gradlew assembleRelease
```
''')

# Create ZIP archive
with zipfile.ZipFile(ZIP_PATH, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(OUTPUT_DIR):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, OUTPUT_DIR)
            zipf.write(full_path, rel_path)

print(f"Successfully generated {ZIP_PATH} with size {os.path.getsize(ZIP_PATH)} bytes")

// app.config.js
export default ({ config }) => ({
    ...config,

    name: "Tryggd",
    slug: "tryggd-frontend",
    version: "4.6.2",
    orientation: "portrait",
    icon: "./assets/images/tryggd-app-icon-1024.png",
    scheme: "tryggd",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,

    runtimeVersion: {
        policy: "fingerprint",
    },
    updates: {
        url: "https://u.expo.dev/242a317f-a241-46dc-89ea-cd7857165cc1",
        enabled: true,
    },

    ios: {
        supportsTablet: true,
        entitlements: {
            "aps-environment": "production",
        },
        infoPlist: {
            UIBackgroundModes: ["remote-notification"],
            ITSAppUsesNonExemptEncryption: false,
            NSCameraUsageDescription:
                "Tryggd uses the camera to take a profile photo and to scan QR codes when adding contacts.",
            NSLocationWhenInUseUsageDescription:
                "Tryggd uses your location so you can optionally share your current location with selected contacts when you check in.",
            NSPhotoLibraryUsageDescription:
                "Tryggd uses your photo library so you can choose a profile photo, for example when selecting an account picture in Profile.",
            CFBundleLocalizations: [
                "en",
                "da",
                "fi",
                "fr",
                "de",
                "it",
                "ja",
                "ko",
                "no",
                "es",
                "sv",
                "th",
                "zh-Hans",
                "zh-Hant",
            ],
        },
        bundleIdentifier: "com.marcustechnology.tryggd",
    },

    android: {
        softwareKeyboardLayoutMode: "pan",
        adaptiveIcon: {
            backgroundColor: "#E6F4FE",
            foregroundImage: "./assets/images/tryggd-icon-foreground-small.png",
            backgroundImage: "./assets/images/tryggd-icon-background.png",
            monochromeImage: "./assets/images/tryggd-icon-monochrome.png",
        },
        edgeToEdgeEnabled: true,
        predictiveBackGestureEnabled: false,
        package: "com.marcustechnology.tryggd",
        permissions: ["RECEIVE_BOOT_COMPLETED", "VIBRATE", "ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
        googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
    },

    web: {
        output: "static",
        favicon: "./assets/images/tryggd-app-icon-1024.png",
    },

    plugins: [
        "expo-router",
        "expo-font",
        [
            "expo-splash-screen",
            {
                backgroundColor: "#E6F4FE",
                image: "./assets/images/tryggd-splash-heart-green.png",
                imageWidth: 200,
                resizeMode: "contain",
            },
        ],
        [
            "expo-notifications",
            {
                icon: "./assets/images/tryggd-notification-icon-96.png",
                color: "#5FA893",
                defaultChannel: "default",
            },
        ],
        [
            "expo-plugin-app-name-localization",
            {
                localizations: {
                    en: "Tryggd",
                    "zh-CN": "小报告",
                    "zh-TW": "小報告",
                },
            },
        ],
        [
            "expo-aliyun-push",
            {
                androidAliyunAppKey: process.env.ALIYUN_ANDROID_APP_KEY,
                androidAliyunAppSecret: process.env.ALIYUN_ANDROID_APP_SECRET,
                iosAliyunAppKey: process.env.ALIYUN_IOS_APP_KEY,
                iosAliyunAppSecret: process.env.ALIYUN_IOS_APP_SECRET,
            },
        ],
        "./plugins/withAliyunMaven",
        [
            "expo-build-properties",
            {
                android: {
                    enableProguardInReleaseBuilds: true,
                    extraMavenRepos: [
                        "../../node_modules/@notifee/react-native/android/libs",
                        "https://developer.huawei.com/repo/",
                        "https://developer.hihonor.com/repo/",
                    ],
                    extraProguardRules: `
-keepclasseswithmembernames class ** { native <methods>; }
-keepattributes Signature
-keep class sun.misc.Unsafe { *; }
-keep class com.taobao.** {*;}
-keep class com.alibaba.** {*;}
-keep class com.alipay.** {*;}
-keep class com.ut.** {*;}
-keep class com.ta.** {*;}
-keep class anet.**{*;}
-keep class anetwork.**{*;}
-keep class org.android.spdy.**{*;}
-keep class org.android.agoo.**{*;}
-keep class android.os.**{*;}
-keep class org.json.**{*;}
-dontwarn com.taobao.**
-dontwarn com.alibaba.**
-dontwarn com.alipay.**
-dontwarn anet.**
-dontwarn org.android.spdy.**
-dontwarn org.android.agoo.**
-dontwarn anetwork.**
-dontwarn com.ut.**
-dontwarn com.ta.**
-keep class com.huawei.** {*;}
-dontwarn com.huawei.**
-ignorewarnings
-keepattributes *Annotation*
-keepattributes Exceptions
-keepattributes InnerClasses
-keepattributes SourceFile,LineNumberTable
-keep class com.hihonor.push.**{*;}
`,
                },
            },
        ],
    ],

    experiments: {
        typedRoutes: true,
        reactCompiler: true,
    },

    extra: {
        router: {
            root: "app",
        },
        eas: {
            projectId: "242a317f-a241-46dc-89ea-cd7857165cc1",
        },
    },
});

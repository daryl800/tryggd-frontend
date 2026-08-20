// app.config.js
const withAndroidWidget = require("./plugins/withAndroidWidget");
const withIosNotificationSound = require("./plugins/withIosNotificationSound");
const withAndroidNotificationSound = require("./plugins/withAndroidNotificationSound");

// Shared with modules/tryggd-widget-bridge/ios/TryggdWidgetBridgeModule.swift
// and targets/widget/expo-target.config.js — all three MUST match. See
// docs/home-screen-widget.md.
const WIDGET_APP_GROUP_ID = "group.com.marcustechnology.tryggd.widget";

export default ({ config }) => ({
    ...config,

    name: "Tryggd",
    slug: "tryggd-frontend",
    version: "4.7.0",
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
        // REQUIRED before the widget target will build/sign — see
        // docs/home-screen-widget.md "Apple configuration steps". Find
        // this in Xcode under Signing & Capabilities, or
        // developer.apple.com/account under Membership.
        appleTeamId: process.env.APPLE_TEAM_ID,
        entitlements: {
            "aps-environment": "production",
            // Lets the main app and the widget extension (targets/widget)
            // read/write the same shared UserDefaults — see
            // modules/tryggd-widget-bridge and docs/home-screen-widget.md.
            "com.apple.security.application-groups": [WIDGET_APP_GROUP_ID],
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
            "expo-build-properties",
            {
                ios: {
                    extraPods: [
                        { name: "libavif", version: "~> 0.11.1" },
                    ],
                },
                android: {
                    enableProguardInReleaseBuilds: true,
                    extraMavenRepos: [
                        "../../node_modules/@notifee/react-native/android/libs",
                    ],
                },
            },
        ],
        // iOS "My Circle" widget — generates/links the targets/widget
        // Xcode extension target on every prebuild. See
        // docs/home-screen-widget.md.
        "@bacons/apple-targets",
        // Android "My Circle" widget — see plugins/withAndroidWidget.js
        // and docs/home-screen-widget.md.
        withAndroidWidget,
        // Bundles help_alert.caf into the iOS app target and registers it
        // in Xcode's Copy Bundle Resources build phase on every prebuild —
        // required for the `sound: 'help_alert.caf'` push payload field
        // (see supabase/functions/send-help-request) to actually play a
        // custom sound instead of silently falling back to the system
        // default. See plugins/withIosNotificationSound.js for the full
        // backstory.
        withIosNotificationSound,
        // Android counterpart — bundles help_alert.mp3 into
        // android/app/src/main/res/raw/ so the help_alerts_v5 channel (see
        // lib/notifications/core.ts) can point its `sound` at it instead of
        // the system default. See plugins/withAndroidNotificationSound.js.
        withAndroidNotificationSound,
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

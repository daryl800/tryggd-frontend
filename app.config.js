// app.config.js
export default ({ config }) => ({
    // 保留 Expo 已正規化的預設值（有些工具會注入）
    ...config,

    expo: {
        name: "tryggd",
        slug: "tryggd-frontend",
        version: "2.3.0",
        orientation: "portrait",
        icon: "./assets/images/tryggd-icon-small.png",
        scheme: "tryggd",
        userInterfaceStyle: "automatic",
        newArchEnabled: true,

        ios: {
            supportsTablet: true,
            infoPlist: {
                UIBackgroundModes: ["remote-notification"],
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
            versionCode: 1,
            permissions: ["RECEIVE_BOOT_COMPLETED", "VIBRATE"],

            // 重要：不要 commit google-services.json
            // 用 EAS file secret 讓 build 時提供檔案路徑
            googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
        },

        web: {
            output: "static",
            favicon: "./assets/images/tryggd-app-icon-1024.png",
        },

        plugins: [
            "expo-router",
            [
                "expo-splash-screen",
                {
                    image: "./assets/images/tryggd-app-icon-1024.png",
                    imageWidth: 200,
                    resizeMode: "contain",
                    backgroundColor: "#ffffff",
                    dark: {
                        backgroundColor: "#000000",
                    },
                },
            ],
            "expo-font",
            [
                "expo-notifications",
                {
                    icon: "./assets/images/tryggd-notification-icon-96.png",
                    color: "#5FA893",
                    defaultChannel: "default",
                },
            ],
            [
                "expo-build-properties",
                {
                    android: {
                        enableProguardInReleaseBuilds: true,
                        extraMavenRepos: [
                            "../../node_modules/@notifee/react-native/android/libs",
                        ],
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
    },
});

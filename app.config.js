// app.config.js
export default ({ config }) => ({
    ...config,

    name: "tryggd",
    slug: "tryggd-frontend",
    version: "3.0.3",
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
        infoPlist: {
            UIBackgroundModes: ["remote-notification"],
            ITSAppUsesNonExemptEncryption: false,
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
        permissions: ["RECEIVE_BOOT_COMPLETED", "VIBRATE"],
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
                image: "./assets/images/tryggd-splash-square.png",
                imageWidth: 180,
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
});

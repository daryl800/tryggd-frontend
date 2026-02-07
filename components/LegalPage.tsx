// components/LegalPage.tsx
import HeaderWithBack from "@/components/common/HeaderWithBack";
import { ScrollView, StyleSheet } from "react-native";
import Markdown from "react-native-markdown-display";
import { SafeAreaView } from "react-native-safe-area-context";

interface LegalPageProps {
    title: string;
    content: string;
    router: any;
}

export default function LegalPage({ title, content, router }: LegalPageProps) {
    return (
        <SafeAreaView style={{ flex: 1 }}>
            <HeaderWithBack title={title} onBackPress={() => router.push("/settings")} />
            <ScrollView contentContainerStyle={styles.container}>
                <Markdown>{content}</Markdown>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 20,
    },
});

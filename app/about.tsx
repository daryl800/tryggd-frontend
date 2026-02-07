// app/about.tsx
import LegalPage from "@/components/LegalPage";
import { useRouter } from "expo-router";

const content = `# About Tryggd

Tryggd is a personal safety and wellbeing check-in application designed to help individuals stay connected with trusted contacts. The app allows users to perform daily or scheduled check-ins and automatically notify selected contacts if a check-in is missed, helping provide peace of mind for individuals, families, and caregivers.

Tryggd is built with **privacy, simplicity, and reliability** in mind. Users maintain full control over who can view their status, who receives notifications, and what information is shared.

Our mission is to provide a lightweight and respectful safety support tool designed for modern independent living across the Nordic region and beyond.

---

## Important Notice

Tryggd is a personal wellbeing check-in and notification tool.  
It is **not an emergency service** and does **not replace emergency numbers such as 112** or professional medical, safety, or rescue services.

Users should always contact local emergency services directly in urgent situations.
`;

export default function About() {
    const router = useRouter();
    return <LegalPage title="About Tryggd" content={content} router={router} />;
}

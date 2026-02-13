// app/terms.tsx
import LegalPage from "@/components/LegalPage";
import { useRouter } from "expo-router";

const content = `# Terms of Service

**Effective date:** 2026-02-01

---

## Service Description

Tryggd provides a voluntary wellbeing check-in and notification service allowing users to notify selected contacts if scheduled check-ins are missed.

Tryggd:

- does **not monitor users in real time**
- does **not guarantee delivery of notifications**
- is **not an emergency response service**

Users must not rely on Tryggd as a substitute for emergency services.

---

## User Responsibilities

Users agree to:

- Provide accurate account information
- Add contacts only with their consent
- Use the service only for lawful purposes
- Maintain the security of their account credentials

---

## Availability

We strive to provide reliable service but do **not guarantee uninterrupted availability**.

---

## Limitation of Liability

To the maximum extent permitted by law, Tryggd shall not be liable for:

- missed or delayed check-ins
- failed or delayed notifications
- network, device, or third-party service failures
- damages resulting from reliance on the service in emergency situations

---

## Account Termination

Users may delete their accounts at any time. We reserve the right to suspend accounts used in violation of these terms.

---

## Governing Law

These terms are governed by the laws of **Sweden**.
`;

export default function Terms() {
    const router = useRouter();
    return <LegalPage title="Terms of Service" content={content} router={router} />;
}

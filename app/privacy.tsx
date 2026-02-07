// app/privacy.tsx
import LegalPage from "@/components/LegalPage";
import { useRouter } from "expo-router";

const content = `# Privacy Policy

**Effective date:** [INSERT DATE]

Tryggd ("we", "our", "us") respects your privacy and processes personal data in accordance with the **General Data Protection Regulation (GDPR)**.

---

## Information We Collect

We may collect and process the following data:

- Account information (email, name)
- Contacts that you explicitly add
- Check-in activity timestamps
- Notification preferences
- Device technical information required for service delivery

---

## Purpose of Processing

We process personal data to:

- Provide check-in and safety notification services
- Maintain user accounts
- Deliver notifications to selected contacts
- Improve service reliability and performance

---

## Legal Basis

Processing is based on:

- User consent (GDPR Article 6(1)(a))
- Contractual necessity (Article 6(1)(b))
- Legitimate interests related to service security (Article 6(1)(f))

---

## Data Sharing

We do **not sell personal data**.  
Data is shared only with essential infrastructure providers required to operate the service.

---

## Data Retention

Personal data is stored only as long as necessary to provide the service or until the user deletes the account.

---

## Your Rights

Under GDPR, you have the right to:

- Access your data
- Correct inaccurate data
- Request deletion
- Restrict processing
- Data portability
- Withdraw consent at any time

Requests may be sent to: **[CONTACT EMAIL]**

---

## No Emergency Processing

Tryggd is **not designed or certified** for emergency detection, medical monitoring, or life-critical use.
`;

export default function Privacy() {
    const router = useRouter();
    return <LegalPage title="Privacy Policy" content={content} router={router} />;
}

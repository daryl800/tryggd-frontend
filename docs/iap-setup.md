# In-App Purchase Setup Guide

Branch: `feature/iap`  
Last updated: 2026-07-19

---

## What's already built

| File | Status | Purpose |
|---|---|---|
| `src/config/iap.ts` | ✅ Done | Product IDs (`tryggd_plus_monthly`, `tryggd_plus_annual`) |
| `src/services/iapService.ts` | ✅ Done | IAP init, purchase, restore, validation routing |
| `src/hooks/useSubscription.ts` | ✅ Done | `isPlusUser`, `purchaseMonthly`, `purchaseAnnual`, `restorePurchases` |
| `src/screens/SubscriptionScreen.tsx` | ✅ Done | Placeholder UI — shows status, purchase buttons |
| `supabase/migrations/20260718100000_iap.sql` | ✅ Done | `subscriptions` + `purchase_events` tables with RLS |
| `supabase/functions/validate-ios-purchase` | ✅ Done | Apple receipt validation (prod + sandbox fallback) |
| `supabase/functions/validate-android-purchase` | ✅ Done | Google Play subscriptionsv2 validation |
| `supabase/functions/apple-subscription-webhook` | ✅ Done | App Store Server Notifications v2 (renewals, refunds, cancellations) |

**Not yet done:**
- Wire `SubscriptionScreen` into app navigation
- Replace pilot preview "Try Plus for free" button with real IAP flow
- iOS pod install for react-native-iap (needed before native build)

---

## Step 1 — Apple App Store setup

> Do this after 4.6.7 is approved (don't touch App Store Connect during review).

1. [App Store Connect](https://appstoreconnect.apple.com) → **My Apps** → Tryggd
2. **Subscriptions** → **Create Subscription Group** → Reference Name: **Tryggd Plus**
3. Inside the group, create two products:

| Product ID | Duration | Reference Name |
|---|---|---|
| `tryggd_plus_monthly` | 1 month | Tryggd Plus Monthly |
| `tryggd_plus_annual` | 1 year | Tryggd Plus Annual |

4. Set pricing, localised display name/description, then **Submit for Review** each product.

### Get the Shared Secret
1. App Store Connect → Tryggd → **Subscriptions** → **App-Specific Shared Secret**
2. Click **Generate** if none exists → copy the 32-character hex string
3. Set the Supabase secret (see Step 3)

### Configure the webhook URL
1. App Store Connect → Tryggd → **Subscriptions** → **App Store Server Notifications**
2. Set the Production URL to:  
   `https://<your-supabase-project-ref>.supabase.co/functions/v1/apple-subscription-webhook`
3. Version: **Version 2**

---

## Step 2 — Google Play setup

> Blocked until the Google Play account owner sets up a **Google Payments merchant account**  
> (Play Console → Setup → Payments profile).

Once unblocked:

### Create subscription products
1. [Google Play Console](https://play.google.com/console) → Tryggd → **Monetize** → **Products** → **Subscriptions**
2. Create:

| Product ID | Billing period |
|---|---|
| `tryggd_plus_monthly` | 1 month |
| `tryggd_plus_annual` | 1 year |

3. Set pricing → **Activate** each one.

### Create a service account
1. [Google Cloud Console](https://console.cloud.google.com) — use the project linked to Play
2. **APIs & Services** → **Library** → enable **Google Play Android Developer API**
3. **IAM & Admin** → **Service Accounts** → **Create Service Account**
   - Name: `tryggd-play-billing`
4. Click the new account → **Keys** → **Add Key** → **Create new key** → **JSON** → download

### Grant the service account access in Play Console
1. Play Console → **Setup** → **API access**
2. Link to the same Google Cloud project
3. Find `tryggd-play-billing` → **Grant access**
4. Permissions: **View financial data** + **Manage orders and subscriptions**

---

## Step 3 — Set Supabase secrets

Run these once you have the values:

```bash
# Apple
supabase secrets set APPLE_SHARED_SECRET=<32-char hex> --project-ref <ref>

# Android
supabase secrets set ANDROID_PACKAGE_NAME=com.marcustechnology.tryggd --project-ref <ref>
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='<paste full JSON>' --project-ref <ref>
```

Or set via Supabase dashboard: **Edge Functions** → **Manage secrets**.

---

## Step 4 — Run the database migration

Run in Supabase SQL editor (or via CLI if local DB is running):

```
supabase/migrations/20260718100000_iap.sql
```

This creates the `subscriptions` and `purchase_events` tables.

---

## Step 5 — Deploy Edge Functions

```bash
supabase functions deploy validate-ios-purchase --project-ref <ref>
supabase functions deploy validate-android-purchase --project-ref <ref>
supabase functions deploy apple-subscription-webhook --project-ref <ref>
```

Deploy `validate-ios-purchase` and `apple-subscription-webhook` after `APPLE_SHARED_SECRET` is set.  
Deploy `validate-android-purchase` after `GOOGLE_SERVICE_ACCOUNT_JSON` is set.

---

## Step 6 — iOS native build (pod install)

`react-native-iap` requires native code. Before building iOS:

```bash
cd ios && pod install && cd ..
```

Then do a fresh EAS build — OTA cannot deliver native module changes.

---

## Step 7 — Merge and ship

```bash
git checkout main
git merge feature/iap
# run migration in Supabase SQL editor
# deploy functions (Step 5)
# build iOS + Android
```

---

## Product IDs summary

| Platform | Monthly | Annual |
|---|---|---|
| iOS (App Store) | `tryggd_plus_monthly` | `tryggd_plus_annual` |
| Android (Play) | `tryggd_plus_monthly` | `tryggd_plus_annual` |

Same IDs on both platforms by design.

import {
  clearProductsIOS,
  endConnection,
  finishTransaction,
  flushFailedPurchasesCachedAsPendingAndroid,
  getSubscriptions,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestSubscription,
  getAvailablePurchases,
  type PurchaseError,
  type SubscriptionPurchase,
  type Subscription,
} from 'react-native-iap';
import { Platform, EmitterSubscription } from 'react-native';
import { supabase } from '@/lib/supabase';
import { ALL_PRODUCT_IDS, PLATFORM } from '../config/iap';

let purchaseUpdateSubscription: EmitterSubscription | null = null;
let purchaseErrorSubscription: EmitterSubscription | null = null;

export async function initializeIAP(): Promise<boolean> {
  try {
    await initConnection();

    if (Platform.OS === 'android') {
      await flushFailedPurchasesCachedAsPendingAndroid();
    }

    return true;
  } catch (err) {
    console.error('[IAP] initializeIAP failed:', err);
    return false;
  }
}

export async function getProducts(): Promise<Subscription[]> {
  try {
    const products = await getSubscriptions({ skus: ALL_PRODUCT_IDS });
    return products;
  } catch (err) {
    console.error('[IAP] getProducts failed:', err);
    return [];
  }
}

export async function purchaseSubscription(
  productId: string,
  onSuccess: (purchase: SubscriptionPurchase) => void,
  onError: (error: PurchaseError) => void,
): Promise<void> {
  // Clean up any previous listeners
  purchaseUpdateSubscription?.remove();
  purchaseErrorSubscription?.remove();

  purchaseUpdateSubscription = purchaseUpdatedListener(async (purchase: SubscriptionPurchase) => {
    if (purchase.transactionReceipt) {
      try {
        await validatePurchase(purchase);
        await finishTransaction({ purchase, isConsumable: false });
        onSuccess(purchase);
      } catch (err) {
        console.error('[IAP] purchase validation failed:', err);
      }
    }
  });

  purchaseErrorSubscription = purchaseErrorListener((error: PurchaseError) => {
    console.error('[IAP] purchaseErrorListener:', error);
    onError(error);
  });

  try {
    await requestSubscription({ sku: productId });
  } catch (err) {
    console.error('[IAP] requestSubscription failed:', err);
    throw err;
  }
}

export async function restorePurchases(): Promise<SubscriptionPurchase[]> {
  try {
    const purchases = await getAvailablePurchases();
    for (const purchase of purchases) {
      await validatePurchase(purchase as SubscriptionPurchase);
    }
    return purchases as SubscriptionPurchase[];
  } catch (err) {
    console.error('[IAP] restorePurchases failed:', err);
    return [];
  }
}

export async function getSubscriptionStatus(userId: string): Promise<{
  isActive: boolean;
  productId: string | null;
  expiresAt: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('product_id, status, expires_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return {
      isActive: !!data,
      productId: data?.product_id ?? null,
      expiresAt: data?.expires_at ?? null,
    };
  } catch (err) {
    console.error('[IAP] getSubscriptionStatus failed:', err);
    return { isActive: false, productId: null, expiresAt: null };
  }
}

export async function destroyIAP(): Promise<void> {
  purchaseUpdateSubscription?.remove();
  purchaseErrorSubscription?.remove();
  purchaseUpdateSubscription = null;
  purchaseErrorSubscription = null;

  if (Platform.OS === 'ios') {
    clearProductsIOS();
  }

  await endConnection();
}

// Internal — routes receipt to the correct Edge Function based on platform
async function validatePurchase(purchase: SubscriptionPurchase): Promise<void> {
  const functionName =
    PLATFORM === 'ios' ? 'validate-ios-purchase' : 'validate-android-purchase';

  const payload =
    PLATFORM === 'ios'
      ? { receipt: purchase.transactionReceipt, productId: purchase.productId }
      : { purchaseToken: purchase.purchaseToken, productId: purchase.productId };

  const { error } = await supabase.functions.invoke(functionName, { body: payload });

  if (error) {
    throw new Error(`[IAP] ${functionName} error: ${error.message}`);
  }
}

import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { type PurchaseError, type SubscriptionPurchase } from 'react-native-iap';
import {
  initializeIAP,
  getProducts,
  purchaseSubscription,
  restorePurchases,
  getSubscriptionStatus,
  destroyIAP,
} from '../services/iapService';
import { IAP_PRODUCT_IDS } from '../config/iap';
import { supabase } from '@/lib/supabase';

interface SubscriptionState {
  isPlusUser: boolean;
  productId: string | null;
  expiresAt: string | null;
  loading: boolean;
  purchasing: boolean;
  error: string | null;
}

export function useSubscription() {
  const [state, setState] = useState<SubscriptionState>({
    isPlusUser: false,
    productId: null,
    expiresAt: null,
    loading: true,
    purchasing: false,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    async function setup() {
      await initializeIAP();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;

      const status = await getSubscriptionStatus(user.id);
      if (mounted) {
        setState(prev => ({
          ...prev,
          isPlusUser: status.isActive,
          productId: status.productId,
          expiresAt: status.expiresAt,
          loading: false,
        }));
      }
    }

    setup();

    return () => {
      mounted = false;
      destroyIAP();
    };
  }, []);

  const purchase = useCallback(async (productId: string) => {
    setState(prev => ({ ...prev, purchasing: true, error: null }));

    await purchaseSubscription(
      productId,
      async (_purchase: SubscriptionPurchase) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const status = await getSubscriptionStatus(user.id);
        setState(prev => ({
          ...prev,
          isPlusUser: status.isActive,
          productId: status.productId,
          expiresAt: status.expiresAt,
          purchasing: false,
        }));
      },
      (error: PurchaseError) => {
        // E_USER_CANCELLED is not an error worth showing
        if (error.code !== 'E_USER_CANCELLED') {
          setState(prev => ({ ...prev, error: error.message, purchasing: false }));
        } else {
          setState(prev => ({ ...prev, purchasing: false }));
        }
      },
    );
  }, []);

  const purchaseMonthly = useCallback(
    () => purchase(IAP_PRODUCT_IDS.monthly),
    [purchase],
  );

  const purchaseAnnual = useCallback(
    () => purchase(IAP_PRODUCT_IDS.annual),
    [purchase],
  );

  const restore = useCallback(async () => {
    setState(prev => ({ ...prev, purchasing: true, error: null }));
    try {
      await restorePurchases();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const status = await getSubscriptionStatus(user.id);
      setState(prev => ({
        ...prev,
        isPlusUser: status.isActive,
        productId: status.productId,
        expiresAt: status.expiresAt,
        purchasing: false,
      }));

      if (!status.isActive) {
        Alert.alert('No subscription found', 'No active subscription was found to restore.');
      }
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message, purchasing: false }));
    }
  }, []);

  return {
    isPlusUser: state.isPlusUser,
    productId: state.productId,
    expiresAt: state.expiresAt,
    loading: state.loading,
    purchasing: state.purchasing,
    error: state.error,
    purchaseMonthly,
    purchaseAnnual,
    restorePurchases: restore,
  };
}

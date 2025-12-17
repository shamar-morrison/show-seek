import { auth, db, functions } from '@/src/firebase/config';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { Purchase } from 'react-native-iap';
import * as RNIap from 'react-native-iap';

// Product ID for the one-time premium purchase
const PREMIUM_PRODUCT_ID = 'premium_unlock';
const PRODUCT_IDS = Platform.select({
  android: [PREMIUM_PRODUCT_ID],
  default: [],
});

interface PremiumState {
  isPremium: boolean;
  isLoading: boolean;
  purchasePremium: () => Promise<boolean>;
  restorePurchases: () => Promise<void>;
  price: string | null;
}

interface ValidationResponse {
  success: boolean;
  message?: string;
}

import { onAuthStateChanged, User } from 'firebase/auth';

export const [PremiumProvider, usePremium] = createContextHook<PremiumState>(() => {
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [price, setPrice] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(auth.currentUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Initialize IAP and fetch products
  useEffect(() => {
    const initIAP = async () => {
      try {
        await RNIap.initConnection();
        if (PRODUCT_IDS && PRODUCT_IDS.length > 0) {
          const products = await RNIap.fetchProducts({ skus: PRODUCT_IDS });
          if (products) {
            const premiumProduct = products.find((p) => p.id === PREMIUM_PRODUCT_ID);
            if (premiumProduct && premiumProduct.platform === 'android') {
              const androidProduct = premiumProduct as RNIap.ProductAndroid;
              setPrice(
                androidProduct.oneTimePurchaseOfferDetailsAndroid?.formattedPrice ||
                  androidProduct.displayPrice
              );
            }
          }
        }
      } catch (err) {
        console.warn('IAP Initialization error:', err);
      }
    };

    initIAP();

    return () => {
      RNIap.endConnection();
    };
  }, []);

  // Listen to user's premium status in Firestore
  useEffect(() => {
    if (!user) {
      setIsPremium(false);
      setIsLoading(false);
      return;
    }

    const checkLocalCache = async () => {
      try {
        const cached = await AsyncStorage.getItem(`isPremium_${user.uid}`);
        if (cached === 'true') {
          setIsPremium(true);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('Failed to read premium cache:', err);
      }
    };
    checkLocalCache();

    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      async (docSync) => {
        const data = docSync.data();
        const premiumStatus = data?.premium?.isPremium === true;
        setIsPremium(premiumStatus);
        setIsLoading(false);

        // Update local cache
        try {
          await AsyncStorage.setItem(`isPremium_${user.uid}`, String(premiumStatus));
        } catch (err) {
          console.warn('Failed to write premium cache:', err);
        }
      },
      (err) => {
        console.error('Error fetching premium status:', err);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const purchasePremium = async () => {
    try {
      if (!PRODUCT_IDS || PRODUCT_IDS.length === 0) throw new Error('No products available');

      const purchase = await RNIap.requestPurchase({
        type: 'in-app',
        request: {
          android: {
            skus: [PREMIUM_PRODUCT_ID],
          },
        },
      });

      // If purchase is null/undefined, user dismissed the sheet - silently return false
      if (!purchase) {
        return false;
      }

      // Handle both single object and array return types
      const purchaseData = Array.isArray(purchase) ? purchase[0] : purchase;

      // If purchaseData is null/undefined after array handling, silently return false
      if (!purchaseData) {
        return false;
      }

      // Validate with server
      const validatePurchaseFn = httpsCallable(functions, 'validatePurchase');
      const validationResult = await validatePurchaseFn({
        purchaseToken: purchaseData.purchaseToken,
        productId: purchaseData.productId,
      });
      const data = validationResult.data as ValidationResponse;

      // Always finish transaction to avoid pending state
      try {
        await RNIap.finishTransaction({
          purchase: purchaseData,
          isConsumable: false,
        });
      } catch (finishErr) {
        console.error('Error finishing transaction:', finishErr);
      }

      if (data?.success === true) {
        setIsPremium(true);
        return true;
      } else {
        setIsPremium(false);
        throw new Error('Purchase validation failed on server');
      }
    } catch (err: any) {
      // User cancelled - silently return false without error
      if (err.code === 'E_USER_CANCELLED') {
        return false;
      }
      // User already owns item - try to restore and set premium
      if (err.message?.includes('already own') || err.code === 'E_ALREADY_OWNED') {
        try {
          console.log('User already owns item, attempting restore...');
          await restorePurchases();
          console.log('Restore successful after already-owned error');
          return true;
        } catch (restoreErr: any) {
          console.error('Failed to restore after already-owned:', restoreErr);
          // Throw the RESTORE error so we know why it failed, explicitly mentioning it
          throw new Error(
            'Restoration failed: ' + (restoreErr.message || JSON.stringify(restoreErr))
          );
        }
      }
      console.error('Purchase error:', err);
      throw err;
    }
  };

  const restorePurchases = async () => {
    try {
      console.log('Starting restorePurchases...');
      const purchases = await RNIap.getAvailablePurchases();
      console.log('Available purchases found:', purchases.length);

      // Ensure we check arrays if purchases contain them
      const premiumPurchase = purchases.find((p: Purchase) => p.productId === PREMIUM_PRODUCT_ID);

      if (premiumPurchase && premiumPurchase.purchaseToken) {
        console.log(
          'Found premium purchase token, validating:',
          premiumPurchase.purchaseToken.substring(0, 10) + '...'
        );
        // Validate with server
        const validatePurchaseFn = httpsCallable(functions, 'validatePurchase');
        const validationResult = await validatePurchaseFn({
          purchaseToken: premiumPurchase.purchaseToken,
          productId: premiumPurchase.productId,
        });
        const data = validationResult.data as ValidationResponse;
        console.log('Validation response:', data);

        if (data?.success === true) {
          setIsPremium(true);
          try {
            await RNIap.finishTransaction({
              purchase: premiumPurchase,
              isConsumable: false,
            });
            console.log('Transaction finished successfully');
          } catch (finishErr) {
            console.error('Error finishing transaction during restore:', finishErr);
          }
        } else {
          console.error('Validation failed:', data);
          throw new Error('Server validation failed: ' + (data?.message || 'Unknown server error'));
        }
      } else {
        console.log('No premium purchase found in history or missing token');
      }
    } catch (err: any) {
      console.error('Restore error detail:', err);
      // Ensure we treat Cloud Function errors clearly
      if (
        err.code === 'functions/internal' ||
        err.code === 'functions/unknown' ||
        err.code === 'internal'
      ) {
        throw new Error('Cloud Function Error: ' + err.message + ' check Firebase console logs');
      }
      throw err;
    }
  };

  return {
    isPremium,
    isLoading,
    purchasePremium,
    restorePurchases,
    price,
  };
});

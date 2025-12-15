import { auth, db, functions } from '@/src/firebase/config';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
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
  purchasePremium: () => Promise<void>;
  restorePurchases: () => Promise<void>;
  price: string | null;
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
        // flushFailedPurchasesCachedAsPendingAndroid is deprecated/removed in newer versions or named differently
        // We can skip it or use if available, but for now removing to fix build

        if (PRODUCT_IDS && PRODUCT_IDS.length > 0) {
          // @ts-ignore - getProducts is valid but types might be outdated or mismatched in this version
          const products = await RNIap.getProducts({ skus: PRODUCT_IDS });
          const premiumProduct = products.find((p: any) => p.productId === PREMIUM_PRODUCT_ID);
          if (premiumProduct) {
            setPrice(
              premiumProduct.oneTimePurchaseOfferDetails?.formattedPrice || premiumProduct.price
            );
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
      const cached = await AsyncStorage.getItem(`isPremium_${user.uid}`);
      if (cached === 'true') {
        setIsPremium(true);
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
        await AsyncStorage.setItem(`isPremium_${user.uid}`, String(premiumStatus));
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

      // Use 'skus' for Android
      // @ts-ignore - Types mismatch across versions, force skus for Android
      const purchase = await RNIap.requestPurchase({
        skus: [PREMIUM_PRODUCT_ID],
        andDangerouslyFinishTransactionAutomaticallyIOS: false,
      } as any);

      if (purchase) {
        // Handle both single object and array return types
        const purchaseData = Array.isArray(purchase) ? purchase[0] : purchase;

        if (!purchaseData) return;

        // Validate with server
        const validatePurchaseFn = httpsCallable(functions, 'validatePurchase');
        const validationResult: any = await validatePurchaseFn({
          purchaseToken: purchaseData.purchaseToken,
          productId: purchaseData.productId,
        });

        if (validationResult.data?.success) {
          await RNIap.finishTransaction({ purchase: purchaseData, isConsumable: false });
          setIsPremium(true);
        } else {
          throw new Error('Purchase validation failed on server');
        }
      }
    } catch (err: any) {
      if (err.code === 'E_USER_CANCELLED') {
        // User cancelled, do nothing
        return;
      }
      console.error('Purchase error:', err);
      throw err;
    }
  };

  const restorePurchases = async () => {
    try {
      const purchases = await RNIap.getAvailablePurchases();
      // Ensure we check arrays if purchases contain them
      const premiumPurchase = purchases.find((p: any) => p.productId === PREMIUM_PRODUCT_ID);

      if (premiumPurchase) {
        // Validate with server
        const validatePurchaseFn = httpsCallable(functions, 'validatePurchase');
        const validationResult: any = await validatePurchaseFn({
          purchaseToken: premiumPurchase.purchaseToken,
          productId: premiumPurchase.productId,
        });

        if (validationResult.data?.success) {
          setIsPremium(true);
        }
      }
    } catch (err) {
      console.error('Restore error:', err);
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

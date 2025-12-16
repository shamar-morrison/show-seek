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

      if (purchase) {
        // Handle both single object and array return types
        const purchaseData = Array.isArray(purchase) ? purchase[0] : purchase;

        if (!purchaseData) {
          throw new Error('No purchase data returned from store');
        }

        // Validate with server
        const validatePurchaseFn = httpsCallable(functions, 'validatePurchase');
        const validationResult: any = await validatePurchaseFn({
          purchaseToken: purchaseData.purchaseToken,
          productId: purchaseData.productId,
        });

        // Always finish transaction to avoid pending state
        try {
          await RNIap.finishTransaction({
            purchase: purchaseData,
            isConsumable: false,
          });
        } catch (finishErr) {
          console.error('Error finishing transaction:', finishErr);
        }

        if (validationResult.data?.success === true) {
          setIsPremium(true);
        } else {
          setIsPremium(false);
          throw new Error('Purchase validation failed on server');
        }
      } else {
        throw new Error('No purchase response from store');
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
          try {
            await RNIap.finishTransaction({
              purchase: premiumPurchase,
              isConsumable: false,
            });
          } catch (finishErr) {
            console.error('Error finishing transaction during restore:', finishErr);
          }
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

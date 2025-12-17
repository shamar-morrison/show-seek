import { auth, db, functions } from '@/src/firebase/config';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
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
  restorePurchases: () => Promise<boolean>;
  resetTestPurchase: () => Promise<void>;
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

  // Process a purchase: validate with server and finish transaction
  const processPurchase = async (purchase: Purchase) => {
    try {
      console.log('Processing purchase:', purchase.productId);

      if (!purchase.purchaseToken) {
        console.error('Purchase missing token', purchase);
        return;
      }

      const validatePurchaseFn = httpsCallable(functions, 'validatePurchase');
      const validationResult = await validatePurchaseFn({
        purchaseToken: purchase.purchaseToken,
        productId: purchase.productId,
      });
      const data = validationResult.data as ValidationResponse;
      console.log('Validation response:', data);

      if (data?.success === true) {
        setIsPremium(true);
        try {
          // Acknowledge/finish transaction
          await RNIap.finishTransaction({
            purchase: purchase,
            isConsumable: false,
          });
          console.log('Transaction finished successfully');
        } catch (finishErr) {
          console.error('Error finishing transaction:', finishErr);
        }
      } else {
        console.error('Validation failed:', data);
        // Only throw if called directly? Listeners swallow errors usually.
      }
    } catch (err) {
      console.error('Error processing purchase:', err);
    }
  };

  // Initialize IAP listeners
  useEffect(() => {
    let purchaseUpdateSubscription: any;
    let purchaseErrorSubscription: any;

    const initListeners = async () => {
      try {
        await RNIap.initConnection();

        // Listen for successful purchases
        purchaseUpdateSubscription = RNIap.purchaseUpdatedListener(async (purchase: Purchase) => {
          console.log('Purchase Updated Listener triggered:', purchase);

          if (purchase.purchaseToken || (purchase as any).transactionReceipt) {
            console.log('Receipt/Token found, processing...');
            await processPurchase(purchase);
          } else {
            console.log('No transaction receipt/token in purchase object');
          }
        });

        // Listen for purchase errors
        purchaseErrorSubscription = RNIap.purchaseErrorListener((error: any) => {
          console.warn('Purchase notification error:', error);
          // We don't necessarily update state here as UI handles specific errors from requestPurchase
        });

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

    initListeners();

    return () => {
      if (purchaseUpdateSubscription) {
        purchaseUpdateSubscription.remove();
      }
      if (purchaseErrorSubscription) {
        purchaseErrorSubscription.remove();
      }
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

      // Note: We don't await the result's purchase object because waiting for it
      // is unreliable. We rely on purchaseUpdatedListener instead.
      await RNIap.requestPurchase({
        type: 'in-app',
        request: {
          android: {
            skus: [PREMIUM_PRODUCT_ID],
          },
        },
      });

      // We return true indicating the REQUEST was successful.
      // Actual success (premium unlock) happens asynchronously via listener.
      return true;
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

      if (premiumPurchase) {
        // Reuse the same processing logic
        await processPurchase(premiumPurchase);
        return true;
      } else {
        console.log('No premium purchase found in history or missing token');
        return false;
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

  const resetTestPurchase = async () => {
    try {
      if (Platform.OS === 'android') {
        const purchases = await RNIap.getAvailablePurchases();
        const premiumPurchase = purchases.find((p) => p.productId === PREMIUM_PRODUCT_ID);
        if (premiumPurchase && premiumPurchase.purchaseToken) {
          await RNIap.consumePurchaseAndroid(premiumPurchase.purchaseToken);
          setIsPremium(false);
          Alert.alert('Reset Complete', 'Purchase consumed. You can now buy it again.');
        } else {
          Alert.alert('No Purchase Found', 'Could not find a purchase to consume.');
        }
      }
    } catch (err: any) {
      console.error('Reset error:', err);
      Alert.alert('Reset Failed', err.message);
    }
  };

  return {
    isPremium,
    isLoading,
    purchasePremium,
    restorePurchases,
    resetTestPurchase,
    price,
  };
});

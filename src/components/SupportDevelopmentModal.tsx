import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { modalHeaderStyles, modalLayoutStyles } from '@/src/styles/modalStyles';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Check, Copy, X } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const CRYPTO_ADDRESSES = {
  btc: '38A7ex8s75Gmngv5L9vSVko1Ate6avqqiG',
  eth: '0xed72c4db6c322dc5f2263e2ac310b1b6aabf4d23',
};

interface SupportDevelopmentModalProps {
  visible: boolean;
  onClose: () => void;
}

interface CryptoCardProps {
  name: string;
  symbol: string;
  shortSymbol: string;
  address: string;
  iconColor: string;
  iconBgColor: string;
}

function CryptoCard({
  name,
  symbol,
  shortSymbol,
  address,
  iconColor,
  iconBgColor,
}: CryptoCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(address);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [address]);

  return (
    <View style={styles.cryptoCard}>
      {/* Header with icon and name */}
      <View style={styles.cryptoHeader}>
        <View style={[styles.cryptoIcon, { backgroundColor: iconBgColor }]}>
          <Text style={[styles.cryptoIconText, { color: iconColor }]}>{symbol}</Text>
        </View>
        <Text style={styles.cryptoName}>
          {name} ({shortSymbol})
        </Text>
      </View>

      {/* Address with copy button */}
      <View style={styles.addressContainer}>
        <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
          {address}
        </Text>
        <TouchableOpacity
          style={styles.copyButton}
          onPress={handleCopy}
          activeOpacity={ACTIVE_OPACITY}
        >
          {copied ? (
            <Check size={18} color={COLORS.success} />
          ) : (
            <Copy size={18} color={COLORS.textSecondary} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function SupportDevelopmentModal({
  visible,
  onClose,
}: SupportDevelopmentModalProps) {
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={modalLayoutStyles.container}>
        <ModalBackground />
        <TouchableOpacity
          style={modalLayoutStyles.backdrop}
          activeOpacity={1}
          onPress={handleClose}
        />

        <View style={modalLayoutStyles.card}>
          {/* Header */}
          <View style={modalHeaderStyles.header}>
            <Text style={modalHeaderStyles.title}>Support Development 🙏</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={ACTIVE_OPACITY}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Message */}
          <Text style={styles.message}>
            We don't put ads in our app because we put our users and their experience first. If you
            enjoy the app and want to support development and future features, please consider
            donating. Your support means a lot!
          </Text>

          {/* Crypto Cards */}
          <View style={styles.cryptoList}>
            <CryptoCard
              name="Bitcoin"
              shortSymbol="BTC"
              symbol="₿"
              address={CRYPTO_ADDRESSES.btc}
              iconColor="#F7931A"
              iconBgColor="rgba(247, 147, 26, 0.15)"
            />
            <CryptoCard
              name="Ethereum"
              shortSymbol="ETH"
              symbol="Ξ"
              address={CRYPTO_ADDRESSES.eth}
              iconColor="#627EEA"
              iconBgColor="rgba(98, 126, 234, 0.15)"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  message: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: SPACING.l,
  },
  cryptoList: {
    gap: SPACING.m,
  },
  cryptoCard: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.m,
  },
  cryptoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.s,
    gap: SPACING.s,
  },
  cryptoIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cryptoIconText: {
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
  },
  cryptoName: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.s,
    paddingVertical: SPACING.s,
    paddingHorizontal: SPACING.m,
  },
  addressText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
    flex: 1,
  },
  copyButton: {
    padding: SPACING.xs,
    marginLeft: SPACING.s,
  },
});

import { AppIcon } from '@/src/components/ui/AppIcon';
import { PreferenceItem } from '@/src/components/profile/PreferenceItem';
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { useImagesSettled } from '@/src/hooks/useImagesSettled';
import { useShareCardPreferences } from '@/src/hooks/useShareCardPreferences';
import { ArrowRight01Icon, Download01Icon, Share02Icon } from '@hugeicons/core-free-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Keyboard,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { ShareCard } from './ShareCard';
import { ShareCardStyleSheet, ShareCardStyleSheetRef } from './ShareCardStyleSheet';
import { getShareCardImageKeys } from './shareCardImages';
import {
  SHARE_CARD_DIMENSIONS,
  SHARE_CARD_FORMAT_KEYS,
  SHARE_CARD_NOTE_MAX_LENGTH,
  ShareCardData,
  ShareCardFormat,
  ShareCardIdentity,
} from './shareCardTypes';

type BusyAction = 'sharing' | 'saving' | null;

interface ShareCardEditorProps {
  /** The cards to choose from. The first shows by default; more adds a picker. */
  cards: ShareCardData[];
}

export default function ShareCardEditor({ cards }: ShareCardEditorProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { user, isGuest } = useAuth();
  const insets = useSafeAreaInsets();
  const {
    format,
    showIdentity,
    style: cardStyle,
    isLoaded,
    updatePreferences,
  } = useShareCardPreferences();

  const [activeKind, setActiveKind] = useState(cards[0].kind);
  const data = cards.find((card) => card.kind === activeKind) ?? cards[0];

  const cardRef = useRef<View>(null);
  const toastRef = useRef<ToastRef>(null);
  const noteInputRef = useRef<TextInput>(null);
  const styleSheetRef = useRef<ShareCardStyleSheetRef>(null);
  const [note, setNote] = useState('');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const screenRef = useRef<View>(null);
  const [screenBottom, setScreenBottom] = useState(0);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);

  const availableIdentity = useMemo<ShareCardIdentity | null>(() => {
    if (isGuest) return null;
    const displayName = user?.displayName?.trim() || null;
    const photoUrl = user?.photoURL || null;
    return displayName || photoUrl ? { displayName, photoUrl } : null;
  }, [isGuest, user?.displayName, user?.photoURL]);
  const identity = showIdentity ? availableIdentity : null;

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => setKeyboardTop(event.endCoordinates.screenY)
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardTop(null);
        // Android's back gesture closes the keyboard without blurring the input.
        noteInputRef.current?.blur();
        setIsEditingNote(false);
      }
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Pasted text can still contain line breaks, which would throw off the card's layout.
  const cardNote = note.replace(/\s+/g, ' ').trim() || null;

  const imageKeys = getShareCardImageKeys(data, format, identity, cardStyle);
  // Remounting per configuration makes every image report its load again.
  const captureKey = `${data.kind}|${format}|${cardStyle}|${imageKeys.join('|')}`;
  const { isReady: imagesReady, markSettled } = useImagesSettled(imageKeys, captureKey);

  const canCapture = isLoaded && imagesReady;
  const isBusy = busyAction !== null;

  const capture = useCallback(
    () =>
      captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        ...SHARE_CARD_DIMENSIONS[format],
      }),
    [format]
  );

  const handleShare = useCallback(async () => {
    setBusyAction('sharing');

    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        toastRef.current?.show(t('shareCard.sharingNotAvailable'));
        return;
      }

      const uri = await capture();
      // Most apps drop text shared alongside an image, so offer it for pasting.
      await Clipboard.setStringAsync(t('shareCard.caption'));
      toastRef.current?.show(t('shareCard.captionCopied'));

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: t('shareCard.dialogTitle'),
        UTI: 'public.png',
      });
    } catch (error) {
      console.error('[ShareCardEditor] Failed to share:', error);
      toastRef.current?.show(t('shareCard.failedToShare'));
    } finally {
      setBusyAction(null);
    }
  }, [capture, t]);

  const handleSave = useCallback(async () => {
    setBusyAction('saving');

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== 'granted') {
        toastRef.current?.show(t('shareCard.permissionDenied'));
        return;
      }

      const uri = await capture();
      await MediaLibrary.saveToLibraryAsync(uri);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toastRef.current?.show(t('shareCard.savedToGallery'));
    } catch (error) {
      console.error('[ShareCardEditor] Failed to save:', error);
      toastRef.current?.show(t('shareCard.failedToSave'));
    } finally {
      setBusyAction(null);
    }
  }, [capture, t]);

  const handleScreenLayout = useCallback((event: LayoutChangeEvent) => {
    setScreenBottom(event.nativeEvent.layout.height);
    // The screen sits below the header, and the keyboard's position is relative to the window.
    screenRef.current?.measureInWindow((_x, y, _width, height) => setScreenBottom(y + height));
  }, []);

  const handleStageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStageSize({ width, height });
  }, []);

  const cardOptions = cards.map((card) => ({
    key: card.kind,
    label: t(`shareCard.card_${card.kind}`),
  }));

  const formatOptions = SHARE_CARD_FORMAT_KEYS.map((key) => ({
    key,
    label: t(`shareCard.${key}`),
  }));

  // Keeps the note field above the keyboard. This is padding inside the screen, so it cannot
  // change the screen's own size, which KeyboardAvoidingView looped on when the keyboard closed.
  const keyboardInset = keyboardTop === null ? 0 : Math.max(screenBottom - keyboardTop, 0);

  const dimensions = SHARE_CARD_DIMENSIONS[format];
  const previewScale = stageSize
    ? Math.min(stageSize.width / dimensions.width, stageSize.height / dimensions.height)
    : 0;

  return (
    <View
      ref={screenRef}
      style={[
        styles.screen,
        {
          paddingBottom: keyboardInset > 0 ? keyboardInset + SPACING.s : insets.bottom + SPACING.m,
        },
      ]}
      onLayout={handleScreenLayout}
      testID="share-card-screen"
    >
      <Pressable
        style={styles.stage}
        onLayout={handleStageLayout}
        onPress={() => noteInputRef.current?.blur()}
        accessible={false}
        testID="share-card-stage"
      >
        {previewScale > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.preview,
              {
                width: dimensions.width * previewScale,
                height: dimensions.height * previewScale,
              },
            ]}
            testID="share-card-preview"
          >
            <View
              style={{
                ...dimensions,
                transform: [{ scale: previewScale }],
                transformOrigin: 'top left',
              }}
            >
              <ShareCard
                data={data}
                format={format}
                identity={identity}
                note={cardNote}
                cardStyle={cardStyle}
              />
            </View>
          </View>
        )}
      </Pressable>

      {/* Changing the card mid-export would capture it at the wrong size, and changing it before
          the saved preferences load would have that read overwrite the choice. */}
      <View
        style={styles.controls}
        pointerEvents={isBusy || !isLoaded ? 'none' : 'auto'}
        testID="share-card-controls"
      >
        <Pressable
          style={styles.noteField}
          onPress={() => noteInputRef.current?.focus()}
          accessible={false}
          testID="share-card-note-field"
        >
          <TextInput
            ref={noteInputRef}
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            onFocus={() => setIsEditingNote(true)}
            onBlur={() => setIsEditingNote(false)}
            placeholder={t('shareCard.notePlaceholder')}
            placeholderTextColor={COLORS.textSecondary}
            selectionColor={accentColor}
            keyboardAppearance="dark"
            maxLength={SHARE_CARD_NOTE_MAX_LENGTH}
            returnKeyType="done"
            accessibilityLabel={t('shareCard.notePlaceholder')}
            testID="share-card-note-input"
          />
          <Text style={styles.noteCount} testID="share-card-note-count">
            {`${note.length}/${SHARE_CARD_NOTE_MAX_LENGTH}`}
          </Text>
        </Pressable>

        {/* Hidden while typing so the card stays visible above the keyboard. */}
        {!isEditingNote && (
          <>
            {cards.length > 1 && (
              <SegmentedControl
                options={cardOptions}
                activeKey={data.kind}
                onChange={(key: ShareCardData['kind']) => setActiveKind(key)}
                testID="share-card-kind"
              />
            )}
            <SegmentedControl
              options={formatOptions}
              activeKey={format}
              onChange={(key: ShareCardFormat) => updatePreferences({ format: key })}
              testID="share-card-format"
            />

            <Pressable
              style={styles.styleButton}
              onPress={() => styleSheetRef.current?.present()}
              accessibilityRole="button"
              accessibilityLabel={t('shareCard.styleLabel')}
              testID="share-card-style-button"
            >
              <Text style={styles.styleButtonLabel}>{t('shareCard.styleLabel')}</Text>
              <View style={styles.styleButtonValue}>
                <Text style={styles.styleButtonText} numberOfLines={1}>
                  {t(`shareCard.style_${cardStyle}`)}
                </Text>
                <AppIcon icon={ArrowRight01Icon} size={20} color={COLORS.textSecondary} />
              </View>
            </Pressable>

            {availableIdentity && (
              <PreferenceItem
                label={t('shareCard.showIdentity')}
                subtitle={t('shareCard.showIdentityHint')}
                value={showIdentity}
                onValueChange={(value) => updatePreferences({ showIdentity: value })}
              />
            )}

            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: accentColor },
                  (!canCapture || isBusy) && styles.disabledButton,
                  pressed && { opacity: ACTIVE_OPACITY },
                ]}
                onPress={handleShare}
                disabled={!canCapture || isBusy}
                testID="share-card-share"
              >
                {busyAction === 'sharing' || !canCapture ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <AppIcon icon={Share02Icon} size={20} color={COLORS.white} />
                    <Text style={styles.actionButtonText} numberOfLines={1}>
                      {t('shareCard.share')}
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.saveButton,
                  { borderColor: accentColor },
                  (!canCapture || isBusy) && styles.disabledButton,
                  pressed && { opacity: ACTIVE_OPACITY },
                ]}
                onPress={handleSave}
                disabled={!canCapture || isBusy}
                testID="share-card-save"
              >
                {busyAction === 'saving' ? (
                  <ActivityIndicator size="small" color={accentColor} />
                ) : (
                  <>
                    <AppIcon icon={Download01Icon} size={20} color={accentColor} />
                    <Text style={[styles.saveButtonText, { color: accentColor }]} numberOfLines={1}>
                      {t('shareCard.save')}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </>
        )}
      </View>

      <Toast ref={toastRef} />

      {/* Full-size copy used for capture; capturing the scaled preview would lose quality. */}
      <View
        style={styles.captureContainer}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="share-card-capture"
      >
        <ShareCard
          key={captureKey}
          ref={cardRef}
          data={data}
          format={format}
          identity={identity}
          note={cardNote}
          cardStyle={cardStyle}
          onImageSettled={markSettled}
        />
      </View>

      <ShareCardStyleSheet
        ref={styleSheetRef}
        data={data}
        format={format}
        identity={identity}
        note={cardNote}
        activeStyle={cardStyle}
        onSelect={(style) => updatePreferences({ style })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    gap: SPACING.m,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    overflow: 'hidden',
    borderRadius: BORDER_RADIUS.l,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.surfaceLight,
  },
  controls: {
    gap: SPACING.m,
  },
  styleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.m,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  styleButtonLabel: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.medium,
    color: COLORS.text,
  },
  styleButtonValue: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  styleButtonText: {
    flexShrink: 1,
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.regular,
    color: COLORS.textSecondary,
  },
  noteField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  noteInput: {
    flex: 1,
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.m,
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.regular,
    color: COLORS.text,
  },
  noteCount: {
    paddingRight: SPACING.m,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.regular,
    color: COLORS.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.m,
    // Halves the gap `controls` puts between the buttons and the row above them.
    marginTop: -SPACING.s,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
  },
  saveButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  actionButtonText: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.white,
  },
  saveButtonText: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.bold,
  },
  disabledButton: {
    opacity: 0.5,
  },
  captureContainer: {
    position: 'absolute',
    left: -9999,
    top: -9999,
  },
});

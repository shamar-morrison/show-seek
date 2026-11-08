import { AppIcon } from '@/src/components/ui/AppIcon';
import { CollapsibleFeatureItem } from '@/src/components/ui/CollapsibleCategory';
import { BORDER_RADIUS, COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { modalHeaderStyles, modalSheetStyles } from '@/src/styles/modalStyles';
import {
  Bookmark02Icon,
  FavouriteIcon,
  Film01Icon,
  Folder01Icon,
  InformationCircleIcon,
  Note01Icon,
  Notification01Icon,
  Settings01Icon,
  StarIcon,
  TickDouble01Icon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Preferred scroll area height as a fraction of the window height. */
const SCROLL_HEIGHT_RATIO = 0.6;
/** Room kept for the title, Done button and sheet padding. */
const SHEET_CHROME_HEIGHT = 180;

export interface DataExportInfoSheetRef {
  present: () => Promise<void>;
}

/** Explains what the data export contains and what it leaves out. */
export const DataExportInfoSheet = forwardRef<DataExportInfoSheetRef>(
  function DataExportInfoSheet(_props, ref) {
    const { t } = useTranslation();
    const { accentColor } = useAccentColor();
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<TrueSheet>(null);
    const scrollMaxHeight = Math.max(
      160,
      Math.min(
        height * SCROLL_HEIGHT_RATIO,
        height - insets.top - insets.bottom - SHEET_CHROME_HEIGHT
      )
    );

    useImperativeHandle(ref, () => ({
      present: async () => {
        await sheetRef.current?.present();
      },
    }));

    return (
      <TrueSheet
        ref={sheetRef}
        detents={['auto']}
        cornerRadius={BORDER_RADIUS.l}
        backgroundColor={COLORS.surface}
        grabber={true}
      >
        <GestureHandlerRootView style={[modalSheetStyles.content, { width }]}>
          <View style={modalHeaderStyles.header}>
            <Text style={modalHeaderStyles.title}>{t('dataExport.infoTitle')}</Text>
          </View>

          <ScrollView
            style={{ maxHeight: scrollMaxHeight }}
            showsVerticalScrollIndicator
            nestedScrollEnabled={true}
            testID="data-export-info-scroll"
          >
            <View style={styles.inlineNote}>
              <AppIcon icon={InformationCircleIcon} size={16} color={COLORS.textSecondary} />
              <Text style={styles.inlineNoteText}>{t('dataExport.durationNote')}</Text>
            </View>

            <Text style={styles.sectionTitle}>{t('dataExport.whatGetsExportedTitle')}</Text>
            <CollapsibleFeatureItem
              text={t('dataExport.features.listsTitle')}
              description={t('dataExport.features.listsDescription')}
              icon={Bookmark02Icon}
            />
            <CollapsibleFeatureItem
              text={t('dataExport.features.ratingsTitle')}
              description={t('dataExport.features.ratingsDescription')}
              icon={StarIcon}
            />
            <CollapsibleFeatureItem
              text={t('dataExport.features.watchedEpisodesTitle')}
              description={t('dataExport.features.watchedEpisodesDescription')}
              icon={TickDouble01Icon}
            />
            <CollapsibleFeatureItem
              text={t('dataExport.features.favoriteEpisodesTitle')}
              description={t('dataExport.features.favoriteEpisodesDescription')}
              icon={FavouriteIcon}
            />
            <CollapsibleFeatureItem
              text={t('dataExport.features.notesTitle')}
              description={t('dataExport.features.notesDescription')}
              icon={Note01Icon}
            />
            <CollapsibleFeatureItem
              text={t('dataExport.features.favoritePeopleTitle')}
              description={t('dataExport.features.favoritePeopleDescription')}
              icon={UserMultipleIcon}
            />

            <Text style={styles.sectionTitle}>{t('dataExport.notIncludedTitle')}</Text>
            <CollapsibleFeatureItem
              text={t('dataExport.notIncluded.movieRewatchesTitle')}
              description={t('dataExport.notIncluded.movieRewatchesDescription')}
              icon={Film01Icon}
            />
            <CollapsibleFeatureItem
              text={t('dataExport.notIncluded.remindersTitle')}
              description={t('dataExport.notIncluded.remindersDescription')}
              icon={Notification01Icon}
            />
            <CollapsibleFeatureItem
              text={t('dataExport.notIncluded.collectionsTitle')}
              description={t('dataExport.notIncluded.collectionsDescription')}
              icon={Folder01Icon}
            />
            <CollapsibleFeatureItem
              text={t('dataExport.notIncluded.settingsTitle')}
              description={t('dataExport.notIncluded.settingsDescription')}
              icon={Settings01Icon}
            />
          </ScrollView>

          <Pressable
            style={[styles.doneButton, { backgroundColor: accentColor }]}
            onPress={() => {
              void sheetRef.current?.dismiss();
            }}
            accessibilityRole="button"
            testID="data-export-info-done"
          >
            <Text style={styles.doneButtonText}>{t('common.done')}</Text>
          </Pressable>
        </GestureHandlerRootView>
      </TrueSheet>
    );
  }
);

const styles = StyleSheet.create({
  doneButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.l,
    justifyContent: 'center',
    marginTop: SPACING.m,
    minHeight: 48,
  },
  doneButtonText: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.m,
  },
  inlineNote: {
    alignItems: 'flex-start',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    flexDirection: 'row',
    gap: SPACING.s,
    padding: SPACING.m,
  },
  inlineNoteText: {
    color: COLORS.textSecondary,
    flex: 1,
    fontSize: FONT_SIZE.s,
    lineHeight: 18,
  },
  sectionTitle: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.s,
    marginTop: SPACING.l,
    textTransform: 'uppercase',
  },
});

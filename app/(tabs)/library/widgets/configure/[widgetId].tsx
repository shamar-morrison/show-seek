import { ListSelector } from '@/src/components/widgets/ListSelector';
import { WidgetTypeSelector } from '@/src/components/widgets/WidgetTypeSelector';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { useWidgets } from '@/src/hooks/useWidgets';
import { WidgetConfig } from '@/src/types';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Save } from 'lucide-react-native';
import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const SIZES = ['small', 'medium', 'large'] as const;

export default function ConfigureWidgetScreen() {
  const { widgetId } = useLocalSearchParams<{ widgetId: string }>();
  const { user } = useAuth();
  const { widgets, addWidget, updateWidget, loading: widgetsLoading } = useWidgets(user?.uid);
  const router = useRouter();
  const navigation = useNavigation();

  const [type, setType] = useState<WidgetConfig['type']>('upcoming-movies');
  const [size, setSize] = useState<WidgetConfig['size']>('medium');
  const [listId, setListId] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  const isNew = widgetId === 'new';

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isNew ? 'New Widget' : 'Configure Widget',
    });
  }, [navigation, isNew]);

  useEffect(() => {
    if (!isNew && !widgetsLoading) {
      const widget = widgets.find((w) => w.id === widgetId);
      if (widget) {
        setType(widget.type);
        setSize(widget.size);
        setListId(widget.listId);
      }
    }
  }, [widgetId, widgets, widgetsLoading, isNew]);

  const handleSave = async () => {
    if (type === 'watchlist' && !listId) {
      Alert.alert('Error', 'Please select a watchlist to display.');
      return;
    }

    setIsSaving(true);
    try {
      if (isNew) {
        await addWidget({
          type,
          size,
          listId: type === 'watchlist' ? listId : undefined,
        });
      } else {
        await updateWidget(widgetId, {
          type,
          size,
          listId: type === 'watchlist' ? listId : undefined,
        });
      }
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to save widget configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Widget Type</Text>
        <WidgetTypeSelector selectedType={type} onSelect={setType} />

        <Text style={styles.sectionTitle}>Widget Size</Text>
        <View style={styles.sizeContainer}>
          {SIZES.map((s) => (
            <Pressable
              key={s}
              style={[styles.sizeButton, size === s && styles.selectedSizeButton]}
              onPress={() => setSize(s)}
            >
              <Text style={[styles.sizeText, size === s && styles.selectedSizeText]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {type === 'watchlist' && <ListSelector selectedListId={listId} onSelect={setListId} />}

        <View style={styles.previewContainer}>
          <Text style={styles.sectionTitle}>Preview Description</Text>
          <Text style={styles.previewText}>
            {type === 'upcoming-movies' &&
              `Shows up to ${size === 'small' ? 1 : size === 'medium' ? 3 : 5} upcoming movie releases.`}
            {type === 'upcoming-tv' &&
              `Shows up to ${size === 'small' ? 1 : size === 'medium' ? 3 : 5} upcoming TV show releases.`}
            {type === 'watchlist' &&
              `Shows up to ${size === 'small' ? 1 : size === 'medium' ? 3 : 5} items from your selected watchlist.`}
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.saveButton, isSaving && styles.disabledButton]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Save size={20} color={COLORS.white} />
              <Text style={styles.saveButtonText}>Save Configuration</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.l,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginBottom: SPACING.m,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sizeContainer: {
    flexDirection: 'row',
    gap: SPACING.m,
    marginBottom: SPACING.xl,
  },
  sizeButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectedSizeButton: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  sizeText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
  },
  selectedSizeText: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  previewContainer: {
    marginTop: SPACING.l,
    padding: SPACING.m,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
  },
  previewText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    lineHeight: 20,
  },
  footer: {
    padding: SPACING.l,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceLight,
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.s,
  },
  disabledButton: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: FONT_SIZE.m,
  },
});

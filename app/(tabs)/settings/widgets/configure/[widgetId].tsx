import { ListSelector } from '@/src/components/widgets/ListSelector';
import { WidgetTypeSelector } from '@/src/components/widgets/WidgetTypeSelector';
import { COLORS } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { useWidgets, WidgetConfig } from '@/src/hooks/useWidgets';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Save } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SIZES = ['small', 'medium', 'large'] as const;

export default function ConfigureWidgetScreen() {
  const { widgetId } = useLocalSearchParams<{ widgetId: string }>();
  const { user } = useAuth();
  const { widgets, addWidget, loading: widgetsLoading } = useWidgets(user?.uid);
  const router = useRouter();

  const [type, setType] = useState<WidgetConfig['type']>('upcoming-movies');
  const [size, setSize] = useState<WidgetConfig['size']>('medium');
  const [listId, setListId] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  const isNew = widgetId === 'new';

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
        // Edit logic would go here, for now we just handle new
        // Library updates for edit are similar to add
        Alert.alert(
          'Info',
          'Editing existing widgets is coming soon. For now, please delete and re-add.'
        );
      }
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to save widget configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isNew ? 'New Widget' : 'Configure Widget'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Widget Type</Text>
        <WidgetTypeSelector selectedType={type} onSelect={setType} />

        <Text style={styles.sectionTitle}>Widget Size</Text>
        <View style={styles.sizeContainer}>
          {SIZES.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.sizeButton, size === s && styles.selectedSizeButton]}
              onPress={() => setSize(s)}
            >
              <Text style={[styles.sizeText, size === s && styles.selectedSizeText]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
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
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.disabledButton]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Save size={20} color="#000" />
              <Text style={styles.saveButtonText}>Save Configuration</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  scrollContent: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sizeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  sizeButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    paddingVertical: 12,
    borderRadius: 8,
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
    fontSize: 14,
  },
  selectedSizeText: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  previewContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
  },
  previewText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceLight,
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

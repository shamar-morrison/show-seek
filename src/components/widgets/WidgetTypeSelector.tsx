import { COLORS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { Film, List, Tv } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const TYPES = [
  { id: 'upcoming-movies', label: 'Movies', icon: Film },
  { id: 'upcoming-tv', label: 'TV Shows', icon: Tv },
  { id: 'watchlist', label: 'Watchlist', icon: List },
] as const;

interface WidgetTypeSelectorProps {
  selectedType: string;
  onSelect: (type: any) => void;
}

export function WidgetTypeSelector({ selectedType, onSelect }: WidgetTypeSelectorProps) {
  const { accentColor } = useAccentColor();
  return (
    <View style={styles.container}>
      {TYPES.map((type) => {
        const Icon = type.icon;
        const isSelected = selectedType === type.id;

        return (
          <Pressable
            key={type.id}
            style={[
              styles.typeButton,
              isSelected && [
                styles.selectedButton,
                { borderColor: accentColor, backgroundColor: accentColor + '10' },
              ],
            ]}
            onPress={() => onSelect(type.id)}
          >
            <Icon size={24} color={isSelected ? accentColor : COLORS.textSecondary} />
            <Text
              style={[
                styles.typeLabel,
                isSelected && [styles.selectedLabel, { color: accentColor }],
              ]}
            >
              {type.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  typeButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectedButton: {
  },
  typeLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  selectedLabel: {
    fontWeight: 'bold',
  },
});

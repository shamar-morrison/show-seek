import { getImageUrl, TMDB_IMAGE_SIZES, type CrewMember } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, SPACING } from '@/src/constants/theme';
import React, { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useDetailStyles } from './detailStyles';
import type { CrewSectionProps } from './types';

// Priority roles to show (in order)
const PRIORITY_ROLES = ['Director', 'Writer', 'Screenplay', 'Story', 'Editor', 'Cinematography'];

// Memoized crew card component to prevent unnecessary re-renders
const CrewCard = memo<{
  member: CrewMember;
  onPress: (id: number) => void;
}>(({ member, onPress }) => {
  const styles = useDetailStyles();
  const handlePress = useCallback(() => {
    onPress(member.id);
  }, [member.id, onPress]);

  return (
    <TouchableOpacity
      style={styles.castCard}
      onPress={handlePress}
      activeOpacity={ACTIVE_OPACITY}
    >
      <MediaImage
        source={{
          uri: getImageUrl(member.profile_path, TMDB_IMAGE_SIZES.profile.medium),
        }}
        style={styles.castImage}
        contentFit="cover"
        placeholderType="person"
      />
      <Text style={styles.castName} numberOfLines={2}>
        {member.name}
      </Text>
      <Text style={styles.characterName} numberOfLines={1}>
        {member.job}
      </Text>
    </TouchableOpacity>
  );
});

CrewCard.displayName = 'CrewCard';

export const CrewSection = memo<CrewSectionProps>(
  ({ crew, onCrewPress, style }) => {
    const { t } = useTranslation();
    const styles = useDetailStyles();

    // Filter and sort crew by priority roles
    const priorityCrew = useMemo(() => {
      const filtered = crew.filter((member) => PRIORITY_ROLES.includes(member.job));

      // Sort by priority order
      return filtered.sort((a, b) => {
        const aIndex = PRIORITY_ROLES.indexOf(a.job);
        const bIndex = PRIORITY_ROLES.indexOf(b.job);
        return aIndex - bIndex;
      });
    }, [crew]);

    if (priorityCrew.length === 0) {
      return null;
    }

    return (
      <View style={[style, { marginTop: -SPACING.m }]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('media.crew')}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.castList}>
          {priorityCrew.map((member) => (
            <CrewCard key={`${member.id}-${member.job}`} member={member} onPress={onCrewPress} />
          ))}
        </ScrollView>
      </View>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.crew.length === nextProps.crew.length &&
      (prevProps.crew.length === 0 || prevProps.crew[0]?.id === nextProps.crew[0]?.id) &&
      prevProps.onCrewPress === nextProps.onCrewPress &&
      prevProps.style === nextProps.style
    );
  }
);

CrewSection.displayName = 'CrewSection';

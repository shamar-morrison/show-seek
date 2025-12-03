import { ACTIVE_OPACITY, SPACING } from '@/constants/theme';
import React, { memo, useCallback, useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { detailStyles } from './detailStyles';
import type { CrewSectionProps } from './types';

// Priority roles to show (in order)
const PRIORITY_ROLES = ['Director', 'Writer', 'Screenplay', 'Story', 'Editor', 'Cinematography'];

export const CrewSection = memo<CrewSectionProps>(
  ({ crew, onCrewPress, style }) => {
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
      <View style={[detailStyles.crewContainer, style]}>
        <Text style={detailStyles.sectionTitle}>Crew</Text>
        {priorityCrew.map((member) => (
          <CrewItem key={`${member.id}-${member.job}`} member={member} onPress={onCrewPress} />
        ))}
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

// Memoized crew item component
const CrewItem = memo<{
  member: {
    id: number;
    name: string;
    job: string;
    department: string;
    profile_path: string | null;
  };
  onPress: (id: number) => void;
}>(({ member, onPress }) => {
  const handlePress = useCallback(() => {
    onPress(member.id);
  }, [member.id, onPress]);

  return (
    <TouchableOpacity
      style={detailStyles.crewItem}
      onPress={handlePress}
      activeOpacity={ACTIVE_OPACITY}
    >
      <Text style={detailStyles.crewJob}>{member.job}</Text>
      <Text style={detailStyles.crewName} numberOfLines={1}>
        {member.name}
      </Text>
    </TouchableOpacity>
  );
});

CrewItem.displayName = 'CrewItem';

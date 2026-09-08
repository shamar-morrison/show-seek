import { ArrowUpDownIcon } from '@hugeicons/core-free-icons';
import type { ListAction } from '@/src/components/ListActionsModal';
import i18n from '@/src/i18n';

interface SortActionOptions {
  onPress: () => void;
  showBadge?: boolean;
}

export const createSortAction = ({ onPress, showBadge }: SortActionOptions): ListAction => ({
  id: 'sort',
  icon: ArrowUpDownIcon,
  label: i18n.t('library.sortItems'),
  onPress,
  showBadge,
});

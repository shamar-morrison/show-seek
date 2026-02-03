import { ArrowUpDown } from 'lucide-react-native';
import type { ListAction } from '@/src/components/ListActionsModal';

interface SortActionOptions {
  onPress: () => void;
  showBadge?: boolean;
}

export const createSortAction = ({ onPress, showBadge }: SortActionOptions): ListAction => ({
  id: 'sort',
  icon: ArrowUpDown,
  label: 'Sort Items',
  onPress,
  showBadge,
});

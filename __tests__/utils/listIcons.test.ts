import { getListMembershipIcon, MULTIPLE_LISTS_COLOR } from '@/src/utils/listIcons';
import {
  Bookmark02Icon,
  CheckListIcon,
  FavouriteIcon,
  Folder01Icon,
} from '@hugeicons/core-free-icons';

describe('getListMembershipIcon', () => {
  it('shows nothing for an entry in no list', () => {
    expect(getListMembershipIcon([], '#ff0000')).toBeNull();
  });

  it("shows the list's own icon and color for an entry in one list", () => {
    expect(getListMembershipIcon(['favorites'], '#ff0000')).toEqual({
      icon: FavouriteIcon,
      color: '#ff0000',
    });
    expect(getListMembershipIcon(['watchlist'], '#ff0000')).toEqual({
      icon: Bookmark02Icon,
      color: '#3b82f6',
    });
    expect(getListMembershipIcon(['my-list'], '#ff0000')?.icon).toBe(Folder01Icon);
  });

  it('shows the multiple-lists icon only for an entry in several lists', () => {
    expect(getListMembershipIcon(['watchlist', 'my-list'], '#ff0000')).toEqual({
      icon: CheckListIcon,
      color: MULTIPLE_LISTS_COLOR,
    });
  });
});

import { COLORS, hexToRGBA } from '@/src/constants/theme';
import {
  getListMembershipIcon,
  getListMembershipTint,
  MULTIPLE_LISTS_COLOR,
} from '@/src/utils/listIcons';
import {
  Bookmark02Icon,
  CheckCheckIcon,
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

  it('shows the double check for an entry only in Already Watched', () => {
    expect(getListMembershipIcon(['already-watched'], '#ff0000')).toEqual({
      icon: CheckCheckIcon,
      color: COLORS.success,
    });
  });

  it('shows the multiple-lists icon only for an entry in several lists', () => {
    expect(getListMembershipIcon(['watchlist', 'my-list'], '#ff0000')).toEqual({
      icon: CheckListIcon,
      color: MULTIPLE_LISTS_COLOR,
    });
  });
});

describe('getListMembershipTint', () => {
  it("tints with the list's color, or the multiple-lists color, never the accent", () => {
    expect(getListMembershipTint(getListMembershipIcon(['watchlist'], '#ff0000'))).toEqual({
      backgroundColor: hexToRGBA('#3b82f6', 0.15),
      borderColor: hexToRGBA('#3b82f6', 0.5),
    });
    expect(
      getListMembershipTint(getListMembershipIcon(['watchlist', 'my-list'], '#ff0000'))
    ).toEqual({
      backgroundColor: hexToRGBA(MULTIPLE_LISTS_COLOR, 0.15),
      borderColor: hexToRGBA(MULTIPLE_LISTS_COLOR, 0.5),
    });
  });

  it('adds no tint for an entry in no list', () => {
    expect(getListMembershipTint(getListMembershipIcon([], '#ff0000'))).toBeUndefined();
  });
});

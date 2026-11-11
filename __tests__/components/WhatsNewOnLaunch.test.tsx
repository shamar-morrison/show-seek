import { WhatsNewOnLaunch } from '@/src/components/WhatsNewOnLaunch';
import { render } from '@testing-library/react-native';
import React from 'react';

const mockMarkSeen = jest.fn();
let mockState: { announcement: { id: string; sections: unknown[] } | null } = {
  announcement: null,
};
let capturedSheetProps: any = null;

jest.mock('@/src/hooks/useWhatsNew', () => ({
  useWhatsNew: () => ({
    ...mockState,
    shouldShow: !!mockState.announcement,
    markSeen: mockMarkSeen,
  }),
}));
jest.mock('@/src/components/WhatsNewSheet', () => ({
  WhatsNewSheet: (props: any) => {
    capturedSheetProps = props;
    return null;
  },
}));

describe('WhatsNewOnLaunch', () => {
  beforeEach(() => {
    capturedSheetProps = null;
    mockMarkSeen.mockClear();
  });

  it('shows the sheet, with its usual settling delay, when this launch has an announcement', () => {
    mockState = { announcement: { id: 'nov', sections: [] } };
    render(<WhatsNewOnLaunch />);

    expect(capturedSheetProps.announcement).toEqual({ id: 'nov', sections: [] });
    expect(capturedSheetProps.presentDelayMs).toBeUndefined();
    capturedSheetProps.onDismiss();
    expect(mockMarkSeen).toHaveBeenCalled();
  });

  it('shows nothing otherwise', () => {
    mockState = { announcement: null };
    render(<WhatsNewOnLaunch />);
    expect(capturedSheetProps).toBeNull();
  });
});

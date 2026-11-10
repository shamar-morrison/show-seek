import FilterPresetSheets, {
  type FilterPresetSheetsRef,
} from '@/src/components/filters/FilterPresetSheets';
import { DEFAULT_WATCH_STATUS_FILTERS } from '@/src/utils/listFilters';
import type { ListFilterPreset } from '@/src/utils/filterPresets';
import { act, render } from '@testing-library/react-native';
import React, { createRef } from 'react';
import { Alert } from 'react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Each sheet is replaced by a stub that records its props and whether it was presented.
const mockSheets: Record<string, { props: any; present: jest.Mock; dismiss: jest.Mock }> = {};

function mockSheet(name: string) {
  const React = require('react');
  const Stub = React.forwardRef((props: any, ref: any) => {
    mockSheets[name] = mockSheets[name] ?? {
      props,
      present: jest.fn(async () => {}),
      dismiss: jest.fn(async () => {}),
    };
    mockSheets[name].props = props;
    React.useImperativeHandle(ref, () => ({
      present: mockSheets[name].present,
      dismiss: mockSheets[name].dismiss,
    }));
    return null;
  });
  Stub.displayName = name;
  return { __esModule: true, default: Stub };
}

jest.mock('@/src/components/ListActionsModal', () => mockSheet('actions'));
jest.mock('@/src/components/filters/ManagePresetsSheet', () => mockSheet('manage'));
jest.mock('@/src/components/filters/PresetNameSheet', () => mockSheet('name'));

const preset: ListFilterPreset = {
  id: 'p1',
  scope: 'list',
  name: 'Dramas',
  filters: { ...DEFAULT_WATCH_STATUS_FILTERS, genres: [18] },
  createdAt: new Date(2026, 0, 1),
};

const setup = (overrides: Partial<React.ComponentProps<typeof FilterPresetSheets>> = {}) => {
  const handlers = {
    hideParent: jest.fn(async () => {}),
    showParent: jest.fn(async () => {}),
    onApply: jest.fn(),
    onCreate: jest.fn(),
    onRename: jest.fn(),
    onUpdate: jest.fn(),
    onDelete: jest.fn(),
  };
  const ref = createRef<FilterPresetSheetsRef>();
  render(
    <FilterPresetSheets
      ref={ref}
      presets={[preset]}
      currentSummary="Horror · 7+ stars"
      describePreset={() => 'Drama'}
      validateName={() => null}
      getUpdateBlocker={() => null}
      {...handlers}
      {...overrides}
    />
  );
  return { ref, ...handlers };
};

const action = (id: string) =>
  mockSheets.actions.props.actions.find((a: { id: string }) => a.id === id);

describe('FilterPresetSheets', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockSheets)) delete mockSheets[key];
    jest.clearAllMocks();
  });

  it('long press hides the filters, shows the options, and brings the filters back', async () => {
    const { ref, hideParent, showParent } = setup();

    await act(async () => {
      await ref.current?.openActions(preset);
    });
    expect(hideParent).toHaveBeenCalled();
    expect(mockSheets.actions.present).toHaveBeenCalled();
    expect(mockSheets.actions.props.title).toBe('Dramas');

    act(() => mockSheets.actions.props.onDidDismiss());
    expect(showParent).toHaveBeenCalled();
  });

  it('Rename opens the name sheet once the options close, then returns to the filters', async () => {
    const { ref, onRename, showParent } = setup();
    await act(async () => {
      await ref.current?.openActions(preset);
    });

    act(() => action('rename').onPress());
    await act(async () => mockSheets.actions.props.onDidDismiss());
    expect(mockSheets.name.present).toHaveBeenCalledWith({
      mode: 'rename',
      name: 'Dramas',
      summary: 'Drama',
    });
    expect(showParent).not.toHaveBeenCalled();

    act(() => mockSheets.name.props.onSubmit('Old dramas'));
    expect(onRename).toHaveBeenCalledWith(preset, 'Old dramas');
    act(() => mockSheets.name.props.onDidDismiss());
    expect(showParent).toHaveBeenCalled();
  });

  it('Delete asks first, then deletes and returns to the filters', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { ref, onDelete, showParent } = setup();
    await act(async () => {
      await ref.current?.openActions(preset);
    });

    act(() => action('delete').onPress());
    act(() => mockSheets.actions.props.onDidDismiss());
    expect(alertSpy).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls[0][2] as { style?: string; onPress?: () => void }[];
    act(() => buttons.find((b) => b.style === 'destructive')?.onPress?.());
    expect(onDelete).toHaveBeenCalledWith(preset);
    expect(showParent).toHaveBeenCalled();
  });

  it('disables Update when the current filters cannot replace the preset', async () => {
    const { ref } = setup({ getUpdateBlocker: () => 'noFilters' });
    await act(async () => {
      await ref.current?.openActions(preset);
    });
    expect(action('update').disabled).toBe(true);
  });

  it('applying from Manage closes it without bringing the filters back', async () => {
    const { ref, onApply, showParent } = setup();
    await act(async () => {
      await ref.current?.openManage();
    });
    expect(mockSheets.manage.present).toHaveBeenCalled();

    act(() => mockSheets.manage.props.onApply(preset));
    expect(mockSheets.manage.dismiss).toHaveBeenCalled();
    act(() => mockSheets.manage.props.onDidDismiss());

    expect(onApply).toHaveBeenCalledWith(preset);
    expect(showParent).not.toHaveBeenCalled();
  });

  it('renaming from Manage returns to Manage', async () => {
    const { ref } = setup();
    await act(async () => {
      await ref.current?.openManage();
    });

    act(() => mockSheets.manage.props.onRename(preset));
    await act(async () => mockSheets.manage.props.onDidDismiss());
    expect(mockSheets.name.present).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'rename' })
    );

    mockSheets.manage.present.mockClear();
    act(() => mockSheets.name.props.onDidDismiss());
    expect(mockSheets.manage.present).toHaveBeenCalled();
  });

  it('Save names the current filters, then returns to the filters', async () => {
    const { ref, hideParent, onCreate, showParent } = setup();
    await act(async () => {
      await ref.current?.openSave();
    });
    expect(hideParent).toHaveBeenCalled();
    expect(mockSheets.name.present).toHaveBeenCalledWith({
      mode: 'create',
      name: undefined,
      summary: 'Horror · 7+ stars',
    });

    act(() => mockSheets.name.props.onSubmit('Scary'));
    expect(onCreate).toHaveBeenCalledWith('Scary');
    act(() => mockSheets.name.props.onDidDismiss());
    expect(showParent).toHaveBeenCalled();
  });

  it('checks a rename against other names only', async () => {
    const validateName = jest.fn(() => null);
    const { ref } = setup({ validateName });
    await act(async () => {
      await ref.current?.openActions(preset);
    });
    act(() => action('rename').onPress());
    await act(async () => mockSheets.actions.props.onDidDismiss());

    mockSheets.name.props.validateName('Dramas');
    expect(validateName).toHaveBeenCalledWith('Dramas', 'p1');
  });
});

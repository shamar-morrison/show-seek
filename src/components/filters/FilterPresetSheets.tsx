import ListActionsModal, {
  type ListAction,
  type ListActionsModalRef,
} from '@/src/components/ListActionsModal';
import ManagePresetsSheet, {
  type ManagePresetsSheetRef,
} from '@/src/components/filters/ManagePresetsSheet';
import PresetNameSheet, { type PresetNameSheetRef } from '@/src/components/filters/PresetNameSheet';
import { COLORS } from '@/src/constants/theme';
import type { FilterPreset, PresetNameError, SavePresetBlocker } from '@/src/utils/filterPresets';
import { Delete02Icon, PencilEdit01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react-native';
import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

export interface FilterPresetSheetsRef {
  /** Options for one preset (the long press on its chip). */
  openActions: (preset: FilterPreset) => Promise<void>;
  /** The full list of presets. */
  openManage: () => Promise<void>;
  /** Names the filters being edited as a new preset. */
  openSave: () => Promise<void>;
}

interface FilterPresetSheetsProps {
  presets: readonly FilterPreset[];
  activePresetId?: string;
  hiddenCount?: number;
  /** One-line summary of the filters being edited, shown when saving. */
  currentSummary: string;
  describePreset: (preset: FilterPreset) => string;
  getPresetIcon?: (preset: FilterPreset) => IconSvgElement | undefined;
  validateName: (name: string, ignoreId?: string) => PresetNameError | null;
  /** Why a preset can't be replaced with the filters being edited, or null when it can. */
  getUpdateBlocker: (preset: FilterPreset) => SavePresetBlocker | null;
  /** Hides the filter sheet while a preset sheet is open; its unapplied picks are kept. */
  hideParent: () => Promise<void>;
  /** Brings the filter sheet back afterwards. */
  showParent: () => Promise<void>;
  /** Applies a preset. The filter sheet is already hidden by then. */
  onApply: (preset: FilterPreset) => void;
  onCreate: (name: string) => void;
  onRename: (preset: FilterPreset, name: string) => void;
  onUpdate: (preset: FilterPreset) => void;
  onDelete: (preset: FilterPreset) => void;
}

/** What happens once the sheet on screen has closed. */
type NextStep =
  | { kind: 'parent' }
  | { kind: 'apply'; preset: FilterPreset }
  | { kind: 'confirmDelete'; preset: FilterPreset }
  | {
      kind: 'name';
      mode: 'create' | 'rename';
      preset?: FilterPreset;
      returnTo: 'parent' | 'manage';
    }
  | { kind: 'manage' };

/**
 * The sheets behind saved presets: options for one preset, the full list, and naming. Only one
 * sheet is on screen at a time (like Add to list → New list): the filter sheet steps aside
 * while these are open and comes back after, with its unapplied picks intact.
 */
const FilterPresetSheets = forwardRef<FilterPresetSheetsRef, FilterPresetSheetsProps>(
  (
    {
      presets,
      activePresetId,
      hiddenCount,
      currentSummary,
      describePreset,
      getPresetIcon,
      validateName,
      getUpdateBlocker,
      hideParent,
      showParent,
      onApply,
      onCreate,
      onRename,
      onUpdate,
      onDelete,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const actionsRef = useRef<ListActionsModalRef>(null);
    const manageRef = useRef<ManagePresetsSheetRef>(null);
    const nameRef = useRef<PresetNameSheetRef>(null);
    const nextRef = useRef<NextStep>({ kind: 'parent' });
    const nameContextRef = useRef<Extract<NextStep, { kind: 'name' }> | null>(null);
    const [actionsPreset, setActionsPreset] = useState<FilterPreset | null>(null);

    const presentName = useCallback(
      async (step: Extract<NextStep, { kind: 'name' }>) => {
        nameContextRef.current = step;
        await nameRef.current?.present({
          mode: step.mode,
          name: step.preset?.name,
          summary: step.preset ? describePreset(step.preset) : currentSummary,
        });
      },
      [currentSummary, describePreset]
    );

    const confirmDelete = useCallback(
      (preset: FilterPreset, afterwards?: () => void) => {
        Alert.alert(
          t('filterPresets.deleteConfirmTitle'),
          t('filterPresets.deleteConfirmMessage', { name: preset.name }),
          [
            { text: t('common.cancel'), style: 'cancel', onPress: afterwards },
            {
              text: t('common.delete'),
              style: 'destructive',
              onPress: () => {
                onDelete(preset);
                afterwards?.();
              },
            },
          ],
          { cancelable: true, onDismiss: afterwards }
        );
      },
      [onDelete, t]
    );

    /** Runs the step queued before the last sheet closed, then resets to "back to filters". */
    const runNextStep = useCallback(() => {
      const step = nextRef.current;
      nextRef.current = { kind: 'parent' };
      switch (step.kind) {
        case 'apply':
          onApply(step.preset);
          return;
        case 'name':
          void presentName(step);
          return;
        case 'manage':
          void manageRef.current?.present();
          return;
        case 'confirmDelete':
          confirmDelete(step.preset, () => void showParent());
          return;
        case 'parent':
        default:
          void showParent();
      }
    }, [confirmDelete, onApply, presentName, showParent]);

    useImperativeHandle(ref, () => ({
      openActions: async (preset) => {
        setActionsPreset(preset);
        nextRef.current = { kind: 'parent' };
        await hideParent();
        await actionsRef.current?.present();
      },
      openManage: async () => {
        nextRef.current = { kind: 'parent' };
        await hideParent();
        await manageRef.current?.present();
      },
      openSave: async () => {
        await hideParent();
        await presentName({ kind: 'name', mode: 'create', returnTo: 'parent' });
      },
    }));

    const actions: ListAction[] = actionsPreset
      ? [
          {
            id: 'rename',
            icon: PencilEdit01Icon,
            label: t('filterPresets.rename'),
            onPress: () => {
              nextRef.current = {
                kind: 'name',
                mode: 'rename',
                preset: actionsPreset,
                returnTo: 'parent',
              };
            },
          },
          {
            id: 'update',
            icon: RefreshIcon,
            label: t('filterPresets.updateWithCurrent'),
            disabled: getUpdateBlocker(actionsPreset) !== null,
            onPress: () => onUpdate(actionsPreset),
          },
          {
            id: 'delete',
            icon: Delete02Icon,
            label: t('common.delete'),
            color: COLORS.error,
            onPress: () => {
              nextRef.current = { kind: 'confirmDelete', preset: actionsPreset };
            },
          },
        ]
      : [];

    const handleNameSubmit = (name: string) => {
      const context = nameContextRef.current;
      if (!context) return;
      if (context.mode === 'rename' && context.preset) {
        onRename(context.preset, name);
      } else {
        onCreate(name);
      }
    };

    const handleNameDismissed = () => {
      const context = nameContextRef.current;
      nameContextRef.current = null;
      nextRef.current = context?.returnTo === 'manage' ? { kind: 'manage' } : { kind: 'parent' };
      runNextStep();
    };

    return (
      <>
        <ListActionsModal
          ref={actionsRef}
          title={actionsPreset?.name}
          actions={actions}
          onDidDismiss={runNextStep}
        />
        <ManagePresetsSheet
          ref={manageRef}
          presets={presets}
          activePresetId={activePresetId}
          hiddenCount={hiddenCount}
          describePreset={describePreset}
          getPresetIcon={getPresetIcon}
          onApply={(preset) => {
            nextRef.current = { kind: 'apply', preset };
            void manageRef.current?.dismiss();
          }}
          onRename={(preset) => {
            nextRef.current = { kind: 'name', mode: 'rename', preset, returnTo: 'manage' };
            void manageRef.current?.dismiss();
          }}
          onDelete={(preset) => confirmDelete(preset)}
          onDidDismiss={runNextStep}
        />
        <PresetNameSheet
          ref={nameRef}
          validateName={(name) =>
            validateName(
              name,
              nameContextRef.current?.mode === 'rename'
                ? nameContextRef.current.preset?.id
                : undefined
            )
          }
          onSubmit={handleNameSubmit}
          onDidDismiss={handleNameDismissed}
        />
      </>
    );
  }
);

FilterPresetSheets.displayName = 'FilterPresetSheets';

export default FilterPresetSheets;

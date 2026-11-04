import { type PreparedTvTimeImport } from '@/src/utils/tvtimeImport/prepare';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface TvTimeImportFlowContextValue {
  clearPreparedImport: () => void;
  preparedImport: PreparedTvTimeImport | null;
  setPreparedImport: (prepared: PreparedTvTimeImport | null) => void;
}

const TvTimeImportFlowContext = createContext<TvTimeImportFlowContextValue | null>(null);

interface TvTimeImportFlowProviderProps {
  children: React.ReactNode;
  initialPreparedImport?: PreparedTvTimeImport | null;
}

/** Hands the parsed export from the select screen to the progress screen. */
export function TvTimeImportFlowProvider({
  children,
  initialPreparedImport = null,
}: TvTimeImportFlowProviderProps) {
  const [preparedImport, setPreparedImportState] = useState<PreparedTvTimeImport | null>(
    initialPreparedImport
  );

  const setPreparedImport = useCallback((prepared: PreparedTvTimeImport | null) => {
    setPreparedImportState(prepared);
  }, []);

  const clearPreparedImport = useCallback(() => {
    setPreparedImportState(null);
  }, []);

  const value = useMemo<TvTimeImportFlowContextValue>(
    () => ({ clearPreparedImport, preparedImport, setPreparedImport }),
    [clearPreparedImport, preparedImport, setPreparedImport]
  );

  return (
    <TvTimeImportFlowContext.Provider value={value}>{children}</TvTimeImportFlowContext.Provider>
  );
}

export function useTvTimeImportFlow() {
  const context = useContext(TvTimeImportFlowContext);

  if (!context) {
    throw new Error('useTvTimeImportFlow must be used within a TvTimeImportFlowProvider');
  }

  return context;
}

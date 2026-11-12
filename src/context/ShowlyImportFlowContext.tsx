import { type PreparedShowlyImport } from '@/src/utils/showlyImport/prepare';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface ShowlyImportFlowContextValue {
  clearPreparedImport: () => void;
  preparedImport: PreparedShowlyImport | null;
  setPreparedImport: (prepared: PreparedShowlyImport | null) => void;
}

const ShowlyImportFlowContext = createContext<ShowlyImportFlowContextValue | null>(null);

interface ShowlyImportFlowProviderProps {
  children: React.ReactNode;
  initialPreparedImport?: PreparedShowlyImport | null;
}

/** Hands the parsed backup from the select screen to the progress screen. */
export function ShowlyImportFlowProvider({
  children,
  initialPreparedImport = null,
}: ShowlyImportFlowProviderProps) {
  const [preparedImport, setPreparedImportState] = useState<PreparedShowlyImport | null>(
    initialPreparedImport
  );

  const setPreparedImport = useCallback((prepared: PreparedShowlyImport | null) => {
    setPreparedImportState(prepared);
  }, []);

  const clearPreparedImport = useCallback(() => {
    setPreparedImportState(null);
  }, []);

  const value = useMemo<ShowlyImportFlowContextValue>(
    () => ({ clearPreparedImport, preparedImport, setPreparedImport }),
    [clearPreparedImport, preparedImport, setPreparedImport]
  );

  return (
    <ShowlyImportFlowContext.Provider value={value}>{children}</ShowlyImportFlowContext.Provider>
  );
}

export function useShowlyImportFlow() {
  const context = useContext(ShowlyImportFlowContext);

  if (!context) {
    throw new Error('useShowlyImportFlow must be used within a ShowlyImportFlowProvider');
  }

  return context;
}

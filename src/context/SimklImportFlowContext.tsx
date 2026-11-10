import { type PreparedSimklImport } from '@/src/utils/simklImport/prepare';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface SimklImportFlowContextValue {
  clearPreparedImport: () => void;
  preparedImport: PreparedSimklImport | null;
  setPreparedImport: (prepared: PreparedSimklImport | null) => void;
}

const SimklImportFlowContext = createContext<SimklImportFlowContextValue | null>(null);

interface SimklImportFlowProviderProps {
  children: React.ReactNode;
  initialPreparedImport?: PreparedSimklImport | null;
}

/** Hands the parsed backup from the select screen to the progress screen. */
export function SimklImportFlowProvider({
  children,
  initialPreparedImport = null,
}: SimklImportFlowProviderProps) {
  const [preparedImport, setPreparedImportState] = useState<PreparedSimklImport | null>(
    initialPreparedImport
  );

  const setPreparedImport = useCallback((prepared: PreparedSimklImport | null) => {
    setPreparedImportState(prepared);
  }, []);

  const clearPreparedImport = useCallback(() => {
    setPreparedImportState(null);
  }, []);

  const value = useMemo<SimklImportFlowContextValue>(
    () => ({ clearPreparedImport, preparedImport, setPreparedImport }),
    [clearPreparedImport, preparedImport, setPreparedImport]
  );

  return (
    <SimklImportFlowContext.Provider value={value}>{children}</SimklImportFlowContext.Provider>
  );
}

export function useSimklImportFlow() {
  const context = useContext(SimklImportFlowContext);

  if (!context) {
    throw new Error('useSimklImportFlow must be used within a SimklImportFlowProvider');
  }

  return context;
}

import { type PreparedImdbImport } from '@/src/utils/imdbImport';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface ImdbImportFlowContextValue {
  clearPreparedImport: () => void;
  preparedImport: PreparedImdbImport | null;
  setPreparedImport: (prepared: PreparedImdbImport | null) => void;
}

const ImdbImportFlowContext = createContext<ImdbImportFlowContextValue | null>(null);

interface ImdbImportFlowProviderProps {
  children: React.ReactNode;
  initialPreparedImport?: PreparedImdbImport | null;
}

export function ImdbImportFlowProvider({
  children,
  initialPreparedImport = null,
}: ImdbImportFlowProviderProps) {
  const [preparedImport, setPreparedImportState] = useState<PreparedImdbImport | null>(
    initialPreparedImport
  );

  const setPreparedImport = useCallback((prepared: PreparedImdbImport | null) => {
    setPreparedImportState(prepared);
  }, []);

  const clearPreparedImport = useCallback(() => {
    setPreparedImportState(null);
  }, []);

  const value = useMemo<ImdbImportFlowContextValue>(
    () => ({
      clearPreparedImport,
      preparedImport,
      setPreparedImport,
    }),
    [clearPreparedImport, preparedImport, setPreparedImport]
  );

  return <ImdbImportFlowContext.Provider value={value}>{children}</ImdbImportFlowContext.Provider>;
}

export function useImdbImportFlow() {
  const context = useContext(ImdbImportFlowContext);

  if (!context) {
    throw new Error('useImdbImportFlow must be used within an ImdbImportFlowProvider');
  }

  return context;
}

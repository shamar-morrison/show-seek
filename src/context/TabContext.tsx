import React, { createContext, useContext } from 'react';

const TabContext = createContext<string | null>(null);

export function TabProvider({ children, tabName }: { children: React.ReactNode; tabName: string }) {
  return <TabContext.Provider value={tabName}>{children}</TabContext.Provider>;
}

export function useCurrentTab(): string | null {
  return useContext(TabContext);
}

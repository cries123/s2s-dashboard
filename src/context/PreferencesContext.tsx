import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User, UserPreferences } from '../types';
import {
  DEFAULT_PREFERENCES,
  mergeUserPreferences,
} from '../lib/userPreferencesDefaults';

interface PreferencesContextValue {
  preferences: UserPreferences;
  loading: boolean;
  saving: boolean;
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;
  updateServiceDrive: (patch: Partial<UserPreferences['serviceDrive']>) => Promise<void>;
  updateContactWorkflow: (patch: Partial<UserPreferences['contactWorkflow']>) => Promise<void>;
  updateDashboardModules: (patch: Partial<UserPreferences['dashboardModules']>) => Promise<void>;
  updateCrmDisplay: (patch: Partial<UserPreferences['crmDisplay']>) => Promise<void>;
  resetPreferences: () => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function deepMergePreferences(
  current: UserPreferences,
  patch: Partial<UserPreferences>
): UserPreferences {
  return mergeUserPreferences(
    {
      serviceDrive: patch.serviceDrive ? { ...current.serviceDrive, ...patch.serviceDrive } : current.serviceDrive,
      contactWorkflow: patch.contactWorkflow
        ? { ...current.contactWorkflow, ...patch.contactWorkflow }
        : current.contactWorkflow,
      dashboardModules: patch.dashboardModules
        ? { ...current.dashboardModules, ...patch.dashboardModules }
        : current.dashboardModules,
      crmDisplay: patch.crmDisplay ? { ...current.crmDisplay, ...patch.crmDisplay } : current.crmDisplay,
    },
    undefined
  );
}

interface PreferencesProviderProps {
  user: User | null;
  children: React.ReactNode;
}

export function PreferencesProvider({ user, children }: PreferencesProviderProps) {
  const [preferences, setPreferences] = useState<UserPreferences>(() =>
    mergeUserPreferences(undefined, user?.role)
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setPreferences(mergeUserPreferences(undefined));
      setLoading(false);
      return;
    }

    setPreferences(mergeUserPreferences(user.preferences, user.role));
    setLoading(false);
  }, [user?.uid, user?.role, user?.preferences]);

  const persist = useCallback(
    async (next: UserPreferences) => {
      if (!user?.uid) return;

      setSaving(true);
      setPreferences(next);

      try {
        const userRef = doc(
          db,
          'artifacts',
          'hyundai-sales-to-service',
          'public',
          'data',
          'users',
          user.uid
        );
        await updateDoc(userRef, { preferences: next });
      } catch (err) {
        console.error('[Preferences] Failed to save:', err);
        setPreferences(mergeUserPreferences(user.preferences, user.role));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [user]
  );

  const updatePreferences = useCallback(
    async (patch: Partial<UserPreferences>) => {
      const next = deepMergePreferences(preferences, patch);
      await persist(next);
    },
    [preferences, persist]
  );

  const updateServiceDrive = useCallback(
    async (patch: Partial<UserPreferences['serviceDrive']>) => {
      await updatePreferences({ serviceDrive: { ...preferences.serviceDrive, ...patch } });
    },
    [preferences.serviceDrive, updatePreferences]
  );

  const updateContactWorkflow = useCallback(
    async (patch: Partial<UserPreferences['contactWorkflow']>) => {
      await updatePreferences({ contactWorkflow: { ...preferences.contactWorkflow, ...patch } });
    },
    [preferences.contactWorkflow, updatePreferences]
  );

  const updateDashboardModules = useCallback(
    async (patch: Partial<UserPreferences['dashboardModules']>) => {
      await updatePreferences({ dashboardModules: { ...preferences.dashboardModules, ...patch } });
    },
    [preferences.dashboardModules, updatePreferences]
  );

  const updateCrmDisplay = useCallback(
    async (patch: Partial<UserPreferences['crmDisplay']>) => {
      await updatePreferences({ crmDisplay: { ...preferences.crmDisplay, ...patch } });
    },
    [preferences.crmDisplay, updatePreferences]
  );

  const resetPreferences = useCallback(async () => {
    const next = mergeUserPreferences(undefined, user?.role);
    await persist(next);
  }, [persist, user?.role]);

  const value = useMemo(
    () => ({
      preferences,
      loading,
      saving,
      updatePreferences,
      updateServiceDrive,
      updateContactWorkflow,
      updateDashboardModules,
      updateCrmDisplay,
      resetPreferences,
    }),
    [
      preferences,
      loading,
      saving,
      updatePreferences,
      updateServiceDrive,
      updateContactWorkflow,
      updateDashboardModules,
      updateCrmDisplay,
      resetPreferences,
    ]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    return {
      preferences: DEFAULT_PREFERENCES,
      loading: false,
      saving: false,
      updatePreferences: async () => {},
      updateServiceDrive: async () => {},
      updateContactWorkflow: async () => {},
      updateDashboardModules: async () => {},
      updateCrmDisplay: async () => {},
      resetPreferences: async () => {},
    };
  }
  return ctx;
}

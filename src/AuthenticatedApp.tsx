import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useCustomers } from './hooks/useCustomers';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { Customer, User } from './types';
import { cn } from './lib/utils';
import {
  LogOut, User as UserIcon, LayoutDashboard, Search, Bell, Calendar, UserPlus,
  Settings, Loader2, Shield, Trophy, ChevronRight, TrendingUp, Layers,
  BarChart2, ClipboardList
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Components
import CustomerForm from './components/dashboard/customers/CustomerForm';
const SalesPerformance = React.lazy(() => import('./components/dashboard/analytics/SalesPerformance'));
import ServiceAlerts from './components/dashboard/customers/ServiceAlerts';
const Appointments = React.lazy(() => import('./components/dashboard/appointments/Appointments'));
const DaySchedule = React.lazy(() => import('./components/dashboard/appointments/DaySchedule'));
import { CustomerDirectory } from './components/dashboard/customers/CustomerDirectory';
const AdminPanel = React.lazy(() => import('./components/dashboard/admin/AdminPanel'));
const ManagerDashboard = React.lazy(() => import('./components/dashboard/admin/ManagerDashboard'));
const VinLookup = React.lazy(() => import('./components/dashboard/vin/VinLookup').then(m => ({ default: m.VinLookup })));
import { WeatherWidget } from './components/dashboard/appointments/WeatherWidget';
const PotOfGold = React.lazy(() => import('./components/dashboard/analytics/PotOfGold').then(m => ({ default: m.PotOfGold })));
const FixedOpsForecast = React.lazy(() => import('./components/dashboard/admin/FixedOpsForecast'));
const DispatchBoard = React.lazy(() => import('./components/dashboard/appointments/DispatchBoard').then(m => ({ default: m.DispatchBoard })));
const OpenRepairOrders = React.lazy(() => import('./components/dashboard/service/OpenRepairOrders'));
import ProfileModal from './components/modals/ProfileModal';
import { SuggestionModal } from './components/modals/SuggestionModal';
import LoginView from './components/auth/LoginView';
const SettingsPage = React.lazy(() => import('./components/settings/SettingsPage').then(m => ({ default: m.SettingsPage })));

import { useServiceAlertInterval } from './hooks/useServiceAlertInterval';
import { ServiceAlertProvider } from './context/ServiceAlertContext';
import { isNavFeatureEnabled, mergeDealershipSettings } from './lib/dealershipSettingsUtils';

import { DEALERSHIPS } from './constants';
import { canAccessPrimaryAdminSettings, canSeeManagerPanel, canSwitchDealership, isPendingManagerEnrollment, isPrimaryAdmin, isUserApproved, resolveChatDealershipId, resolveUserDealershipId } from './lib/rbac';
import { subscribeDealershipUsers } from './lib/userDirectory';
import { useDealershipChatInbox } from './hooks/useDealershipChatInbox';
import {
  DealershipChatNotifications,
  DealershipChatPanel,
} from './components/chat/DealershipChatNotifications';

import { LoadingScreen } from './components/ui/LoadingScreen';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { PageSkeleton } from './components/ui/Skeleton';
import { ConfirmModal } from './components/ui/ConfirmModal';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { AppSidebar } from './components/layout/AppSidebar';
import { AppTopBar, type TopBarNotification } from './components/layout/AppTopBar';
import { DealershipAnnouncementBanner } from './components/layout/DealershipAnnouncementBanner';
import { buildMobileNavSections } from './lib/mobileNavSections';
import { isPbsSyncDealership } from './lib/pbsSyncScope';
import { isPreviewMode } from './lib/previewMode';
import type { SidebarNavItem } from './lib/sidebarNav';
import { PreferencesProvider, usePreferences } from './context/PreferencesContext';
import { useToast } from './context/ToastContext';
import {
  type AdminSubTab,
  type AppTab,
  type ManagerSubTab,
  parseAppRoute,
  readInitialAppRoute,
  clearStoredDealershipId,
  readStoredDealershipId,
  storeDealershipId,
  syncAppRoute,
} from './lib/appNavigation';

interface NavDropdownProps {
  label: string;
  isActive: boolean;
  children: React.ReactNode;
}

function NavDropdown({ label, isActive, children }: NavDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      className="relative inline-block"
      ref={containerRef}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 xl:px-4 xl:py-2 rounded-xl text-[9.5px] font-black uppercase tracking-wider transition-all relative border shrink-0",
          isActive
            ? "bg-white/10 text-white shadow-inner border-white/10"
            : "text-slate-400 hover:text-slate-200 border-transparent hover:bg-white/5"
        )}
      >
        <span>{label}</span>
        <svg
          className={cn("w-3 h-3 transition-transform duration-200 text-slate-500", isOpen ? "rotate-180" : "rotate-0")}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 mt-1 w-48 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl overflow-hidden z-50 py-1.5 p-1 flex flex-col gap-0.5"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface NavLinkProps {
  href: string;
  onClick: () => void;
  isActive: boolean;
  children: React.ReactNode;
  badge?: number;
}

function NavLink({ href, onClick, isActive, children, badge }: NavLinkProps) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "flex items-center justify-between px-3 py-2 text-[9.5px] font-black uppercase tracking-wider rounded-xl transition-all",
        isActive
          ? "bg-brand-primary/20 text-brand-primary"
          : "text-slate-300 hover:bg-white/5 hover:text-white"
      )}
    >
      <span>{children}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-[8px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded-full ring-2 ring-slate-950 ml-2">
          {badge}
        </span>
      )}
    </a>
  );
}

function DashboardShell({ user }: { user: User }) {
  const initialRoute = React.useMemo(() => {
    const route = readInitialAppRoute();
    if (isPreviewMode) {
      return { ...route, activeTab: 'dispatch' as AppTab };
    }
    return route;
  }, []);
  const [activeTab, setActiveTab] = useState<AppTab>(initialRoute.activeTab);
  const [adminSubTab, setAdminSubTab] = useState<AdminSubTab>(initialRoute.adminSubTab ?? 'logs');
  const [managerSubTab, setManagerSubTab] = useState<ManagerSubTab>(initialRoute.managerSubTab ?? 'operations');
  const [managerDashboardSubTab, setManagerDashboardSubTab] = useState<'users' | 'settings' | 'logs'>('users');
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const adminMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isAdminMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (adminMenuRef.current && !adminMenuRef.current.contains(event.target as Node)) {
        setIsAdminMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAdminMenuOpen]);
  const { preferences, loading: prefsLoading } = usePreferences();
  const [landingApplied, setLandingApplied] = useState(false);

  const [isDealershipDropdownOpen, setIsDealershipDropdownOpen] = useState(false);
  const [currentDealershipId, setCurrentDealershipId] = useState<string | null>(() =>
    readStoredDealershipId(DEALERSHIPS.map((d) => d.id))
  );

  const canSwitchStores = canSwitchDealership(user);

  const selectDealership = React.useCallback(
    (dealershipId: string) => {
      // Switching stores is an admin-only capability. Ignore any attempt from a
      // non-admin, so a stale sessionStorage value or a hand-edited call can't
      // repoint the session at another dealership.
      if (!canSwitchStores) return;
      setCurrentDealershipId(dealershipId);
      storeDealershipId(dealershipId);
    },
    [canSwitchStores]
  );

  React.useEffect(() => {
    if (isPreviewMode) {
      setCurrentDealershipId('ford');
      storeDealershipId('ford');
    }
  }, []);

  // Pin the active dealership to the signed-in user's own store unless they are an
  // admin. sessionStorage survives sign-out within the same tab, so on a shared
  // dealership terminal an admin who switched to another store would otherwise
  // leave that scope behind for the next person who signs in.
  React.useEffect(() => {
    if (!user) return;

    if (!canSwitchStores) {
      const ownDealershipId = resolveUserDealershipId(user);
      clearStoredDealershipId();
      setCurrentDealershipId((current) => (current === ownDealershipId ? current : ownDealershipId));
      return;
    }

    if (!currentDealershipId) {
      setCurrentDealershipId(user.dealershipId || 'hyundai');
    }
  }, [user, canSwitchStores, currentDealershipId]);

  React.useEffect(() => {
    syncAppRoute({
      activeTab,
      adminSubTab: activeTab === 'admin' ? adminSubTab : undefined,
      managerSubTab: activeTab === 'manager' ? managerSubTab : undefined,
    });
  }, [activeTab, adminSubTab, managerSubTab]);

  React.useEffect(() => {
    const onPopState = () => {
      const route = parseAppRoute(window.location.pathname);
      setActiveTab(route.activeTab);
      if (route.adminSubTab) setAdminSubTab(route.adminSubTab);
      if (route.managerSubTab) setManagerSubTab(route.managerSubTab);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const [dealershipSettings, setDealershipSettings] = useState<any>(null);

  // Synchronize dealership settings in real-time (such as enabling/disabling the Dispatch tab)
  React.useEffect(() => {
    // Preview mode runs on fixtures and has no signed-in user, so a live listener
    // here only produces a permission-denied retry loop.
    if (!currentDealershipId || isPreviewMode) return;

    const settingsRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'dealershipSettings', currentDealershipId);
    const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        setDealershipSettings(snapshot.data());
      } else {
        setDealershipSettings(null);
      }
    }, (error) => {
      console.error("[App] Error listening to dealership settings:", error);
    });

    return () => unsubscribe();
  }, [currentDealershipId]);

  const { customers, loading: customersLoading } = useCustomers(currentDealershipId || undefined, user?.role === 'admin');

  const mergedDealershipSettings = mergeDealershipSettings(
    currentDealershipId || 'hyundai',
    dealershipSettings
  );

  const handleSidebarNavigate = React.useCallback((item: SidebarNavItem) => {
    setActiveTab(item.tab);
    if (item.adminSubTab) setAdminSubTab(item.adminSubTab);
    if (item.managerSubTab) {
      setManagerSubTab(item.managerSubTab);
      if (item.managerSubTab === 'team') setManagerDashboardSubTab('users');
    }
  }, []);
  const serviceAlerts = useServiceAlertInterval(
    currentDealershipId || 'hyundai',
    mergedDealershipSettings
  );
  const activeAlertsCount = customers.filter(serviceAlerts.isServiceAlertActive).length;
  const currentDealership = DEALERSHIPS.find(d => d.id === currentDealershipId) || DEALERSHIPS[0];

  // Filter tabs - Pot of Gold (Competition) only for Hyundai
  const modules = preferences.dashboardModules;

  const availableTabs = [
    { id: 'add', label: 'Onboard', icon: UserPlus },
    { id: 'search', label: 'Directory', icon: Search },
    { id: 'alerts', label: 'Alerts', icon: Bell, badge: activeAlertsCount },
    { id: 'appointments', label: 'Operations', icon: Calendar },
    { id: 'schedule', label: 'Schedule', icon: Calendar },
    ...(dealershipSettings?.enableDispatchTab !== false ? [{ id: 'dispatch', label: 'Dispatch', icon: Layers }] : []),
    ...(isPbsSyncDealership(currentDealershipId) ? [{ id: 'open-ros', label: 'Open ROs', icon: ClipboardList }] : []),
    ...(currentDealershipId === 'hyundai' && modules.showPotOfGoldTab
      ? [{ id: 'pot-of-gold', label: 'Competition', icon: Trophy }]
      : []),
    ...(modules.showVinSearchTab ? [{ id: 'vin-search', label: 'VIN Search', icon: Search }] : []),
    ...(modules.showForecastTab ? [{ id: 'forecast', label: 'Forecast', icon: TrendingUp }] : []),
    ...(modules.showSalesPerformanceTab
      ? [{ id: 'sales-performance', label: 'Sales Performance', icon: BarChart2 }]
      : []),
    ...(canSeeManagerPanel(user) ? [{ id: 'manager', label: 'Manager', icon: Shield }] : []),
  ];

  const mobileNavSections = React.useMemo(
    () =>
      buildMobileNavSections({
        user,
        modules,
        currentDealershipId,
        enableDispatchTab: dealershipSettings?.enableDispatchTab !== false,
        showOpenRosTab: isPbsSyncDealership(currentDealershipId),
        activeAlertsCount,
      }),
    [user, modules, currentDealershipId, dealershipSettings?.enableDispatchTab, activeAlertsCount]
  );

  // If current activeTab is hidden, fallback to first available.
  // Admin/manager panels are opened from the header gear or Manager menu, not mobile tabs.
  React.useEffect(() => {
    if (activeTab === 'admin' || activeTab === 'manager' || activeTab === 'settings') return;
    if (!availableTabs.find(t => t.id === activeTab)) {
      setActiveTab('appointments');
    }
  }, [currentDealershipId, activeTab, availableTabs]);

  React.useEffect(() => {
    if (prefsLoading || landingApplied) return;
    const path = (typeof window !== 'undefined' ? window.location.pathname : '/').replace(/\/+$/, '') || '/';
    if (path !== '/' && path !== '/sales/onboard') {
      setLandingApplied(true);
      return;
    }
    let preferredTab = preferences.serviceDrive.defaultLandingTab;
    if (preferredTab === 'service-drive' || preferredTab === 'settings') {
      preferredTab = 'appointments';
    }
    if (availableTabs.find(t => t.id === preferredTab)) {
      setActiveTab(preferredTab as AppTab);
    }
    setLandingApplied(true);
  }, [prefsLoading, landingApplied, preferences, availableTabs]);

  // Modal States
  const [selectedProfile, setSelectedProfile] = useState<Customer | null>(null);
  const [showSuggestionModal, setShowSuggestionModal] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [chatRecipientUid, setChatRecipientUid] = useState<string | null>(null);
  const [chatRecipientName, setChatRecipientName] = useState<string | null>(null);
  const [tenantUsers, setTenantUsers] = useState<User[]>([]);
  const [pendingDeleteCustomer, setPendingDeleteCustomer] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);
  const { showToast } = useToast();

  const canSeeAlertsBell = canAccessPrimaryAdminSettings(user) || canSeeManagerPanel(user);
  const topBarNotifications = React.useMemo<TopBarNotification[]>(() => {
    const items: TopBarNotification[] = [];

    if (canAccessPrimaryAdminSettings(user)) {
      const pbsState = dealershipSettings?.pbsSyncState;
      if (pbsState?.lastSyncOk === false) {
        items.push({
          id: 'pbs-sync-failed',
          tone: 'danger',
          title: 'PBS sync failed',
          detail: pbsState.lastError || 'The last automated sync did not complete successfully.',
          onClick: () => {
            setActiveTab('admin');
            setAdminSubTab('pbs-sync');
          },
        });
      }

      const dmsFailures = dealershipSettings?.dmsImportHealth?.recentFailures ?? [];
      if (dmsFailures.length > 0) {
        items.push({
          id: 'dms-import-failures',
          tone: 'warning',
          title: `${dmsFailures.length} DMS import ${dmsFailures.length === 1 ? 'failure' : 'failures'}`,
          detail: dmsFailures[0]?.filename ? `Most recent: ${dmsFailures[0].filename}` : undefined,
          onClick: () => {
            setActiveTab('admin');
            setAdminSubTab('import-health');
          },
        });
      }
    }

    if (canSeeManagerPanel(user)) {
      const pendingCount = tenantUsers.filter(isPendingManagerEnrollment).length;
      if (pendingCount > 0) {
        items.push({
          id: 'pending-enrollments',
          tone: 'info',
          title: `${pendingCount} pending manager ${pendingCount === 1 ? 'enrollment' : 'enrollments'}`,
          detail: 'Waiting on your approval.',
          onClick: () => {
            setActiveTab('manager');
            setManagerSubTab('team');
          },
        });
      }
    }

    return items;
  }, [user, dealershipSettings, tenantUsers]);

  const chatDealershipId = resolveChatDealershipId(user, currentDealershipId);

  const { inbox: chatInbox, unreadCount: chatUnreadCount } = useDealershipChatInbox(
    chatDealershipId,
    user?.uid
  );

  React.useEffect(() => {
    if (!chatDealershipId) {
      setTenantUsers([]);
      return;
    }
    if (isPreviewMode) {
      setTenantUsers([]);
      return;
    }
    const unsub = subscribeDealershipUsers(chatDealershipId, setTenantUsers, (err) =>
      console.error('[DealershipChat] users error', err)
    );
    return () => unsub();
  }, [chatDealershipId]);

  // Thin wrapper kept so every existing call site (showNotification(text, isError))
  // is unchanged — now backed by the real stacked/dismissible toast system.
  const showNotification = (text: string, isError = false) => {
    showToast(text, isError ? 'error' : 'success');
  };

  const handleSignOut = () => {
    // Drop the admin's chosen store so it can't seed the next session in this tab.
    clearStoredDealershipId();
    setCurrentDealershipId(null);
    return signOut(auth);
  };

  const handleDeleteCustomer = (id: string, name: string) => {
    setPendingDeleteCustomer({ id, name });
  };

  const confirmDeleteCustomer = async () => {
    if (!pendingDeleteCustomer) return;
    setIsDeletingCustomer(true);
    try {
      await deleteDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', pendingDeleteCustomer.id));
      setSelectedProfile(null);
      showNotification("Customer deleted successfully.");
    } catch (err: any) {
      showNotification(err.message, true);
    } finally {
      setIsDeletingCustomer(false);
      setPendingDeleteCustomer(null);
    }
  };

  if (customersLoading || prefsLoading) {
    return <LoadingScreen />;
  }

  if (!isUserApproved(user) && !isPrimaryAdmin(user)) {
    return (
      <div className="min-h-screen bg-surface-base flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center space-y-8 animate-fade-in">
          <div className="w-24 h-24 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto ring-1 ring-amber-500/20">
            <Shield className="text-amber-500" size={40} />
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-black text-white tracking-tight">Access Restricted</h1>
            <p className="text-slate-400 font-medium leading-relaxed">
              Your account enrollment is currently <span className="text-amber-500 font-black">PENDING APPROVAL</span>.
            </p>
          </div>
          <button onClick={handleSignOut} className="btn-primary bg-slate-800 hover:bg-slate-700 w-full">Exit System</button>
        </div>
      </div>
    );
  }

  const currentUser = user;

  return (
    <ServiceAlertProvider
      dealershipId={currentDealershipId || 'hyundai'}
      settings={mergedDealershipSettings}
    >
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--color-surface-base)' }}>
      <AppSidebar
        dealershipName={currentDealership.name}
        activeTab={activeTab}
        adminSubTab={adminSubTab}
        managerSubTab={managerSubTab}
        modules={modules}
        currentDealershipId={currentDealershipId}
        enableDispatchTab={dealershipSettings?.enableDispatchTab !== false}
        showOpenRosTab={isPbsSyncDealership(currentDealershipId)}
        showManager={canSeeManagerPanel(user)}
        showAdmin={canAccessPrimaryAdminSettings(currentUser)}
        activeAlertsCount={activeAlertsCount}
        canSwitchDealership={canSwitchStores}
        onDealershipChange={(id) => {
          selectDealership(id);
          showNotification(`Switched to ${DEALERSHIPS.find((d) => d.id === id)?.name || id}`);
        }}
        onNavigate={handleSidebarNavigate}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
      <AppTopBar
        user={currentUser}
        dealershipName={currentDealership.name}
        currentDealershipId={currentDealershipId}
        enrollmentJoinCode={mergedDealershipSettings.enrollmentJoinCode}
        onDealershipChange={(id) => {
          selectDealership(id);
          showNotification(`Switched to ${DEALERSHIPS.find((d) => d.id === id)?.name || id}`);
        }}
        onSignOut={handleSignOut}
        onOpenSuggestions={() => setShowSuggestionModal(true)}
        onOpenSettings={() => setActiveTab('settings')}
        onOpenChat={() => setShowChatPanel(true)}
        chatUnreadCount={chatUnreadCount}
        notifications={canSeeAlertsBell ? topBarNotifications : undefined}
      />

      <DealershipAnnouncementBanner
        dealershipId={currentDealershipId || 'hyundai'}
        announcement={dealershipSettings?.announcement}
      />

      {/* Main Content */}
      <main className="section-container animate-fade-in app-main-with-mobile-nav">
        <ErrorBoundary inline area="this view">
        <React.Suspense fallback={<PageSkeleton />}>
        <div className="space-y-10">
          {activeTab === 'add' && (
            <CustomerForm
              currentUser={currentUser}
              onSuccess={msg => showNotification(msg)}
              onError={msg => showNotification(msg, true)}
            />
          )}

          {activeTab === 'search' && (
            <CustomerDirectory
              customers={customers}
              currentUser={currentUser}
              currentDealershipId={currentDealershipId || 'hyundai'}
              onViewProfile={setSelectedProfile}
              onViewLog={setSelectedProfile}
              onRefresh={showNotification}
            />
          )}

          {activeTab === 'alerts' && (
            <ServiceAlerts
              customers={customers}
              currentUser={currentUser}
              onViewProfile={setSelectedProfile}
              onViewLog={(c) => setSelectedProfile(c)}
              onRefresh={(msg, isError) =>
                showNotification(msg || 'Alerts updated successfully.', isError)
              }
            />
          )}

          {activeTab === 'open-ros' && (
            <OpenRepairOrders
              key={currentDealershipId || 'hyundai'}
              currentDealershipId={currentDealershipId || 'hyundai'}
              customers={customers}
              onViewProfile={setSelectedProfile}
              onError={(msg) => showNotification(msg, true)}
            />
          )}

          {activeTab === 'appointments' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              {modules.showWeatherWidget && <WeatherWidget lat={mergedDealershipSettings.weatherLat} lon={mergedDealershipSettings.weatherLon} displayCity={mergedDealershipSettings.weatherDisplayCity} />}
              <Appointments
                currentUser={currentUser}
                currentDealershipId={currentDealershipId || 'hyundai'}
                modulePrefs={modules}
                onSuccess={msg => showNotification(msg)}
                onError={msg => showNotification(msg, true)}
              />
            </div>
          )}

          {activeTab === 'schedule' && (
            <DaySchedule
              currentDealershipId={currentDealershipId || 'hyundai'}
              onError={(msg) => showNotification(msg, true)}
            />
          )}

          {activeTab === 'dispatch' && (
            <DispatchBoard
              key={currentDealershipId || 'hyundai'}
              currentDealershipId={currentDealershipId || 'hyundai'}
              customers={customers}
              showNotification={(msg, isError) => showNotification(msg, isError)}
            />
          )}

          {activeTab === 'vin-search' && (
            <VinLookup />
          )}


          {activeTab === 'pot-of-gold' && (
            <PotOfGold key={currentDealershipId || 'hyundai'} currentDealershipId={currentDealershipId || 'hyundai'} dealershipSettings={dealershipSettings} />
          )}

          {activeTab === 'forecast' && (
            <FixedOpsForecast
              key={currentDealershipId || 'hyundai'}
              currentDealershipId={currentDealershipId || 'hyundai'}
              onSuccess={(msg) => showNotification(msg)}
              onError={(msg) => showNotification(msg, true)}
            />
          )}

          {activeTab === 'sales-performance' && (
            <SalesPerformance
              customers={customers}
              currentUser={currentUser}
              currentDealershipId={currentDealershipId || 'ford'}
            />
          )}

          {/* Personal preferences — available to every approved user, not just
              managers. Store-wide configuration stays under Manager. */}
          {activeTab === 'settings' && (
            <SettingsPage
              onNavigate={(tab) => setActiveTab(tab as typeof activeTab)}
              onNotify={(msg, isError) => showNotification(msg, isError)}
              currentDealershipId={currentDealershipId || 'hyundai'}
              onDealershipChange={selectDealership}
            />
          )}

          {activeTab === 'manager' && canSeeManagerPanel(currentUser) && managerSubTab === 'team' && (
            <ManagerDashboard
              activeSubTab={managerDashboardSubTab}
              onChangeSubTab={setManagerDashboardSubTab}
              currentDealershipId={currentDealershipId || 'hyundai'}
              onSuccess={(msg) => showNotification(msg)}
              onError={(msg) => showNotification(msg, true)}
            />
          )}

          {activeTab === 'manager' && canSeeManagerPanel(currentUser) && managerSubTab !== 'team' && (
            <AdminPanel
              key={`manager-${currentDealershipId || 'hyundai'}`}
              panelMode="manager"
              currentDealershipId={currentDealershipId || 'hyundai'}
              onSuccess={(msg) => showNotification(msg)}
              onError={(msg) => showNotification(msg, true)}
              activeSubTab={
                managerSubTab === 'preferences'
                  ? 'preferences'
                  : managerSubTab === 'logs'
                    ? 'logs'
                    : 'operations'
              }
              onChangeSubTab={(tab) => {
                if (tab === 'preferences') setManagerSubTab('preferences');
                else if (tab === 'logs') setManagerSubTab('logs');
                else setManagerSubTab('operations');
              }}
              onNavigateTab={(tab) => setActiveTab(tab as typeof activeTab)}
              onDealershipChange={selectDealership}
            />
          )}

          {activeTab === 'admin' && canAccessPrimaryAdminSettings(currentUser) && (
            <AdminPanel
              key="primary-admin"
              panelMode="admin"
              currentDealershipId={currentDealershipId || 'hyundai'}
              onSuccess={(msg) => showNotification(msg)}
              onError={(msg) => showNotification(msg, true)}
              activeSubTab={adminSubTab}
              onChangeSubTab={(tab: AdminSubTab) => setAdminSubTab(tab)}
              onNavigateTab={(tab) => setActiveTab(tab as typeof activeTab)}
            />
          )}
        </div>
        </React.Suspense>
        </ErrorBoundary>
      </main>

      {/* Modals */}
      {selectedProfile && (
        <ProfileModal
          customer={selectedProfile}
          currentUser={currentUser}
          onClose={() => setSelectedProfile(null)}
          onDelete={handleDeleteCustomer}
        />
      )}

      {showSuggestionModal && (
        <SuggestionModal
          user={currentUser}
          dealershipId={currentDealershipId || currentUser.dealershipId || 'hyundai'}
          onClose={() => setShowSuggestionModal(false)}
          onSuccess={(msg) => showNotification(msg)}
          onError={(msg) => showNotification(msg, true)}
        />
      )}

      <ConfirmModal
        open={!!pendingDeleteCustomer}
        title="Delete Customer"
        description={
          pendingDeleteCustomer
            ? `Are you sure you want to PERMANENTLY delete ${pendingDeleteCustomer.name}?`
            : undefined
        }
        confirmLabel="Delete"
        tone="danger"
        loading={isDeletingCustomer}
        onConfirm={confirmDeleteCustomer}
        onCancel={() => setPendingDeleteCustomer(null)}
      />

      <MobileBottomNav
        activeTab={activeTab}
        managerSubTab={managerSubTab}
        sections={mobileNavSections}
        onNavigate={({ tab, managerSubTab: nextManagerSubTab }) => {
          setActiveTab(tab as typeof activeTab);
          if (nextManagerSubTab) {
            setManagerSubTab(nextManagerSubTab);
            if (nextManagerSubTab === 'team') {
              setManagerDashboardSubTab('users');
            }
          }
        }}
      />
      </div>
    </div>

      <DealershipChatNotifications
        inbox={chatInbox}
        onOpenThread={(fromUid, fromName) => {
          setChatRecipientUid(fromUid);
          setChatRecipientName(fromName);
          setShowChatPanel(true);
        }}
      />

      <DealershipChatPanel
        open={showChatPanel}
        onClose={() => {
          setShowChatPanel(false);
          setChatRecipientUid(null);
          setChatRecipientName(null);
        }}
        currentUser={currentUser}
        dealershipId={chatDealershipId}
        tenantUsers={tenantUsers}
        initialRecipientUid={chatRecipientUid}
        initialRecipientName={chatRecipientName}
      />
    </ServiceAlertProvider>
  );
}

export default function AuthenticatedApp() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return <LoadingScreen />;
  }

  if (!user && !isPreviewMode) {
    return <LoginView />;
  }

  return (
    <PreferencesProvider user={user!}>
      <DashboardShell user={user!} />
    </PreferencesProvider>
  );
}

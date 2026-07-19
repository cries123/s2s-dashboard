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
import SalesPerformance from './components/dashboard/analytics/SalesPerformance';
import ServiceAlerts from './components/dashboard/customers/ServiceAlerts';
import Appointments from './components/dashboard/appointments/Appointments';
import DaySchedule from './components/dashboard/appointments/DaySchedule';
import { CustomerDirectory } from './components/dashboard/customers/CustomerDirectory';
import AdminPanel from './components/dashboard/admin/AdminPanel';
import ManagerDashboard from './components/dashboard/admin/ManagerDashboard';
import { VinLookup } from './components/dashboard/vin/VinLookup';
import { WeatherWidget } from './components/dashboard/appointments/WeatherWidget';
import { PotOfGold } from './components/dashboard/analytics/PotOfGold';
import FixedOpsForecast from './components/dashboard/admin/FixedOpsForecast';
import { DispatchBoard } from './components/dashboard/appointments/DispatchBoard';
import OpenRepairOrders from './components/dashboard/service/OpenRepairOrders';
import ProfileModal from './components/modals/ProfileModal';
import { SuggestionModal } from './components/modals/SuggestionModal';
import LoginView from './components/auth/LoginView';

import { useServiceAlertInterval } from './hooks/useServiceAlertInterval';
import { ServiceAlertProvider } from './context/ServiceAlertContext';
import { isNavFeatureEnabled, mergeDealershipSettings } from './lib/dealershipSettingsUtils';

import { DEALERSHIPS } from './constants';
import {
  canAccessPrimaryAdminSettings,
  canSeeManagerPanel,
  canSwitchDealership,
  isPrimaryAdmin,
  isUserApproved,
} from './lib/rbac';

import { LoadingScreen } from './components/ui/LoadingScreen';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { AppSidebar } from './components/layout/AppSidebar';
import { AppTopBar } from './components/layout/AppTopBar';
import { DealershipAnnouncementBanner } from './components/layout/DealershipAnnouncementBanner';
import { buildMobileNavSections } from './lib/mobileNavSections';
import { isPbsSyncDealership } from './lib/pbsSyncScope';
import { isPreviewMode } from './lib/previewMode';
import type { SidebarNavItem } from './lib/sidebarNav';
import { PreferencesProvider, usePreferences } from './context/PreferencesContext';
import {
  type AdminSubTab,
  type AppTab,
  type ManagerSubTab,
  parseAppRoute,
  readInitialAppRoute,
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

  const selectDealership = React.useCallback((dealershipId: string) => {
    setCurrentDealershipId(dealershipId);
    storeDealershipId(dealershipId);
  }, []);

  React.useEffect(() => {
    if (isPreviewMode) {
      selectDealership('ford');
    }
  }, [selectDealership]);

  // Sync current dealership with user's dealership on load
  React.useEffect(() => {
    if (user && !currentDealershipId) {
      setCurrentDealershipId(user.dealershipId || 'hyundai');
    }
  }, [user, currentDealershipId]);

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
    if (!currentDealershipId) return;

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
    if (activeTab === 'admin' || activeTab === 'manager') return;
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
  const [notification, setNotification] = useState<{ text: string; isError: boolean } | null>(null);

  const showNotification = (text: string, isError = false) => {
    setNotification({ text, isError });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleSignOut = () => signOut(auth);

  const handleDeleteCustomer = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to PERMANENTLY delete ${name}?`)) return;
    try {
      await deleteDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', id));
      setSelectedProfile(null);
      showNotification("Customer deleted successfully.");
    } catch (err: any) {
      showNotification(err.message, true);
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
        canSwitchDealership={canSwitchDealership(currentUser)}
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
      />

      <DealershipAnnouncementBanner
        dealershipId={currentDealershipId || 'hyundai'}
        announcement={dealershipSettings?.announcement}
      />

      {/* Main Content */}
      <main className="section-container animate-fade-in app-main-with-mobile-nav">
        {notification && (
          <div className={cn(
            "p-4 rounded-2xl mb-8 flex items-center gap-4 animate-slide-in border shadow-lg",
            notification.isError ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          )}>
            <div className={cn("w-2 h-2 rounded-full", notification.isError ? "bg-rose-500" : "bg-emerald-500")}></div>
            <span className="font-semibold text-sm">{notification.text}</span>
          </div>
        )}

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
              onDealershipChange={setCurrentDealershipId}
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
              onChangeSubTab={setAdminSubTab}
              onNavigateTab={(tab) => setActiveTab(tab as typeof activeTab)}
            />
          )}
        </div>
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

import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useCustomers } from './hooks/useCustomers';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { Customer, User } from './types';
import { cn } from './lib/utils';
import { 
  LogOut, User as UserIcon, LayoutDashboard, Search, Bell, Calendar, UserPlus, 
  Settings, Loader2, Shield, Trophy, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Components
import CustomerForm from './components/dashboard/customers/CustomerForm';
import ServiceAlerts from './components/dashboard/customers/ServiceAlerts';
import Appointments from './components/dashboard/appointments/Appointments';
import { CustomerDirectory } from './components/dashboard/customers/CustomerDirectory';
import AdminPanel from './components/dashboard/admin/AdminPanel';
import { VinLookup } from './components/dashboard/vin/VinLookup';
import { WeatherWidget } from './components/dashboard/appointments/WeatherWidget';
import { PotOfGold } from './components/dashboard/analytics/PotOfGold';
import ProfileModal from './components/modals/ProfileModal';
import InjectModal from './components/modals/InjectModal';
import LoginView from './components/auth/LoginView';

import { isServiceAlertActive, calculateServiceCycle } from './lib/alerts';

import { DEALERSHIPS } from './constants';

import { LoadingScreen } from './components/ui/LoadingScreen';

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [minLoading, setMinLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<'add' | 'search' | 'alerts' | 'appointments' | 'admin' | 'vin-search' | 'pot-of-gold'>('add');
  const [adminSubTab, setAdminSubTab] = useState<'operations' | 'users' | 'logs' | 'eod'>('operations');

  // Artificial delay for loading screen
  React.useEffect(() => {
    const timer = setTimeout(() => setMinLoading(false), 2500);
    return () => clearTimeout(timer);
  }, []);
  const [isDealershipDropdownOpen, setIsDealershipDropdownOpen] = useState(false);
  const [currentDealershipId, setCurrentDealershipId] = useState<string | null>(null);

  // Sync current dealership with user's dealership on load
  React.useEffect(() => {
    if (user && !currentDealershipId) {
      setCurrentDealershipId(user.dealershipId || 'hyundai');
    }
  }, [user, currentDealershipId]);

  const { customers, loading: customersLoading } = useCustomers(currentDealershipId || undefined, user?.role === 'admin');

  const isLoading = authLoading || (user && customersLoading) || minLoading;

  const activeAlertsCount = customers.filter(isServiceAlertActive).length;

  const currentDealership = DEALERSHIPS.find(d => d.id === currentDealershipId) || DEALERSHIPS[0];
  
  // Filter tabs - Pot of Gold (Competition) only for Hyundai
  const availableTabs = [
    { id: 'add', label: 'Onboard', icon: UserPlus },
    { id: 'search', label: 'Directory', icon: Search },
    { id: 'alerts', label: 'Alerts', icon: Bell, badge: activeAlertsCount },
    { id: 'appointments', label: 'Operations', icon: Calendar },
    ...(currentDealershipId === 'hyundai' ? [{ id: 'pot-of-gold', label: 'Competition', icon: Trophy }] : []),
    { id: 'vin-search', label: 'VIN Search', icon: Search },
    ...(user && user.role === 'admin' ? [{ id: 'admin', label: 'Admin', icon: Settings }] : []),
  ];

  // If current activeTab is hidden, fallback to first available
  React.useEffect(() => {
    if (!availableTabs.find(t => t.id === activeTab)) {
      setActiveTab('add');
    }
  }, [currentDealershipId, activeTab, availableTabs]);

  // Modal States
  const [selectedProfile, setSelectedProfile] = useState<Customer | null>(null);
  const [showInject, setShowInject] = useState(false);
  const [notification, setNotification] = useState<{ text: string; isError: boolean } | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

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

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoginView />;
  }

  if (user && user.status !== 'approved' && user.role !== 'admin') {
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
              A system administrator must verify your identity before dashboard access is granted.
            </p>
          </div>
          <div className="pt-4 border-t border-slate-800">
             <button 
               onClick={handleSignOut}
               className="btn-primary bg-slate-800 hover:bg-slate-700 w-full"
             >
               Exit System
             </button>
          </div>
          <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.2em]">
            Identity ID: {user.uid}
          </p>
        </div>
      </div>
    );
  }

  const currentUser = user;

  return (
    <div className="min-h-screen bg-surface-base text-slate-200 selection:bg-brand-primary selection:text-white relative overflow-x-hidden">
      {/* Aesthetic Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-primary/5 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-brand-secondary/5 blur-[100px] rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-[30%] right-[10%] w-[20%] h-[20%] bg-indigo-500/5 blur-[80px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 shadow-xl shadow-black/20">
        <div className="section-container !py-3 flex items-center justify-between gap-4 relative">
          {/* Logo Section */}
          <div className="flex items-center gap-3 shrink-0 relative">
            <button 
              onClick={() => {
                if (currentUser.role === 'admin') {
                  setIsDealershipDropdownOpen(!isDealershipDropdownOpen);
                } else {
                  showNotification("Only system admins can switch dealerships.", true);
                }
              }}
              className={cn(
                "w-10 h-10 bg-brand-primary rounded-2xl flex items-center justify-center shadow-lg shadow-brand-primary/25 border border-white/10 transition-all z-50",
                currentUser.role === 'admin' ? "hover:scale-110 active:scale-95 cursor-pointer" : "opacity-80 cursor-default"
              )}
            >
              <LayoutDashboard className="text-white" size={20} />
            </button>

            <AnimatePresence>
              {isDealershipDropdownOpen && currentUser.role === 'admin' && (
                <>
                  <div 
                    className="fixed inset-0 z-[40]" 
                    onClick={() => setIsDealershipDropdownOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 10, x: -20 }}
                    animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 10, x: -20 }}
                    className="absolute top-12 left-0 w-64 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[50]"
                  >
                    <div className="px-4 py-2 border-b border-white/5 bg-slate-800/50">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Select Dealership</span>
                    </div>
                    {DEALERSHIPS.map((dealership) => (
                      <button
                        key={dealership.id}
                        onClick={() => {
                          setCurrentDealershipId(dealership.id);
                          setIsDealershipDropdownOpen(false);
                          showNotification(`Switched to ${dealership.name}`);
                        }}
                        className={cn(
                          "w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b border-white/5 last:border-0 hover:bg-white/5",
                          currentDealershipId === dealership.id ? "text-brand-primary bg-brand-primary/5" : "text-slate-400"
                        )}
                      >
                        {dealership.name}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            <div className="hidden sm:block">
              <h1 className="text-base font-black text-white leading-none tracking-tighter uppercase whitespace-nowrap">
                S2S <span className="text-brand-primary">Dashboard</span>
              </h1>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">{currentDealership.name}</p>
            </div>
          </div>

          {/* Navigation Section */}
          <nav className="flex-1 hidden md:flex items-center justify-center gap-1 overflow-x-auto no-scrollbar scroll-smooth px-2">
            {availableTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  if (tab.id === 'admin') {
                    setAdminSubTab('operations');
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all relative border shrink-0",
                  activeTab === tab.id 
                    ? "bg-white/10 text-white shadow-inner border border-white/10" 
                    : "text-slate-500 hover:text-slate-200 border-transparent hover:bg-white/5"
                )}
              >
                <tab.icon size={13} className={cn("shrink-0", activeTab === tab.id ? "text-brand-primary" : "")} />
                <span className={cn(activeTab === tab.id ? "block" : "hidden sm:block")}>
                  {tab.label}
                </span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-0.5 text-[8px] font-black bg-rose-500 text-white px-1 py-0.5 rounded-full ring-2 ring-slate-950">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Mobile Navigation Dropdown */}
          <div className="flex-1 md:hidden flex justify-center h-full items-center">
            <div className="relative">
              <button 
                onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
                className="flex items-center gap-3 px-4 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-white transition-all active:scale-95 shadow-lg shadow-black/20"
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-brand-primary/20 flex items-center justify-center">
                    {availableTabs.find(t => t.id === activeTab)?.icon && React.createElement(availableTabs.find(t => t.id === activeTab)!.icon, { size: 12, className: "text-brand-primary" })}
                  </div>
                  <span className="min-w-[80px] text-left">
                    {activeTab === 'admin' 
                      ? `Admin: ${adminSubTab === 'operations' ? 'Operations' : adminSubTab === 'users' ? 'Users' : adminSubTab === 'logs' ? 'Logs' : 'EOD'}`
                      : availableTabs.find(t => t.id === activeTab)?.label
                    }
                  </span>
                </div>
                <ChevronRight size={14} className={cn("transition-transform duration-300 text-brand-primary", isMobileNavOpen ? "-rotate-90" : "rotate-90")} />
              </button>
              
              <AnimatePresence>
                {isMobileNavOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-[90]" 
                      onClick={() => setIsMobileNavOpen(false)} 
                    />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 bg-slate-900 border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-[100] max-h-[80vh] overflow-y-auto"
                    >
                      <div className="px-4 py-2 border-b border-white/5 bg-slate-800/50">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Navigation</span>
                      </div>
                      {availableTabs.map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => {
                            setActiveTab(tab.id as any);
                            if (tab.id === 'admin') {
                              setAdminSubTab('operations');
                            }
                            setIsMobileNavOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between px-4 py-3.5 text-[9px] font-black uppercase tracking-widest text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0",
                            activeTab === tab.id ? "bg-brand-primary/10 text-brand-primary" : "text-slate-400"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <tab.icon size={14} className={activeTab === tab.id ? "text-brand-primary" : "text-slate-500"} />
                            {tab.label}
                          </div>
                          {tab.badge !== undefined && tab.badge > 0 && (
                            <span className="bg-rose-500 text-white px-1.5 py-0.5 rounded-full text-[8px]">
                              {tab.badge}
                            </span>
                          )}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Profile Section */}
          <div className="flex items-center gap-3 shrink-0 pl-3 border-l border-white/10">
             <div className="hidden lg:flex flex-col items-end">
               <p className="text-[10px] font-black text-white leading-none uppercase tracking-tight">{currentUser.username}</p>
               <div className="flex items-center gap-1 mt-1">
                  <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">{currentUser.jobTitle}</p>
               </div>
             </div>
             
             <button 
               onClick={handleSignOut}
               className="w-9 h-9 flex items-center justify-center bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-rose-500/20 hover:border-rose-500/30 rounded-lg transition-all shadow-sm"
               title="Sign Out"
             >
               <LogOut size={16} />
             </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="section-container animate-fade-in pb-10">
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
              onViewLog={c => setSelectedProfile(c)}
              onRefresh={(msg, isError) => showNotification(msg || "Alerts updated successfully.", isError)}
            />
          )}

          {activeTab === 'appointments' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <WeatherWidget />
              <Appointments 
                currentUser={currentUser} 
                currentDealershipId={currentDealershipId || 'hyundai'}
                onSuccess={msg => showNotification(msg)}
                onError={msg => showNotification(msg, true)}
              />
            </div>
          )}

          {activeTab === 'vin-search' && (
            <VinLookup />
          )}

          {activeTab === 'pot-of-gold' && (
            <PotOfGold currentDealershipId={currentDealershipId || 'hyundai'} />
          )}

          {activeTab === 'admin' && (
            <AdminPanel 
              currentDealershipId={currentDealershipId || 'hyundai'} 
              onSuccess={(msg) => showNotification(msg)}
              onError={(msg) => showNotification(msg, true)}
              activeSubTab={adminSubTab}
              onChangeSubTab={setAdminSubTab}
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

      {showInject && (
        <InjectModal 
          currentUser={currentUser} 
          customers={customers} 
          onClose={() => setShowInject(false)} 
          onSuccess={count => showNotification(`Successfully injected ${count} appointments.`)}
        />
      )}
    </div>
  );
}

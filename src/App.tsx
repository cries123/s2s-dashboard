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
import CustomerForm from './components/dashboard/CustomerForm';
import ServiceAlerts from './components/dashboard/ServiceAlerts';
import Appointments from './components/dashboard/Appointments';
import CustomerCard from './components/dashboard/CustomerCard';
import AdminPanel from './components/dashboard/AdminPanel';
import { VinLookup } from './components/dashboard/VinLookup';
import { WeatherWidget } from './components/dashboard/WeatherWidget';
import { PotOfGold } from './components/dashboard/PotOfGold';
import ProfileModal from './components/modals/ProfileModal';
import InjectModal from './components/modals/InjectModal';
import LoginView from './components/auth/LoginView';

import { isServiceAlertActive, calculateServiceCycle } from './lib/alerts';

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const { customers, loading: customersLoading } = useCustomers();
  
  const [activeTab, setActiveTab] = useState<'add' | 'search' | 'alerts' | 'appointments' | 'admin' | 'vin-search' | 'pot-of-gold'>('add');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(24);
  
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

  const activeAlertsCount = customers.filter(isServiceAlertActive).length;

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

  // Memoize filtered results to prevent lag during re-renders
  const filteredCustomers = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return customers;

    return customers.filter(c => {
      return (
        c.firstName?.toLowerCase().includes(q) ||
        c.lastName?.toLowerCase().includes(q) ||
        c.vinLast8?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.model?.toLowerCase().includes(q)
      );
    });
  }, [customers, searchQuery]);

  const displayCustomers = React.useMemo(() => {
    return filteredCustomers.slice(0, visibleCount);
  }, [filteredCustomers, visibleCount]);

  if (authLoading) {
    return (
      <div className="fixed inset-0 flex flex-col justify-center items-center bg-surface-base gap-4">
        <Loader2 className="animate-spin text-brand-primary" size={48} />
        <p className="text-slate-400 font-medium animate-pulse tracking-widest uppercase text-xs">Initializing S2S Dashboard...</p>
      </div>
    );
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
    <div className="min-h-screen bg-surface-base text-slate-200 selection:bg-brand-primary selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5">
        <div className="section-container !py-3 flex items-center justify-between gap-4">
          {/* Logo Section */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 bg-brand-primary rounded-2xl flex items-center justify-center shadow-lg shadow-brand-primary/25 border border-white/10">
              <LayoutDashboard className="text-white" size={20} />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-black text-white leading-none tracking-tighter uppercase whitespace-nowrap">
                S2S <span className="text-brand-primary">Dashboard</span>
              </h1>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">Hyundai of Santa Maria</p>
            </div>
          </div>

          {/* Navigation Section */}
          <nav className="flex-1 hidden md:flex items-center justify-center gap-1 overflow-x-auto no-scrollbar scroll-smooth px-2">
            {[
              { id: 'add', label: 'Onboard', icon: UserPlus },
              { id: 'search', label: 'Directory', icon: Search },
              { id: 'alerts', label: 'Alerts', icon: Bell, badge: activeAlertsCount },
              { id: 'appointments', label: 'Operations', icon: Calendar },
              { id: 'pot-of-gold', label: 'Competition', icon: Trophy },
              { id: 'vin-search', label: 'VIN Search', icon: Search },
              ...(currentUser.role === 'admin' ? [{ id: 'admin', label: 'Admin', icon: Settings }] : []),
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all relative shrink-0",
                  activeTab === tab.id 
                    ? "bg-white/10 text-white shadow-inner border border-white/10" 
                    : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
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
                    {activeTab === 'add' && <UserPlus size={12} className="text-brand-primary" />}
                    {activeTab === 'search' && <Search size={12} className="text-brand-primary" />}
                    {activeTab === 'alerts' && <Bell size={12} className="text-brand-primary" />}
                    {activeTab === 'appointments' && <Calendar size={12} className="text-brand-primary" />}
                    {activeTab === 'pot-of-gold' && <Trophy size={12} className="text-brand-primary" />}
                    {activeTab === 'vin-search' && <Search size={12} className="text-brand-primary" />}
                    {activeTab === 'admin' && <Settings size={12} className="text-brand-primary" />}
                  </div>
                  <span className="min-w-[80px] text-left">
                    {activeTab === 'add' && 'Onboard'}
                    {activeTab === 'search' && 'Directory'}
                    {activeTab === 'alerts' && 'Alerts'}
                    {activeTab === 'appointments' && 'Operations'}
                    {activeTab === 'pot-of-gold' && 'Competition'}
                    {activeTab === 'vin-search' && 'VIN Search'}
                    {activeTab === 'admin' && 'Admin'}
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
                      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-52 bg-slate-900 border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-[100]"
                    >
                      <div className="px-4 py-2 border-b border-white/5 bg-slate-800/50">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Navigation</span>
                      </div>
                      {[
                        { id: 'add', label: 'Onboard', icon: UserPlus },
                        { id: 'search', label: 'Directory', icon: Search },
                        { id: 'alerts', label: 'Alerts', icon: Bell, badge: activeAlertsCount },
                        { id: 'appointments', label: 'Operations', icon: Calendar },
                        { id: 'pot-of-gold', label: 'Competition', icon: Trophy },
                        { id: 'vin-search', label: 'VIN Search', icon: Search },
                        ...(currentUser.role === 'admin' ? [{ id: 'admin', label: 'Admin', icon: Settings }] : []),
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => {
                            setActiveTab(tab.id as any);
                            setIsMobileNavOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between px-4 py-3.5 text-[9px] font-black uppercase tracking-widest text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0",
                            activeTab === tab.id ? "bg-brand-primary/10 text-brand-primary" : "text-slate-400"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <tab.icon size={14} />
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
            <div className="space-y-10">
              {/* Directory Header & Stats */}
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-slate-800">
                <div>
                  <h2 className="text-4xl font-black text-white tracking-tight">Customer Directory</h2>
                  <p className="text-slate-400 mt-1 font-medium italic">Comprehensive database of all customer relations.</p>
                </div>

                <div className="flex flex-wrap gap-4 w-full lg:w-auto">
                   <div className="bg-slate-900 border border-slate-800 px-5 py-3 rounded-2xl flex flex-col min-w-[120px]">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Total Records</span>
                      <span className="text-2xl font-black text-brand-primary">{customers.length}</span>
                   </div>
                   <div className="bg-slate-900 border border-slate-800 px-5 py-3 rounded-2xl flex flex-col min-w-[120px]">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Added This Month</span>
                      <span className="text-2xl font-black text-brand-secondary">
                        {customers.filter(c => {
                          const date = c.createdAt?.toDate ? c.createdAt.toDate() : new Date();
                          return date.getMonth() === new Date().getMonth();
                        }).length}
                      </span>
                   </div>
                </div>
              </div>

              {/* Toolbar */}
              <div className="flex flex-col md:flex-row gap-4 items-center bg-slate-900/50 p-6 rounded-3xl border border-slate-800 shadow-2xl">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-primary" size={20} />
                  <input
                    type="text"
                    placeholder="Search name, phone, VIN (last 8) or vehicle model..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setVisibleCount(24); // Reset pagination on search
                    }}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-12 pr-6 py-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all font-medium"
                  />
                </div>
                
                <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 w-full md:w-auto overflow-x-auto no-scrollbar">
                   {['All', 'Hyundai', 'Other'].map(cat => (
                     <button key={cat} className={cn(
                       "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
                       cat === 'All' ? "bg-slate-800 text-white shadow-xl" : "text-slate-500 hover:text-slate-300"
                     )}>
                       {cat}
                     </button>
                   ))}
                </div>
              </div>

              {filteredCustomers.length === 0 ? (
                <div className="card-base p-20 text-center border-dashed border-slate-700 bg-transparent">
                  <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-600">
                    <Search size={40} />
                  </div>
                  <h3 className="text-xl font-bold text-white">No results found</h3>
                  <p className="text-slate-400 mt-2 max-w-sm mx-auto">We couldn't find any customers matching your search criteria.</p>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                    {displayCustomers.map(c => (
                      <CustomerCard 
                        key={c.id} 
                        customer={c} 
                        currentUser={currentUser}
                        onViewProfile={(cust: Customer) => setSelectedProfile(cust)}
                        onViewLog={(cust: Customer) => setSelectedProfile(cust)}
                        onRefresh={showNotification}
                        isAlert={false}
                      />
                    ))}
                  </div>

                  {filteredCustomers.length > visibleCount && (
                    <div className="flex justify-center pt-8 pb-12">
                      <button 
                        onClick={() => setVisibleCount(prev => prev + 24)}
                        className="btn-primary bg-slate-800 hover:bg-slate-700 text-white px-10 py-4 shadow-xl border border-slate-700"
                      >
                        Load More Customers
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
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
                onSuccess={msg => showNotification(msg)}
                onError={msg => showNotification(msg, true)}
              />
            </div>
          )}

          {activeTab === 'vin-search' && (
            <VinLookup />
          )}

          {activeTab === 'pot-of-gold' && (
            <PotOfGold />
          )}

          {activeTab === 'admin' && (
            <AdminPanel />
          )}
        </div>
      </main>

      {/* Modals */}
      {selectedProfile && (
        <ProfileModal 
          customer={selectedProfile} 
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

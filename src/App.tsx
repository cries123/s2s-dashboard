import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { Shield } from 'lucide-react';
import { auth } from './firebase';
import { useAuth } from './hooks/useAuth';
import { PreferencesProvider } from './context/PreferencesContext';
import LoginView from './components/auth/LoginView';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { AuthenticatedApp } from './AuthenticatedApp';

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [minLoading, setMinLoading] = useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => setMinLoading(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  if (authLoading || minLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoginView />;
  }

  if (user.status !== 'approved' && user.role !== 'admin') {
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
               onClick={() => signOut(auth)}
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

  return (
    <PreferencesProvider user={user}>
      <AuthenticatedApp />
    </PreferencesProvider>
  );
}

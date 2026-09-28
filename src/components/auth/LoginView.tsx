import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { cn } from '../../lib/utils';
import {
  Mail, Lock, User as UserIcon, Briefcase,
  ArrowRight, Loader2, ShieldCheck, Building2
} from 'lucide-react';
import { BrandMark } from '../ui/BrandMark';
import { TENANT_PROFILES, dealershipIdFromTenantId } from '../../lib/tenants';
import { resolveEnrollmentJoinCode } from '../../lib/dealershipSettingsUtils';
import type { UserDepartment } from '../../types';
import { logAuditAction } from '../../services/loggingService';

export default function LoginView() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [department, setDepartment] = useState<UserDepartment | 'manager' | ''>('');
  const [joinCode, setJoinCode] = useState('');
  const [joinCodesByDealership, setJoinCodesByDealership] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(
          collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'dealershipSettings')
        );
        const map: Record<string, string> = {};
        snap.docs.forEach((d) => {
          map[d.id] = resolveEnrollmentJoinCode(d.id, d.data() as any);
        });
        setJoinCodesByDealership(map);
      } catch {
        /* fallback to constants at validation time */
      }
    })();
  }, []);


  /** Firebase error codes are not user-facing copy. */
  const friendlyAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code || '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'That email and password do not match an account.';
      case 'auth/invalid-email':
        return 'That does not look like a valid email address.';
      case 'auth/user-disabled':
        return 'This account has been disabled. Contact your manager.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Wait a few minutes and try again.';
      case 'auth/email-already-in-use':
        return 'An account already exists for that email. Try signing in instead.';
      case 'auth/weak-password':
        return 'Choose a password of at least 6 characters.';
      case 'auth/network-request-failed':
        return 'Could not reach the server. Check your connection and try again.';
      default:
        // Our own thrown validation messages are already written for people.
        return !code && err instanceof Error ? err.message : 'Something went wrong. Please try again.';
    }
  };

  const showMessage = (text: string, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      showMessage(friendlyAuthError(err), true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const profile = TENANT_PROFILES.find((t) => t.tenantId === tenantId);
      if (!profile) {
        throw new Error('Please select a dealership profile.');
      }
      if (!department) {
        throw new Error('Please select your department.');
      }

      const isPrimaryAdmin = email.toLowerCase() === 'admin@hyundai.com';
      if (!isPrimaryAdmin) {
        const dealershipIdForCode = dealershipIdFromTenantId(profile.tenantId);
        const expected = joinCodesByDealership[dealershipIdForCode] || resolveEnrollmentJoinCode(dealershipIdForCode, null);
        if (expected && joinCode.trim().toUpperCase() !== expected) {
          throw new Error('Invalid enrollment join code for this dealership.');
        }
      }
      const isManagerEnrollment = department === 'manager';
      
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const dealershipId = dealershipIdFromTenantId(profile.tenantId);
      
      await setDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: cred.user.email,
        username: isPrimaryAdmin ? 'Primary Admin' : username,
        tenantId: profile.tenantId,
        dealershipId,
        department: isManagerEnrollment ? 'service' : department,
        role: isPrimaryAdmin ? 'admin' : (isManagerEnrollment ? 'manager' : 'pending'),
        approved: isPrimaryAdmin,
        status: isPrimaryAdmin ? 'approved' : 'pending',
        isManager: isPrimaryAdmin || isManagerEnrollment,
        jobTitle: isManagerEnrollment
          ? 'Manager'
          : department === 'sales'
            ? 'Sales Professional'
            : 'Service Advisor',
        createdAt: new Date()
      });

      await logAuditAction(
        'User Enrollment',
        `${username} (${email}) requested access — ${profile.name}, ${department}`,
        profile.tenantId,
        { uid: cred.user.uid, email: cred.user.email || email, username }
      );
      
      showMessage(
        isManagerEnrollment
          ? 'Manager enrollment submitted. A dealership manager must approve your account before you can access the dashboard.'
          : 'Enrollment submitted. A manager must approve your account before you can access the dashboard.',
        false
      );
      setMode('login');
    } catch (err: any) {
      showMessage(friendlyAuthError(err), true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      showMessage('Password reset email sent.', false);
      setMode('login');
    } catch (err: any) {
      showMessage(friendlyAuthError(err), true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center p-4 selection:bg-brand-primary selection:text-white">
      <div className="w-full max-w-[420px] animate-fade-in">
        <div className="flex flex-col items-center mb-10 text-center">
          <BrandMark size={56} className="mb-5" />
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            S2S Dashboard
          </h1>
          <p className="crm-label text-sm mt-1.5">Sales-to-service retention for your dealership</p>
        </div>

        <div className="card-base bg-surface-base/50 backdrop-blur-xl border-surface-border overflow-hidden">
          <div className="flex border-b border-surface-border">
            <button 
              onClick={() => setMode('login')}
              className={cn(
                "flex-1 py-4 text-sm font-bold transition-all", 
                mode === 'login' ? "text-brand-primary bg-brand-primary/5" : "text-text-secondary hover:text-slate-300"
              )}
            >
              Sign in
            </button>
            <button 
              onClick={() => setMode('signup')}
              className={cn(
                "flex-1 py-4 text-sm font-bold transition-all", 
                mode === 'signup' ? "text-brand-primary bg-brand-primary/5" : "text-text-secondary hover:text-slate-300"
              )}
            >
              Request access
            </button>
          </div>

          <div className="p-8">
            {message && (
              <div className={cn(
                "p-4 rounded-xl mb-6 text-xs font-bold tracking-wide animate-slide-in", 
                message.isError ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              )}>
                {message.text}
              </div>
            )}

            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="input-label">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input type="email" autoComplete="username" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} required className="input-field pl-12" placeholder="name@dealership.com" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <label className="input-label mb-0">Password</label>
                    <button type="button" onClick={() => setMode('reset')} className="text-xs font-medium text-text-secondary hover:text-brand-primary transition-colors">
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required className="input-field pl-12" />
                  </div>
                </div>
                <button type="submit" disabled={isLoading} className="w-full btn-primary py-3.5 mt-2">
                  {isLoading ? <Loader2 className="animate-spin" size={20} /> : <span className="flex items-center gap-2">Sign in <ArrowRight size={18} /></span>}
                </button>
              </form>
            )}

            {/*
              This page is public. It used to print the Ford/Lincoln enrollment
              join code here — twice, plus as the input placeholder — which made
              the code pointless as a gate. Managers already see their store's
              code in the top bar and hand it to new staff.
            */}
            {mode === 'signup' && (
              <form onSubmit={handleSignup} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="input-label">Full name</label>
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input type="text" autoComplete="name" value={username} onChange={e => setUsername(e.target.value)} required className="input-field pl-12" placeholder="Jane Smith" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="input-label">Work email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input type="email" autoComplete="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} required className="input-field pl-12" placeholder="name@dealership.com" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="input-label">Dealership</label>
                  <div className="relative">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <select
                      value={tenantId}
                      onChange={e => setTenantId(e.target.value)}
                      required
                      className="input-field pl-12 appearance-none"
                    >
                      <option value="">Select your dealership</option>
                      {TENANT_PROFILES.map(t => (
                        <option key={t.tenantId} value={t.tenantId}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="input-label">Department</label>
                  <div className="relative">
                    <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <select 
                      value={department} 
                      onChange={e => setDepartment(e.target.value as UserDepartment)} 
                      required 
                      className="input-field pl-12 appearance-none"
                    >
                      <option value="">Select your department</option>
                      <option value="sales">Sales</option>
                      <option value="service">Service</option>
                      <option value="manager">Manager</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="input-label">Store access code</label>
                  <input
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    required
                    className="input-field font-mono"
                    placeholder="From your manager"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="input-label">Create password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="input-field pl-12" placeholder="At least 6 characters" />
                  </div>
                </div>
                <p className="crm-label leading-relaxed flex items-start gap-2">
                  <ShieldCheck className="text-brand-primary shrink-0 mt-0.5" size={14} />
                  A manager at your dealership approves new accounts before you can sign in.
                </p>
                <button type="submit" disabled={isLoading} className="w-full btn-primary py-3.5 mt-2">
                  {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Request access'}
                </button>
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={handleReset} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="input-label">Work email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input type="email" autoComplete="username" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} required className="input-field pl-12" placeholder="name@dealership.com" />
                  </div>
                </div>
                <button type="submit" disabled={isLoading} className="w-full btn-primary py-3.5 mt-2">
                  {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Send reset link'}
                </button>
                <div className="text-center mt-6">
                  <button type="button" onClick={() => setMode('login')} className="text-xs font-medium text-text-secondary hover:text-brand-primary transition-colors">
                    &larr; Back to sign in
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
        
        <p className="crm-label text-center mt-10">
          For authorized dealership staff only
        </p>
      </div>
    </div>
  );
}

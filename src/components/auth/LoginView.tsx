import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { cn } from '../../lib/utils';
import { LayoutDashboard, Mail, Lock, User as UserIcon, Briefcase, ArrowRight, Loader2 } from 'lucide-react';

export default function LoginView() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

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
      showMessage(err.message, true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const isPrimaryAdmin = email.toLowerCase() === 'admin@hyundai.com';
      const isNewAdmin = isPrimaryAdmin || username.toLowerCase() === 'admin';
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      
      await setDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: cred.user.email,
        username: isNewAdmin ? (isPrimaryAdmin ? 'Primary Admin' : 'admin') : username,
        role: isNewAdmin ? 'admin' : 'Staff',
        status: isNewAdmin ? 'approved' : 'pending',
        jobTitle: isPrimaryAdmin ? 'Master Administrator' : (isNewAdmin ? 'System Admin' : jobTitle),
        createdAt: new Date()
      });
      
      showMessage("Enrollment request sent. Please wait for administrator approval.", false);
      setMode('login');
    } catch (err: any) {
      showMessage(err.message, true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      showMessage("Password reset email sent.", false);
      setMode('login');
    } catch (err: any) {
      showMessage(err.message, true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center p-4 selection:bg-brand-primary selection:text-white">
      <div className="w-full max-w-[420px] animate-fade-in">
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-16 h-16 bg-brand-primary rounded-2xl flex items-center justify-center shadow-xl shadow-brand-primary/20 mb-6">
            <LayoutDashboard className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">S2S<span className="text-brand-primary"> Dashboard</span></h1>
          <p className="text-slate-400 mt-2 font-medium">Hyundai Sales-to-Service Intelligence</p>
        </div>

        <div className="card-base bg-surface-base/50 backdrop-blur-xl border-surface-border overflow-hidden">
          <div className="flex border-b border-surface-border">
            <button 
              onClick={() => setMode('login')}
              className={cn(
                "flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-all", 
                mode === 'login' ? "text-brand-primary bg-brand-primary/5" : "text-slate-500 hover:text-slate-300"
              )}
            >
              Access
            </button>
            <button 
              onClick={() => setMode('signup')}
              className={cn(
                "flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-all", 
                mode === 'signup' ? "text-brand-primary bg-brand-primary/5" : "text-slate-500 hover:text-slate-300"
              )}
            >
              Enroll
            </button>
          </div>

          <div className="p-8">
            {message && (
              <div className={cn(
                "p-4 rounded-xl mb-6 text-xs font-bold uppercase tracking-wide animate-slide-in", 
                message.isError ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              )}>
                {message.text}
              </div>
            )}

            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="input-label">Operator Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="input-field pl-12" placeholder="name@dealership.com" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="input-label">Security Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="input-field pl-12" placeholder="••••••••" />
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full btn-primary py-4 mt-4"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={20} /> : <span className="flex items-center gap-2">Authorize System <ArrowRight size={18} /></span>}
                </button>
                <div className="text-center mt-6">
                  <button type="button" onClick={() => setMode('reset')} className="text-xs font-bold text-slate-500 hover:text-brand-primary uppercase tracking-widest transition-colors">
                    Reset Protocol
                  </button>
                </div>
              </form>
            )}

            {mode === 'signup' && (
              <form onSubmit={handleSignup} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="input-label">Full Name</label>
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input type="text" value={username} onChange={e => setUsername(e.target.value)} required className="input-field pl-12" placeholder="John Wick" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="input-label">Operator Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="input-field pl-12" placeholder="name@dealership.com" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="input-label">Organization Role</label>
                  <div className="relative">
                    <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <select value={jobTitle} onChange={e => setJobTitle(e.target.value)} required className="input-field pl-12 appearance-none">
                      <option value="">-- Identity Type --</option>
                      <option value="Salesperson">Sales Professional</option>
                      <option value="Service Advisor">Service Advisor</option>
                      <option value="Manager">Executive Manager</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="input-label">Create Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="input-field pl-12" placeholder="••••••••" />
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full btn-primary py-4 mt-4 bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={20} /> : "Request Enrollment"}
                </button>
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={handleReset} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="input-label">Registered Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="input-field pl-12" placeholder="name@dealership.com" />
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full btn-primary py-4 mt-4"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={20} /> : "Send Reset Protocol"}
                </button>
                <div className="text-center mt-6">
                  <button type="button" onClick={() => setMode('login')} className="text-xs font-bold text-slate-500 hover:text-brand-primary uppercase tracking-widest transition-colors">
                    &larr; Back to Access
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
        
        <p className="text-center text-[10px] text-slate-600 font-bold uppercase tracking-[0.2em] mt-10">
          SECURE PROPRIETARY ACCESS • HYUNDAI MOTORS AMERICA
        </p>
      </div>
    </div>
  );
}

import React from 'react';
import { motion } from 'motion/react';
import { LayoutDashboard } from 'lucide-react';

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950 overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-primary/10 rounded-full blur-[120px] animate-pulse" />
      
      <div className="relative flex flex-col items-center">
        {/* Animated S2S Symbol */}
        <div className="relative w-32 h-32 mb-12">
          {/* Outer Rotating Ring */}
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 border-t-2 border-r-2 border-brand-primary/40 rounded-full"
          />
          
          {/* Inner Counter-Rotating Ring */}
          <motion.div 
            animate={{ rotate: -360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="absolute inset-4 border-b-2 border-l-2 border-brand-secondary/40 rounded-full"
          />

          {/* Core S2S Logo */}
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="flex flex-col items-center">
              <span className="text-4xl font-black text-white italic tracking-tighter leading-none">S2S</span>
              <div className="h-0.5 w-8 bg-brand-primary mt-1 rounded-full shadow-[0_0_10px_rgba(var(--brand-primary-rgb),0.5)]" />
            </div>
          </motion.div>
          
          {/* Dashboard Icon Orbiting */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className="absolute -inset-2"
          >
            <motion.div 
               className="w-4 h-4 bg-brand-primary rounded-lg flex items-center justify-center shadow-lg shadow-brand-primary/50"
               style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)' }}
            >
              <LayoutDashboard size={8} className="text-white" />
            </motion.div>
          </motion.div>
        </div>

        {/* Text sequence */}
        <div className="text-center space-y-4">
          <motion.h2 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-base font-black text-white uppercase tracking-[0.4em] italic"
          >
            Initializing <span className="text-brand-primary">Systems</span>
          </motion.h2>
          
          <div className="flex justify-center gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ 
                  scale: [1, 1.5, 1],
                  opacity: [0.3, 1, 0.3]
                }}
                transition={{ 
                  duration: 1, 
                  repeat: Infinity, 
                  delay: i * 0.2 
                }}
                className="w-1.5 h-1.5 bg-brand-primary rounded-full"
              />
            ))}
          </div>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ delay: 1 }}
            className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em]"
          >
            Connecting securely
          </motion.p>
        </div>
      </div>

      {/* Corporate/Tech Accent */}
      <div className="absolute bottom-12 left-0 w-full flex justify-center opacity-20">
        <div className="flex items-center gap-8 text-[8px] font-black text-slate-500 uppercase tracking-[0.5em]">
          <span>Archive Hub</span>
          <div className="w-1.5 h-1.5 rotate-45 border border-slate-500" />
          <span>v2.4.0</span>
          <div className="w-1.5 h-1.5 rotate-45 border border-slate-500" />
          <span>Operational</span>
        </div>
      </div>
    </div>
  );
}

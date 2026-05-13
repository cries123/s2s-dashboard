import React, { useState } from 'react';
import { 
  X, Upload, Loader2, Sparkles, AlertCircle, CheckCircle2
} from 'lucide-react';
// import * as pdfjsLib from 'pdfjs-dist';
import { db } from '../../firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, Timestamp, writeBatch } from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { User, Customer } from '../../types';

// Set worker for pdfjs
// pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface InjectModalProps {
  onClose: () => void;
  currentUser: User;
  customers: Customer[];
  onSuccess: (count: number) => void;
}

export default function InjectModal({ onClose, currentUser, customers, onSuccess }: InjectModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(process.env.OPENAI_API_KEY || '');

  const extractTextFromPDF = async (file: File) => {
    return "PDF extraction disabled for troubleshooting.";
  };

  const parseCSV = (text: string) => {
    const lines = text.split('\n');
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const vals = line.split(',').map(v => v.trim());
      const obj: any = {};
      header.forEach((h, i) => obj[h] = vals[i]);
      return obj;
    });
  };

  const extractDataFromAI = async (text: string) => {
    if (!apiKey) throw new Error("OpenAI API key is required for AI parsing.");
    
    const prompt = `
      Extract service appointments from this text into a JSON array of objects:
      { firstName, lastName, vinLast8 (last 8), mileage, reason, make, model, year, type ('Oil Change', 'Recall', 'Diag', 'Service') }
      Only JSON.
      Text: ${text.substring(0, 15000)}
    `;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const content = JSON.parse(data.choices[0].message.content);
    return content.appointments || content.items || Object.values(content)[0] as any[];
  };

  const categorizeType = (reason: string) => {
    const r = reason.toLowerCase();
    if (r.includes('oil') || r.includes('lube') || r.includes('filter') || r.includes('maintenance')) return 'Oil Change';
    if (r.includes('recall') || r.includes('campaign')) return 'Recall';
    if (r.includes('diag') || r.includes('check engine')) return 'Diag';
    return 'Service';
  };

  const handleProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setIsProcessing(true);
    setStatus("Extracting text...");
    
    try {
      let items: any[] = [];
      const isPDF = file.name.toLowerCase().endsWith('.pdf');
      
      if (isPDF) {
        const text = await extractTextFromPDF(file);
        if (useAI) {
          setStatus("Analyzing with AI...");
          items = await extractDataFromAI(text);
        } else {
          // Very simple regex fallback
          setStatus("Running basic extraction...");
          const vinMatches = text.match(/\b[A-Z0-9]{17}\b/g) || [];
          items = vinMatches.map(vin => ({ vinLast8: vin.slice(-8), reason: "Service Visit" }));
        }
      } else {
        const text = await file.text();
        items = parseCSV(text);
      }

      setStatus(`Found ${items.length} records. Updating database...`);
      let count = 0;
      const today = new Date().toISOString().split('T')[0];

      for (const item of items) {
        let customerId;
        const vin = item.vinLast8?.toUpperCase();
        let match = customers.find(c => c.vinLast8 === vin);

        if (match) {
          customerId = match.id;
        } else if (vin) {
          // Create phantom customer
          const newDoc = await addDoc(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers'), {
            firstName: item.firstName || "Unknown",
            lastName: item.lastName || "Customer",
            email: "", phone: "",
            vinLast8: vin,
            createdAt: Timestamp.now(),
            addedBy: currentUser.uid,
            addedByUsername: currentUser.username,
            make: item.make || "Hyundai",
            model: item.model || "Unknown",
            soldDate: "",
            language: "English",
            enableServiceAlert: true,
            lastAcknowledgedCycle: 0,
            serviceAlertTriggered: false
          });
          customerId = newDoc.id;
        }

        if (customerId) {
          // Check for existing appt today
          const q = query(
            collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'appointmentTracker'),
            where('date', '==', today),
            where('customerId', '==', customerId)
          );
          const snap = await getDocs(q);
          
          if (snap.empty) {
            await addDoc(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'appointmentTracker'), {
              date: today,
              customerId,
              type: item.type || categorizeType(item.reason || ''),
              reasons: [item.reason || 'Service visit'],
              mileage: item.mileage || null,
              addedBy: currentUser.uid,
              timestamp: Timestamp.now()
            });
            
            // Update customer profile with last service
            await updateDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', customerId), {
              lastServiceDate: today,
              mileage: item.mileage || ""
            });
            count++;
          }
        }
      }

      setStatus(`Successfully injected ${count} appointments.`);
      setTimeout(() => {
        onSuccess(count);
        onClose();
      }, 2000);

    } catch (err: any) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content !max-w-2xl bg-slate-900 border-surface-border">
        <div className="p-6 sm:p-8 border-b border-surface-border bg-slate-900/50 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <div className="p-2 bg-brand-primary/10 rounded-xl text-brand-primary">
                <Upload size={20} />
              </div>
              System Injection
            </h3>
            <p className="text-sm text-slate-400 mt-1">Bulk-populate operations via PDF or CSV data streams.</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-8 space-y-8">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Sparkles size={18} className="text-amber-400" />
                <span className="text-sm font-bold text-slate-100">AI Analysis Engine</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={useAI}
                  onChange={e => setUseAI(e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-primary peer-checked:after:bg-white"></div>
              </label>
            </div>
            
            {useAI && (
              <div className="space-y-3 animate-slide-in">
                <label className="input-label !mb-0 text-[10px]">AI Integration Key (Optional Override)</label>
                <div className="relative">
                  <input 
                    type="password" 
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-••••••••••••••••••••••••••••••••" 
                    className="input-field py-2.5 bg-slate-900 border-slate-800" 
                  />
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed italic">
                  Note: The system uses your environment key by default. This input allows a temporary session override for secure, external processing.
                </p>
              </div>
            )}
          </div>

          <form onSubmit={handleProcess} className="space-y-8">
            <div className="space-y-3">
              <label className="input-label text-slate-200">Data Source</label>
              <div className="relative group">
                <input 
                  type="file" 
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  accept=".csv, .pdf" 
                  className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer" 
                />
                <div className={cn(
                  "border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 flex flex-col items-center justify-center gap-4",
                  file ? "border-brand-primary bg-brand-primary/5 text-brand-primary" : "border-slate-800 bg-slate-950 group-hover:border-slate-600 group-hover:bg-slate-900/50 text-slate-500"
                )}>
                  {file ? (
                    <>
                      <div className="w-14 h-14 bg-brand-primary/20 rounded-2xl flex items-center justify-center">
                        <CheckCircle2 size={32} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-100">{file.name}</p>
                        <p className="text-xs font-medium text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB • Action Ready</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <Upload size={32} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-300">Target File Stream</p>
                        <p className="text-xs font-medium text-slate-500 mt-1">Click or drag PDF/CSV reports to begin</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {status && (
              <div className={cn(
                "p-4 rounded-xl border flex items-center gap-4 text-sm font-medium animate-zoom-in shadow-sm",
                status.includes("Error") 
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20" 
                  : "bg-brand-primary/10 text-brand-primary border-brand-primary/20"
              )}>
                {isProcessing ? (
                  <Loader2 className="animate-spin shrink-0" size={18} />
                ) : (
                  status.includes("Error") ? <AlertCircle className="shrink-0" size={18} /> : <CheckCircle2 className="shrink-0" size={18} />
                )}
                <span>{status}</span>
              </div>
            )}

            <div className="flex gap-4">
              <button 
                type="button"
                onClick={onClose} 
                className="btn-secondary !bg-transparent border border-slate-800 hover:border-slate-600 flex-1"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={!file || isProcessing}
                className="btn-primary flex-1 shadow-lg shadow-brand-primary/25 disabled:opacity-30 disabled:shadow-none"
              >
                {isProcessing ? (
                  <><Loader2 className="animate-spin" size={18} /> Synchronizing...</>
                ) : (
                  'Process & Inject'
                )}
              </button>
            </div>
          </form>
        </div>
        
        <div className="px-6 py-4 bg-slate-950/80 border-t border-surface-border text-center">
           <p className="text-[10px] font-bold text-slate-700 uppercase tracking-widest">
             Advanced Telemetry Integration • Hyundai Group
           </p>
        </div>
      </div>
    </div>
  );
}

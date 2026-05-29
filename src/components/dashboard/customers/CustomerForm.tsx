import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import { User } from '../../../types';
import { logSystemAction } from '../../../services/loggingService';
import { 
  Camera, 
  Loader2, 
  User as UserIcon, 
  Phone, 
  Mail, 
  Car, 
  Calendar, 
  Globe, 
  BadgeCheck,
  FileText,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CustomerFormProps {
  currentUser: User;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export default function CustomerForm({ currentUser, onSuccess, onError }: CustomerFormProps) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    make: 'Hyundai',
    model: '',
    vin: '',
    vinLast8: '',
    soldDate: '',
    language: 'English',
    enableServiceAlert: true,
    soldByUserId: '',
    notes: ''
  });

  const [salespeople, setSalespeople] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showProgressTracker, setShowProgressTracker] = useState(false);
  const [showAIScanner, setShowAIScanner] = useState(false);

  useEffect(() => {
    const loadSalespeople = async () => {
      const q = query(
        collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users'),
        where('jobTitle', 'in', ['Salesperson', 'Manager']),
        where('dealershipId', '==', currentUser.dealershipId)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSalespeople(list);
    };
    if (currentUser.dealershipId) {
      loadSalespeople();
    }
  }, [currentUser.dealershipId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { id, value, type } = e.target as HTMLInputElement;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData(prev => ({ ...prev, [id]: val }));
  };

  const processImageFile = async (file: File) => {
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const base64Image = await base64Promise;

      const apiKey = process.env.OPENAI_API_KEY; 
      if (!apiKey) throw new Error("OpenAI API key not configured.");

      const prompt = `
        Extract fields from this handwritten sales note into a JSON object:
        - firstName, lastName, phone, email, make (default "Hyundai"), model, vinLast8 (last 8), soldDate (YYYY-MM-DD), language.
        JSON only.
      `;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: base64Image } }
              ]
            }
          ],
          response_format: { type: "json_object" }
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      
      const result = JSON.parse(data.choices[0].message.content);
      
      if (result.vin && result.vin.length === 17) {
        setFormData(prev => ({ ...prev, ...result }));
        handleVinDecode(result.vin);
      } else {
        setFormData(prev => ({
          ...prev,
          ...result,
          vinLast8: result.vinLast8?.toUpperCase() || ''
        }));
      }

      await logSystemAction(
        "Form Scanned",
        `Scanned document and auto-populated form fields (Name: ${result.firstName || ''} ${result.lastName || ''}, Vehicle: ${result.model || ''})`,
        'scanner',
        currentUser.email,
        currentUser.username,
        currentUser.dealershipId
      );

      onSuccess("AI successfully extracted data from image.");
    } catch (err: any) {
      onError(`AI Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processImageFile(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleVinDecode = async (vinToDecode: string) => {
    if (!vinToDecode || vinToDecode.length < 17) return;

    setIsDecoding(true);
    try {
      const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vinToDecode}?format=json`);
      const data = await response.json();
      
      const decodeResults = data.Results || [];
      const getVal = (id: number) => decodeResults.find((r: any) => r.VariableId === id)?.Value;

      const make = getVal(26); 
      const model = getVal(28); 
      const year = getVal(29); 
      
      if (make || model) {
        setFormData(prev => ({
          ...prev,
          make: make || prev.make,
          model: model ? `${year} ${model}` : prev.model,
          vinLast8: vinToDecode.slice(-8).toUpperCase()
        }));
        onSuccess(`VIN Decoded: ${year} ${make} ${model}`);
      }
    } catch (err) {
      console.error("VIN Decode error:", err);
    } finally {
      setIsDecoding(false);
    }
  };

  const handleVinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setFormData(prev => ({ ...prev, vin: val, vinLast8: val.length >= 8 ? val.slice(-8) : prev.vinLast8 }));
    if (val.length === 17) {
      handleVinDecode(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (formData.vinLast8) {
        const q = query(
          collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers'),
          where('vinLast8', '==', formData.vinLast8.toUpperCase()),
          where('dealershipId', '==', currentUser.dealershipId)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          onError(`Customer with VIN ending in ${formData.vinLast8} already exists in this dealership.`);
          return;
        }
      }

      const selectedSP = salespeople.find(s => s.id === formData.soldByUserId);
      
      await addDoc(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers'), {
        ...formData,
        vinLast8: formData.vinLast8.toUpperCase(),
        soldByUsername: selectedSP?.username || null,
        dealershipId: currentUser.dealershipId,
        createdAt: Timestamp.now(),
        addedBy: currentUser.uid,
        addedByUsername: currentUser.username,
        lastAcknowledgedCycle: 0,
        serviceAlertTriggered: false
      });

      await logSystemAction(
        "Driver Enrolled",
        `Enrolled driver ${formData.firstName} ${formData.lastName} (${formData.model || 'Unknown Model'})`,
        'demographics',
        currentUser.email,
        currentUser.username,
        currentUser.dealershipId
      );

      onSuccess("Customer successfully registered & enrolled in retention cycles!");
      setFormData({
        firstName: '', lastName: '', phone: '', email: '',
        make: 'Hyundai', model: '', vinLast8: '', soldDate: '',
        language: 'English', enableServiceAlert: true, soldByUserId: '', notes: ''
      });
    } catch (err: any) {
      onError(`Error: ${err.message}`);
    }
  };

  // Determine filled fields count for a modern circular progress
  const filledFieldsCount = Object.values(formData).filter(v => v !== '' && v !== null && v !== false).length;
  const totalFields = 10;
  const onboardingCompletion = Math.round((filledFieldsCount / totalFields) * 100);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-0 lg:px-6">
      {/* 1. FORM SCANNER HEADER TRIGGER CONTAINER (Placed Above the Form) */}
      <div className="mb-8 flex flex-col items-center justify-center max-w-4xl mx-auto">
        <button
          type="button"
          onClick={() => setShowAIScanner(prev => !prev)}
          className={`w-full sm:w-auto flex items-center justify-center gap-2.5 py-4 px-8 rounded-2xl text-xs font-black uppercase tracking-wider border transition-all duration-200 ${
            showAIScanner 
              ? 'bg-brand-primary text-black border-brand-primary shadow-lg shadow-brand-primary/10' 
              : 'bg-white/5 text-slate-300 border-white/5 hover:border-white/10 hover:bg-[#0c1020]'
          }`}
        >
          <Camera size={15} />
          {showAIScanner ? 'Close Form Scanner' : 'Use Form Scanner'}
        </button>

        <AnimatePresence mode="wait">
          {showAIScanner && (
            <motion.div
              key="ai-scanner"
              initial={{ opacity: 0, height: 0, y: -15 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -15 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="mt-4 w-full overflow-hidden text-center"
            >
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`relative p-8 rounded-3xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center text-center group ${
                  dragActive ? 'border-brand-primary bg-brand-primary/5' : 'border-white/10 hover:border-white/20 bg-[#0a0e1a]/80'
                }`}
              >
                <div className={`p-4 rounded-full mb-4 transition-all ${dragActive ? 'bg-brand-primary/10 text-brand-primary' : 'bg-white/5 text-slate-400 group-hover:bg-white/10 group-hover:text-brand-primary'}`}>
                  {isProcessing ? (
                    <Loader2 className="animate-spin" size={24} />
                  ) : (
                    <Camera size={24} />
                  )}
                </div>

                <h5 className="text-xs font-black uppercase tracking-widest text-slate-200">Form Scanner</h5>
                <p className="text-[11px] text-slate-400 max-w-md mt-1 leading-relaxed">
                  Drag and drop a written sales memorandum, buyer contract note, or photo ID. The system's Gemini-powered OCR automatically extracts demographics and vehicle specs to fill the questionnaire below.
                </p>

                <label className="mt-5 py-2.5 px-6 rounded-xl bg-brand-primary/10 hover:bg-brand-primary/15 border border-brand-primary/20 text-[10px] font-black uppercase tracking-widest text-brand-primary cursor-pointer transition-all">
                  {isProcessing ? "Processing Document File..." : "Upload Document File"}
                  <input type="file" onChange={handleImageUpload} accept="image/*" className="hidden" />
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 2. MAIN ENROLLMENT FORM (Full Width / Max-4XL Centered) */}
      <div className="max-w-4xl mx-auto">
        <form onSubmit={handleSubmit} className="relative rounded-3xl bg-[#0a0e1a] border border-white/5 shadow-2xl p-6 md:p-8 space-y-8 overflow-hidden">
          {/* Subtle glowing ray behind header */}
          <div className="absolute top-0 left-0 w-44 h-24 bg-brand-primary/5 rounded-full blur-[60px]" />
          
          {/* Elegant header segment inside card */}
          <div className="border-b border-white/5 pb-6">
            <h2 className="text-lg font-black uppercase tracking-wider text-slate-200 flex items-center gap-3">
              <UserIcon className="text-brand-secondary" size={18} /> Enroll Customer Profile
            </h2>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Enter parameters to construct custom service cycle loops</p>
          </div>

          {/* Subsection 1: Demographics */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-white/5">
              <ChevronRight className="text-brand-primary" size={14} />
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">General Owner Details</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest" htmlFor="firstName">First Name</label>
                <input
                  type="text"
                  id="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                  className="w-full bg-[#0e1324] border border-white/5 focus:border-brand-primary/50 text-slate-200 px-3.5 py-3 rounded-xl text-xs font-semibold focus:outline-none placeholder:text-slate-600 transition-all duration-150"
                  placeholder="e.g. Liam"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest" htmlFor="lastName">Last Name</label>
                <input
                  type="text"
                  id="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                  className="w-full bg-[#0e1324] border border-white/5 focus:border-brand-primary/50 text-slate-200 px-3.5 py-3 rounded-xl text-xs font-semibold focus:outline-none placeholder:text-slate-600 transition-all duration-150"
                  placeholder="e.g. Cooper"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest" htmlFor="phone">Primary Phone</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    type="tel"
                    id="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full bg-[#0e1324] border border-white/5 focus:border-brand-primary/50 text-slate-200 pl-12 pr-3.5 py-3 rounded-xl text-xs font-semibold focus:outline-none placeholder:text-slate-600 transition-all duration-150 font-mono"
                    placeholder="(555) 000-0000"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest" htmlFor="email">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    type="email"
                    id="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full bg-[#0e1324] border border-white/5 focus:border-brand-primary/50 text-slate-200 pl-12 pr-3.5 py-3 rounded-xl text-xs font-semibold focus:outline-none placeholder:text-slate-600 transition-all duration-150"
                    placeholder="driver@example.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest" htmlFor="language">Preferred Contact Language</label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <select
                    id="language"
                    value={formData.language}
                    onChange={handleChange}
                    className="w-full bg-[#0e1324] border border-white/5 focus:border-brand-primary/50 text-slate-200 pl-12 pr-3.5 py-3 rounded-xl text-xs font-extrabold uppercase tracking-wider focus:outline-none transition-all duration-150 appearance-none cursor-pointer"
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="Mandarin">Mandarin</option>
                    <option value="Korean">Korean</option>
                    <option value="Other">Other</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 text-[10px]">▼</div>
                </div>
              </div>
            </div>
          </div>

          {/* Subsection 2: Vehicle Specs */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-white/5">
              <ChevronRight className="text-brand-secondary" size={14} />
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vehicle Details</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest" htmlFor="vin">Full VIN (17 Characters)</label>
                <div className="relative">
                  <BadgeCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    type="text"
                    id="vin"
                    value={formData.vin}
                    onChange={handleVinChange}
                    maxLength={17}
                    className="w-full bg-[#0e1324] border border-white/5 focus:border-brand-primary/50 text-slate-200 pl-12 pr-12 py-3 rounded-xl text-xs font-black uppercase tracking-wider focus:outline-none placeholder:text-slate-600 transition-all duration-150 font-mono"
                    placeholder="ENTER 17-CHARACTER VIN"
                  />
                  {isDecoding && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <Loader2 className="animate-spin text-brand-primary" size={14} />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest" htmlFor="model">Vehicle Class / Model</label>
                <div className="relative">
                  <Car className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    type="text"
                    id="model"
                    value={formData.model}
                    onChange={handleChange}
                    className="w-full bg-[#0e1324] border border-white/5 focus:border-brand-primary/50 text-slate-200 pl-12 pr-3.5 py-3 rounded-xl text-xs font-semibold focus:outline-none placeholder:text-slate-600 transition-all duration-150"
                    placeholder="e.g. 2024 Elantra Hybrid"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest" htmlFor="vinLast8">VIN (Last 8 Characters)</label>
                <div className="relative">
                  <BadgeCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    type="text"
                    id="vinLast8"
                    value={formData.vinLast8}
                    onChange={handleChange}
                    maxLength={8}
                    className="w-full bg-[#0e1324] border border-white/5 focus:border-brand-primary/50 text-slate-200 pl-12 pr-3.5 py-3 rounded-xl text-xs font-black uppercase tracking-wider focus:outline-none placeholder:text-slate-600 transition-all duration-150 font-mono"
                    placeholder="e.g. ABC12345"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Subsection 3: Service Programs */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-white/5">
              <ChevronRight className="text-emerald-500" size={14} />
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Delivery & Care Logistics</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest" htmlFor="soldDate">Delivery Date</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    type="date"
                    id="soldDate"
                    value={formData.soldDate}
                    onChange={handleChange}
                    className="w-full bg-[#0e1324] border border-white/5 focus:border-brand-primary/50 text-slate-200 pl-12 pr-3.5 py-3 rounded-xl text-xs font-black uppercase tracking-wider focus:outline-none transition-all duration-150 appearance-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest" htmlFor="soldByUserId">Attribution Agent</label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <select
                    id="soldByUserId"
                    value={formData.soldByUserId}
                    onChange={handleChange}
                    className="w-full bg-[#0e1324] border border-white/5 focus:border-brand-primary/50 text-slate-200 pl-12 pr-3.5 py-3 rounded-xl text-xs font-extrabold uppercase tracking-wider focus:outline-none transition-all duration-150 appearance-none cursor-pointer"
                  >
                    <option value="">Select Salesperson...</option>
                    {salespeople.map(sp => (
                      <option key={sp.id} value={sp.id}>{sp.firstName} {sp.lastName}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 text-[10px]">▼</div>
                </div>
              </div>
            </div>
          </div>

          {/* Subsection 4: Profile Notes */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-white/5">
              <ChevronRight className="text-amber-500" size={14} />
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enrollment & Profile Notes</h3>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest" htmlFor="notes">Onboarding Notes</label>
              <textarea
                id="notes"
                value={formData.notes || ''}
                onChange={handleChange}
                className="w-full bg-[#0e1324] border border-white/5 focus:border-brand-primary/50 text-slate-200 p-4 rounded-xl text-xs font-semibold focus:outline-none placeholder:text-slate-600 transition-all duration-150 h-24 resize-none"
                placeholder="Write any personal notes, service histories, or client preferences here..."
              />
            </div>
          </div>

          {/* Reminders Toggle & Enrollment Submission */}
          <div className="pt-6 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-6">
            <label className="flex items-center gap-3 cursor-pointer group w-full sm:w-auto">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  id="enableServiceAlert"
                  checked={formData.enableServiceAlert}
                  onChange={handleChange}
                  className="peer h-5 w-5 bg-slate-900 border-white/10 rounded-md text-brand-primary focus:ring-offset-slate-900 transition-all"
                />
              </div>
              <div className="text-left">
                <span className="text-xs font-black uppercase text-slate-300 group-hover:text-white transition-colors block">Auto-Enroll Alerts</span>
                <span className="text-[9px] font-semibold text-slate-500 block">Queue system alarms at calculated averages</span>
              </div>
            </label>

            <button
              type="submit"
              className="w-full sm:w-auto py-3 px-10 rounded-xl font-black uppercase text-xs tracking-wider text-black bg-brand-primary hover:bg-brand-primary/90 shadow-xl shadow-brand-primary/10 transition-all duration-200 shrink-0"
            >
              Enroll New Driver
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


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
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { computeServiceReminderDueDate } from '../../../lib/serviceReminder';

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

      const response = await fetch('/api/parse-sales-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Image }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to scan sales note.');
      }

      const result = data;
      
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
      const reminderAnchor =
        formData.soldDate || new Date().toISOString().slice(0, 10);

      await addDoc(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers'), {
        ...formData,
        vinLast8: formData.vinLast8.toUpperCase(),
        soldByUsername: selectedSP?.username || null,
        dealershipId: currentUser.dealershipId,
        createdAt: Timestamp.now(),
        addedBy: currentUser.uid,
        addedByUsername: currentUser.username,
        lastAcknowledgedCycle: 0,
        serviceAlertTriggered: false,
        serviceReminderDueDate: computeServiceReminderDueDate(reminderAnchor),
      });

      await logSystemAction(
        "Customer Added",
        `Added customer ${formData.firstName} ${formData.lastName} (${formData.model || 'Unknown Model'})`,
        'demographics',
        currentUser.email,
        currentUser.username,
        currentUser.dealershipId
      );

      onSuccess("Customer added. Service reminders are scheduled.");
      setFormData({
        firstName: '', lastName: '', phone: '', email: '',
        make: 'Hyundai', model: '', vin: '', vinLast8: '', soldDate: '',
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
      <div className="max-w-4xl mx-auto mb-4">
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <p className="crm-label">Sales</p>
            <h1 className="crm-page-title">Add customer</h1>
          </div>
        <button
          type="button"
          onClick={() => setShowAIScanner(prev => !prev)}
          className="btn-secondary shrink-0"
        >
          <Camera size={15} />
          {showAIScanner ? 'Close scanner' : 'Scan a form'}
        </button>
        </div>

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
                  dragActive ? 'border-brand-primary bg-brand-primary/5' : 'border-white/10 hover:border-white/20 bg-surface-base/80'
                }`}
              >
                <div className={`p-4 rounded-full mb-4 transition-all ${dragActive ? 'bg-brand-primary/10 text-brand-primary' : 'bg-white/5 text-slate-400 group-hover:bg-white/10 group-hover:text-brand-primary'}`}>
                  {isProcessing ? (
                    <Loader2 className="animate-spin" size={24} />
                  ) : (
                    <Camera size={24} />
                  )}
                </div>

                <h5 className="text-xs font-semibold text-slate-200">Form Scanner</h5>
                <p className="text-[11px] text-slate-400 max-w-md mt-1 leading-relaxed">
                  Drag and drop a written sales memorandum, buyer contract note, or photo ID. The system's Gemini-powered OCR automatically extracts demographics and vehicle specs to fill the questionnaire below.
                </p>

                <label className="mt-5 py-2.5 px-6 rounded-xl bg-brand-primary/10 hover:bg-brand-primary/15 border border-brand-primary/20 text-xs font-semibold text-brand-primary cursor-pointer transition-all">
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
        <form onSubmit={handleSubmit} className="card-base p-4 sm:p-6 space-y-6">
          
          {/* Elegant header segment inside card */}
          <p className="crm-label">We schedule their first service reminder from the delivery date.</p>

          {/* Subsection 1: Demographics */}
          <div className="space-y-6">
            <h3 className="text-sm font-semibold">Customer</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="input-label !mb-0" htmlFor="firstName">First name</label>
                <input
                  type="text"
                  id="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                  className="input-field "
                  placeholder="Liam"
                />
              </div>

              <div className="space-y-1.5">
                <label className="input-label !mb-0" htmlFor="lastName">Last name</label>
                <input
                  type="text"
                  id="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                  className="input-field "
                  placeholder="Cooper"
                />
              </div>

              <div className="space-y-1.5">
                <label className="input-label !mb-0" htmlFor="phone">Phone</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-secondary)' }} size={14} />
                  <input
                    type="tel"
                    id="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="input-field pl-10 font-mono"
                    placeholder="(555) 000-0000"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="input-label !mb-0" htmlFor="email">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-secondary)' }} size={14} />
                  <input
                    type="email"
                    id="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="input-field pl-10"
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="input-label !mb-0" htmlFor="language">Language</label>
                <div className="relative">
                  <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-secondary)' }} size={14} />
                  <select
                    id="language"
                    value={formData.language}
                    onChange={handleChange}
                    className="input-field pl-10 appearance-none cursor-pointer"
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="Mandarin">Mandarin</option>
                    <option value="Korean">Korean</option>
                    <option value="Other">Other</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" size={16} style={{ color: 'var(--color-text-secondary)' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Subsection 2: Vehicle Specs */}
          <div className="space-y-6">
            <h3 className="text-sm font-semibold">Vehicle</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="input-label !mb-0" htmlFor="vin">VIN</label>
                <div className="relative">
                  <BadgeCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-secondary)' }} size={14} />
                  <input
                    type="text"
                    id="vin"
                    value={formData.vin}
                    onChange={handleVinChange}
                    maxLength={17}
                    className="input-field pl-10 pr-12 font-mono"
                    placeholder="17 characters"
                  />
                  {isDecoding && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <Loader2 className="animate-spin text-brand-primary" size={14} />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="input-label !mb-0" htmlFor="model">Model</label>
                <div className="relative">
                  <Car className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-secondary)' }} size={14} />
                  <input
                    type="text"
                    id="model"
                    value={formData.model}
                    onChange={handleChange}
                    className="input-field pl-10"
                    placeholder="2024 Elantra Hybrid"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="input-label !mb-0" htmlFor="vinLast8">Last 8 of VIN</label>
                <div className="relative">
                  <BadgeCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-secondary)' }} size={14} />
                  <input
                    type="text"
                    id="vinLast8"
                    value={formData.vinLast8}
                    onChange={handleChange}
                    maxLength={8}
                    className="input-field pl-10 font-mono"
                    placeholder="ABC12345"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Subsection 3: Service Programs */}
          <div className="space-y-6">
            <h3 className="text-sm font-semibold">Sale</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="input-label !mb-0" htmlFor="soldDate">Delivery date</label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-secondary)' }} size={14} />
                  <input
                    type="date"
                    id="soldDate"
                    value={formData.soldDate}
                    onChange={handleChange}
                    className="input-field pl-10 appearance-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="input-label !mb-0" htmlFor="soldByUserId">Salesperson</label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-secondary)' }} size={14} />
                  <select
                    id="soldByUserId"
                    value={formData.soldByUserId}
                    onChange={handleChange}
                    className="input-field pl-10 appearance-none cursor-pointer"
                  >
                    <option value="">Select salesperson</option>
                    {salespeople.map(sp => (
                      <option key={sp.id} value={sp.id}>{sp.firstName} {sp.lastName}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" size={16} style={{ color: 'var(--color-text-secondary)' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Subsection 4: Profile Notes */}
          <div className="space-y-6">
            <h3 className="text-sm font-semibold">Notes</h3>

            <div className="space-y-1.5">
              <label className="input-label !mb-0" htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                value={formData.notes || ''}
                onChange={handleChange}
                className="input-field h-24 resize-none"
                placeholder="Anything the service team should know"
              />
            </div>
          </div>

          {/* Reminders Toggle & Enrollment Submission */}
          <div className="pt-5 border-t flex flex-col sm:flex-row justify-between items-center gap-5">
            <label className="flex items-center gap-3 cursor-pointer group w-full sm:w-auto">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  id="enableServiceAlert"
                  checked={formData.enableServiceAlert}
                  onChange={handleChange}
                  className="tap-expand peer h-5 w-5 rounded-md text-brand-primary accent-[var(--color-brand-primary)] transition-all"
                />
              </div>
              <div className="text-left">
                <span className="text-sm font-medium block">Send service reminders</span>
                <span className="crm-label block">First reminder is based on the delivery date</span>
              </div>
            </label>

            <button
              type="submit"
              className="btn-primary w-full sm:w-auto sm:px-10 shrink-0"
            >
              Save customer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


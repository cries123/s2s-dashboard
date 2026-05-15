import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { User } from '../../types';
import { Camera, Loader2, User as UserIcon, Phone, Mail, Car, Calendar, Globe, BadgeCheck, Sparkles } from 'lucide-react';

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
    soldByUserId: ''
  });

  const [salespeople, setSalespeople] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);

  useEffect(() => {
    // Load salespeople for the dropdown
    const loadSalespeople = async () => {
      const q = query(
        collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users'),
        where('jobTitle', 'in', ['Salesperson', 'Manager'])
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSalespeople(list);
    };
    loadSalespeople();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value, type } = e.target as HTMLInputElement;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData(prev => ({ ...prev, [id]: val }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
      
      // Auto-decode VIN if full VIN is found
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

      onSuccess("AI successfully extracted data from image.");
    } catch (err: any) {
      onError(`AI Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
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

      const make = getVal(26); // Make
      const model = getVal(28); // Model
      const year = getVal(29); // Model Year
      
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
      // Duplicate check
      if (formData.vinLast8) {
        const q = query(
          collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers'),
          where('vinLast8', '==', formData.vinLast8.toUpperCase())
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          onError(`Customer with VIN ending in ${formData.vinLast8} already exists.`);
          return;
        }
      }

      const selectedSP = salespeople.find(s => s.id === formData.soldByUserId);
      
      await addDoc(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers'), {
        ...formData,
        vinLast8: formData.vinLast8.toUpperCase(),
        soldByUsername: selectedSP?.username || null,
        createdAt: Timestamp.now(),
        addedBy: currentUser.uid,
        addedByUsername: currentUser.username,
        lastAcknowledgedCycle: 0,
        serviceAlertTriggered: false
      });

      onSuccess("Customer saved successfully!");
      setFormData({
        firstName: '', lastName: '', phone: '', email: '',
        make: 'Hyundai', model: '', vinLast8: '', soldDate: '',
        language: 'English', enableServiceAlert: true, soldByUserId: ''
      });
    } catch (err: any) {
      onError(`Error: ${err.message}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card-base overflow-hidden">
        <div className="bg-slate-900/50 p-6 border-b border-surface-border">
          <h2 className="text-xl font-bold text-white flex items-center gap-3">
            <UserIcon className="text-brand-primary" /> 
            New Customer Onboarding
          </h2>
          <p className="text-sm text-slate-400 mt-1">Enroll a new customer into the Sales-to-Service retention program.</p>
        </div>
        
        <div className="p-8">
          <div className="mb-10 p-6 bg-brand-primary/5 border border-brand-primary/10 rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Camera size={64} />
            </div>
            
            <div className="relative z-10">
              <h3 className="text-sm font-bold text-brand-secondary mb-2 flex items-center gap-2 uppercase tracking-widest">
                <Sparkles size={16} />
                AI Silver Bullet Extraction
              </h3>
              <p className="text-sm text-slate-300 mb-6 max-w-lg">
                Snap a photo of the sales folder or deal sheet. Our AI will automatically extract customer details, VIN, and deal info.
              </p>
              
              <div className="flex items-center gap-4">
                <label className="btn-primary cursor-pointer">
                  <Camera size={18} />
                  <span>Scan Document</span>
                  <input type="file" onChange={handleImageUpload} accept="image/*" className="hidden" />
                </label>
                {isProcessing && (
                  <div className="flex items-center gap-2 text-brand-secondary font-medium animate-pulse">
                    <Loader2 className="animate-spin" size={18} />
                    <span>Processing details...</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-1.5">
                <label className="input-label" htmlFor="firstName">First Name</label>
                <input type="text" id="firstName" value={formData.firstName} onChange={handleChange} required className="input-field" placeholder="e.g. John" />
              </div>
              <div className="space-y-1.5">
                <label className="input-label" htmlFor="lastName">Last Name</label>
                <input type="text" id="lastName" value={formData.lastName} onChange={handleChange} required className="input-field" placeholder="e.g. Doe" />
              </div>
              <div className="space-y-1.5">
                <label className="input-label" htmlFor="phone">Primary Phone</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input type="tel" id="phone" value={formData.phone} onChange={handleChange} className="input-field pl-12" placeholder="(555) 000-0000" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="input-label" htmlFor="email">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input type="email" id="email" value={formData.email} onChange={handleChange} className="input-field pl-12" placeholder="john@example.com" />
                </div>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="input-label" htmlFor="vin">Full VIN (17 Characters)</label>
                <div className="relative">
                  <BadgeCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input 
                    type="text" 
                    id="vin" 
                    value={formData.vin} 
                    onChange={handleVinChange} 
                    maxLength={17} 
                    className="input-field pl-12 font-mono" 
                    placeholder="Enter 17-character VIN for auto-decode" 
                  />
                  {isDecoding && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <Loader2 className="animate-spin text-brand-primary" size={18} />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="input-label" htmlFor="model">Vehicle Model</label>
                <div className="relative">
                  <Car className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input type="text" id="model" value={formData.model} onChange={handleChange} className="input-field pl-12" placeholder="e.g. Palisade" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="input-label" htmlFor="vinLast8">VIN (Last 8)</label>
                <div className="relative">
                  <BadgeCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input type="text" id="vinLast8" value={formData.vinLast8} onChange={handleChange} maxLength={8} className="input-field pl-12 font-mono" placeholder="ABC12345" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="input-label" htmlFor="soldDate">Delivery Date</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input type="date" id="soldDate" value={formData.soldDate} onChange={handleChange} className="input-field pl-12" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="input-label" htmlFor="language">Preferred Language</label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <select id="language" value={formData.language} onChange={handleChange} className="input-field pl-12 appearance-none">
                    <option>English</option>
                    <option>Spanish</option>
                    <option>French</option>
                    <option>Mandarin</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-700/50 flex flex-col sm:flex-row justify-between items-center gap-6">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative flex items-center">
                  <input 
                    type="checkbox" 
                    id="enableServiceAlert" 
                    checked={formData.enableServiceAlert} 
                    onChange={handleChange} 
                    className="peer h-5 w-5 bg-slate-900 border-slate-700 rounded-md text-brand-primary focus:ring-offset-slate-900 transition-all" 
                  />
                </div>
                <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Auto-enroll in 6-month service reminders</span>
              </label>

              <button type="submit" className="w-full sm:w-auto btn-primary px-10">
                Enroll Customer
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

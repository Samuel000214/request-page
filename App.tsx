import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ArrowLeft, 
  Monitor, 
  Smartphone, 
  Globe, 
  AlertCircle, 
  MapPin, 
  Calendar, 
  CheckCircle2, 
  Loader2,
  ChevronRight,
  X,
  RotateCcw,
  Trash2,
  ExternalLink,
  Cpu,
  UploadCloud,
  Sparkles,
  ShieldAlert,
  Clock,
  CalendarDays,
  LocateFixed
} from 'lucide-react';
import { DeviceType, PriorityLevel, FormData } from './types';
import { GoogleGenAI } from "@google/genai";

// Constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTOS = 10;

// Validation Regex
const CONTACT_VALIDATION_REGEX = /^(?:(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\s*\)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?)?([2-9]1[02-9]|[2-9][02-9]1|[2-9][02-9]{2})\s*(?:[.-]\s*)?([0-9]{4})(?:\s*(?:x|ext\.?|#)\s*([0-9]+))?$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Initial state
const INITIAL_FORM: FormData = {
  deviceType: null,
  deviceModel: '',
  description: '',
  priority: PriorityLevel.MEDIUM,
  address: '',
  contactInfo: '',
  preferredDate1: '',
  preferredDate2: '',
  photos: []
};

interface UploadProgress {
  progress: number;
  status: 'uploading' | 'complete' | 'error';
}

const App: React.FC = () => {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [uploads, setUploads] = useState<Record<string, UploadProgress>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [previewUrls, setPreviewUrls] = useState<{id: string, url: string, loading: boolean}[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [locationSourceUrl, setLocationSourceUrl] = useState<string | null>(null);

  // Gemini State
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Validation states
  const [contactError, setContactError] = useState<string | null>(null);

  // Refs
  const step1Ref = useRef<HTMLElement>(null);
  const step2Ref = useRef<HTMLElement>(null);
  const step3Ref = useRef<HTMLElement>(null);
  const step4Ref = useRef<HTMLElement>(null);
  const thumbnailScrollRef = useRef<HTMLDivElement>(null);

  const scrollToStep = (step: number) => {
    const refs = [step1Ref, step2Ref, step3Ref, step4Ref];
    const target = refs[step - 1]?.current;
    if (target) {
      window.scrollTo({
        top: target.offsetTop - 120,
        behavior: 'smooth'
      });
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (isFormValid && !isSubmitting) {
          setShowConfirmModal(true);
        }
      }
      if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        scrollToStep(parseInt(e.key));
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [formData, contactError]);

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '-20% 0px -60% 0px',
      threshold: 0
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (entry.target === step1Ref.current) setCurrentStep(1);
          if (entry.target === step2Ref.current) setCurrentStep(2);
          if (entry.target === step3Ref.current) setCurrentStep(3);
          if (entry.target === step4Ref.current) setCurrentStep(4);
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);
    [step1Ref, step2Ref, step3Ref, step4Ref].forEach(ref => {
      if (ref.current) observer.observe(ref.current);
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    previewUrls.forEach(p => URL.revokeObjectURL(p.url));
    const newPreviews = formData.photos.map(file => {
      const url = URL.createObjectURL(file);
      return { id: file.name + file.size, url, loading: true };
    });
    setPreviewUrls(newPreviews);
    newPreviews.forEach((prev) => {
      const img = new Image();
      img.src = prev.url;
      img.onload = () => {
        setPreviewUrls(current => current.map(c => c.id === prev.id ? { ...c, loading: false } : c));
      };
    });
    return () => newPreviews.forEach(p => URL.revokeObjectURL(p.url));
  }, [formData.photos.length]);

  useEffect(() => {
    if (thumbnailScrollRef.current) {
      thumbnailScrollRef.current.scrollTo({
        left: thumbnailScrollRef.current.scrollWidth,
        behavior: 'smooth'
      });
    }
  }, [previewUrls.length]);

  const handleAiAnalysis = async () => {
    if (!formData.description) return;
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `You are a technical support expert. Analyze the following issue and provide a concise, 2-3 sentence smart diagnosis or troubleshooting step.
      
      IMPORTANT: If the user hasn't specified the exact Operating System or specific hardware model details that are crucial for this specific problem, YOU MUST explicitly ask for those details in your response.

      Context:
      Device Type: ${formData.deviceType}
      Model/OS provided by user: ${formData.deviceModel || 'Not specified'}
      Issue Description: ${formData.description}
      
      Provide a highly professional and technical analysis. Focus on possible hardware or software root causes.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      setAiAnalysis(response.text);
    } catch (err) {
      console.error("AI Analysis failed", err);
      setAiAnalysis("Unable to perform AI diagnosis at this time. Please proceed with the description.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const validateContact = (value: string) => {
    if (value.trim() && !CONTACT_VALIDATION_REGEX.test(value)) {
      setContactError("Please enter a valid phone number or email.");
    } else {
      setContactError(null);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value as any }));
    if (name === 'contactInfo') validateContact(value);
  };

  const handleFiles = (files: File[]) => {
    setFileErrors([]);
    const validFiles: File[] = [];
    const currentCount = formData.photos.length;

    if (currentCount >= MAX_PHOTOS) return;

    files.forEach(file => {
      if (ALLOWED_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE) {
        validFiles.push(file);
      }
    });

    let filesToAdd = validFiles;
    const remainingSlots = MAX_PHOTOS - currentCount;
    if (validFiles.length > remainingSlots) {
      filesToAdd = validFiles.slice(0, remainingSlots);
    }

    if (filesToAdd.length > 0) {
      setFormData(prev => ({ ...prev, photos: [...prev.photos, ...filesToAdd] }));
      filesToAdd.forEach(file => {
        const id = file.name + file.size;
        simulateFileUpload(id);
      });
    }
  };

  const simulateFileUpload = (fileId: string) => {
    setUploads(prev => ({ ...prev, [fileId]: { progress: 0, status: 'uploading' } }));
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += Math.floor(Math.random() * 30) + 10;
      if (currentProgress >= 100) {
        currentProgress = 100;
        setUploads(prev => ({ ...prev, [fileId]: { progress: 100, status: 'complete' } }));
        clearInterval(interval);
      } else {
        setUploads(prev => ({ ...prev, [fileId]: { ...prev[fileId], progress: currentProgress } }));
      }
    }, 300);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    setFormData(prev => ({ ...prev, photos: prev.photos.filter((_, i) => i !== index) }));
  };

  const handleLocateMe = () => {
    if (navigator.geolocation) {
      setIsLocating(true);
      setLocationStatus("Accessing GPS...");
      
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        setLocationStatus("Decoding Philippine address...");
        
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Identify the exact human-readable street address for the Philippine coordinates ${latitude}, ${longitude}. 
            You MUST structure the address logically using the following structure in words only:
            Line 1: House/Building #, Street Name, Subdivision/Village Name.
            Line 2: Barangay or Zone.
            Line 3: City or Municipality, Province.
            Line 4: 4-digit Postal Code.
            
            Return ONLY the full structured address as a single, clear block of text. Avoid all coordinate numbers in the output. Use words only.`,
            config: {
              tools: [{googleMaps: {}}],
              toolConfig: {
                retrievalConfig: {
                  latLng: {
                    latitude: latitude,
                    longitude: longitude
                  }
                }
              }
            },
          });
          const result = response.text?.trim();
          
          const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
          if (groundingChunks && groundingChunks.length > 0) {
            const mapUrl = groundingChunks[0].maps?.uri;
            if (mapUrl) setLocationSourceUrl(mapUrl);
          }

          if (result && !result.includes(latitude.toString().slice(0, 4))) {
            setFormData(prev => ({ ...prev, address: result }));
            setLocationStatus("Address updated successfully!");
          } else {
            setFormData(prev => ({ ...prev, address: "Unknown Philippine Address" }));
            setLocationStatus("Location found, but address is unclear.");
          }
        } catch (err) {
          console.error("Reverse geocoding failed", err);
          setFormData(prev => ({ ...prev, address: "My Current Location" }));
          setLocationStatus("Network error. Using coordinates placeholder.");
        } finally {
          setIsLocating(false);
          setTimeout(() => setLocationStatus(null), 3000);
        }
      }, (error) => {
        setIsLocating(false);
        setLocationStatus(error.code === 1 ? "Permission denied." : "GPS unavailable.");
        setTimeout(() => setLocationStatus(null), 3000);
      }, { timeout: 10000 });
    }
  };

  const performReset = () => {
    setFormData(INITIAL_FORM);
    setUploads({});
    setShowResetModal(false);
    setContactError(null);
    setAiAnalysis(null);
    setLocationSourceUrl(null);
    scrollToStep(1);
  };

  const isFormValid = useMemo(() => {
    return formData.description.trim().length > 0 && 
           formData.address.trim().length > 0 && 
           formData.contactInfo.trim().length > 0 && 
           formData.deviceType !== null &&
           !contactError;
  }, [formData, contactError]);

  const confirmSubmit = () => {
    setShowConfirmModal(false);
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
    }, 1200);
  };

  if (isSubmitted) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-[#EDF2F7]">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10 text-center animate-in zoom-in-95 duration-500" role="alert">
          <div className="w-20 h-20 bg-green-50 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="w-10 h-10 text-green-500" aria-hidden="true" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Success!</h2>
          <p className="text-slate-500 mb-10 leading-relaxed font-medium">Your request has been submitted. A technician will be assigned shortly.</p>
          <button onClick={() => { setIsSubmitted(false); setFormData(INITIAL_FORM); }} className="w-full bg-slate-900 text-white font-black py-5 rounded-[1.5rem] hover:bg-slate-800 transition-all shadow-xl focus:ring-4 focus:ring-slate-300 outline-none">Go Home</button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#F1F5F9] pb-24">
      {/* Location Status Toast - Non-intrusive floating pill */}
      {locationStatus && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[3000] animate-in slide-in-from-bottom-4 fade-in duration-300 pointer-events-none">
          <div className="bg-slate-900/90 backdrop-blur-xl text-white px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl border border-white/10">
            {isLocating ? (
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            ) : (
              <LocateFixed className="w-4 h-4 text-green-400" />
            )}
            <span className="text-xs font-black uppercase tracking-widest">{locationStatus}</span>
          </div>
        </div>
      )}

      <nav className="sticky top-6 z-50 px-4 max-w-4xl mx-auto" aria-label="Global Progress">
        <div className="bg-white/80 backdrop-blur-2xl border border-slate-200/50 shadow-[0_10px_40px_rgba(0,0,0,0.05)] rounded-[2rem] p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex gap-1 px-1" role="progressbar" aria-valuenow={currentStep} aria-valuemin={1} aria-valuemax={4}>
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className={`h-1.5 w-8 rounded-full transition-all duration-500 ${step === currentStep ? 'bg-blue-600 w-12' : step < currentStep ? 'bg-blue-200' : 'bg-slate-100'}`} aria-current={step === currentStep ? 'step' : undefined} />
              ))}
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:block">Step {currentStep}/4</span>
          </div>
          <div className="flex items-center gap-2">
             <button onClick={() => setShowResetModal(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all focus:ring-2 focus:ring-blue-500 outline-none" aria-label="Reset all form fields">
              <RotateCcw className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reset</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 mt-12">
        <header className="mb-16">
          <button className="flex items-center text-slate-400 hover:text-slate-900 transition-colors mb-6 font-bold text-sm focus:outline-none focus:underline" aria-label="Go back">
            <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" /> Back
          </button>
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.1] mb-4">
            Request an <span className="text-blue-600 underline underline-offset-8 decoration-4 decoration-blue-100">Expert</span>
          </h1>
          <p className="text-lg text-slate-500 font-medium">Certified hardware specialists ready to help.</p>
        </header>

        <form onSubmit={(e) => { e.preventDefault(); if(isFormValid) setShowConfirmModal(true); }} className="space-y-12">
          {/* Step 01 */}
          <section ref={step1Ref} className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-sm border border-slate-200/60">
            <div className="flex items-center gap-4 mb-10">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black text-lg" aria-hidden="true">01</div>
              <h2 className="text-2xl font-black text-slate-900">Device Selection</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
              <DeviceTile icon={<Monitor className="w-6 h-6" />} label={DeviceType.LAPTOP} active={formData.deviceType === DeviceType.LAPTOP} onClick={() => setFormData(p => ({...p, deviceType: DeviceType.LAPTOP}))} />
              <DeviceTile icon={<Smartphone className="w-6 h-6" />} label={DeviceType.SMARTPHONE} active={formData.deviceType === DeviceType.SMARTPHONE} onClick={() => setFormData(p => ({...p, deviceType: DeviceType.SMARTPHONE}))} />
              <DeviceTile icon={<Globe className="w-6 h-6" />} label={DeviceType.WEBSITE} active={formData.deviceType === DeviceType.WEBSITE} onClick={() => setFormData(p => ({...p, deviceType: DeviceType.WEBSITE}))} />
            </div>

            {formData.deviceType && (
              <div className="space-y-4 animate-in slide-in-from-top-4 duration-500">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1" htmlFor="deviceModel">Model / Version Details</label>
                <div className="relative group">
                  <Cpu className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                  <input 
                    id="deviceModel"
                    type="text" 
                    name="deviceModel" 
                    value={formData.deviceModel} 
                    onChange={handleInputChange} 
                    placeholder="e.g. Dell XPS 15, Windows 11" 
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-[1.25rem] pl-16 pr-12 py-5 font-bold outline-none transition-all shadow-inner" 
                    aria-label="Device Model and OS"
                  />
                  {formData.deviceModel && (
                    <button type="button" onClick={() => setFormData(p => ({...p, deviceModel: ''}))} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-400" aria-label="Clear model field">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Step 02 */}
          <section ref={step2Ref} className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-sm border border-slate-200/60">
            <div className="flex items-center gap-4 mb-10">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black text-lg" aria-hidden="true">02</div>
              <h2 className="text-2xl font-black text-slate-900">Issue Details</h2>
            </div>

            <div className="space-y-8">
              <div className="space-y-4">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Priority Level</label>
                <div className="flex flex-wrap gap-3">
                  {Object.values(PriorityLevel).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, priority: p }))}
                      className={`px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all border-2 flex items-center gap-2 ${
                        formData.priority === p 
                          ? (p === PriorityLevel.URGENT ? 'bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-200' : 'bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200')
                          : 'bg-white text-slate-400 border-slate-100 hover:border-slate-300 shadow-sm'
                      }`}
                      aria-pressed={formData.priority === p}
                    >
                      {p === PriorityLevel.URGENT && <ShieldAlert className="w-4 h-4" />}
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Description</label>
                  <button type="button" onClick={handleAiAnalysis} disabled={!formData.description || isAnalyzing} className="flex items-center gap-2 text-blue-600 font-black text-[10px] uppercase tracking-widest bg-blue-50 px-4 py-2 rounded-xl hover:bg-blue-100 transition-all disabled:opacity-50 shadow-sm">
                    {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Smart Diagnosis
                  </button>
                </div>
                <div className="relative">
                  <textarea name="description" value={formData.description} onChange={handleInputChange} placeholder="Describe what's happening..." className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-[1.5rem] p-6 min-h-[160px] text-slate-700 font-medium outline-none transition-all resize-none shadow-inner" aria-required="true" />
                </div>
                {aiAnalysis && (
                  <div className="p-6 bg-blue-50/50 border border-blue-100 rounded-[1.5rem] flex items-start gap-4 animate-in slide-in-from-top-2 duration-300">
                    <Sparkles className="w-5 h-5 text-blue-600 mt-1" />
                    <div>
                      <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">AI Recommendation</h4>
                      <p className="text-sm text-slate-700 font-medium leading-relaxed">{aiAnalysis}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Step 03 */}
          <section ref={step3Ref} className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-sm border border-slate-200/60">
            <div className="flex items-center gap-4 mb-10">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black text-lg" aria-hidden="true">03</div>
              <h2 className="text-2xl font-black text-slate-900">Logistics</h2>
            </div>
            <div className="space-y-8">
              <div className="space-y-4">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Service Location</label>
                <div className="relative group">
                  <MapPin className="absolute left-6 top-6 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
                  <textarea name="address" value={formData.address} onChange={handleInputChange} placeholder="Building/House #, Street, Barangay, City, Province, Postal Code..." className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-[1.25rem] pl-16 pr-32 py-5 font-semibold text-slate-800 outline-none transition-all shadow-inner leading-relaxed min-h-[120px] resize-none" aria-required="true" />
                  <div className="absolute right-4 top-5">
                    <button 
                      type="button" 
                      onClick={handleLocateMe} 
                      disabled={isLocating}
                      className={`px-4 py-2 bg-white text-[10px] font-black uppercase rounded-xl border border-slate-200 transition-all shadow-sm flex items-center gap-2 ${isLocating ? 'opacity-50' : 'hover:border-blue-500 hover:text-blue-600'}`}
                    >
                      {isLocating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Locate'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Contact Info</label>
                <input type="text" name="contactInfo" value={formData.contactInfo} onChange={handleInputChange} placeholder="Phone or email..." className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-[1.25rem] px-6 py-5 font-bold outline-none transition-all shadow-inner" />
                {contactError && <p className="text-rose-500 text-xs font-bold ml-1">{contactError}</p>}
              </div>

              {/* Availability Slots */}
              <div className="space-y-6 pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-blue-500" /> Preferred Visit Time
                  </label>
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Select up to 2 slots</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`relative p-6 rounded-[1.5rem] border-2 transition-all ${formData.preferredDate1 ? 'bg-white border-blue-500 shadow-lg shadow-blue-500/5' : 'bg-slate-50 border-transparent hover:border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${formData.preferredDate1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>1</div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Primary Slot</span>
                      </div>
                      {formData.preferredDate1 && (
                        <button type="button" onClick={() => setFormData(p => ({...p, preferredDate1: ''}))} className="p-1.5 bg-slate-100 text-slate-400 rounded-lg hover:bg-rose-50 hover:text-rose-500 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                      <input 
                        type="datetime-local" 
                        name="preferredDate1" 
                        value={formData.preferredDate1} 
                        onChange={handleInputChange} 
                        className="w-full bg-transparent border-0 pl-10 pr-4 py-3 font-bold text-slate-900 focus:ring-0 cursor-pointer outline-none"
                      />
                    </div>
                  </div>

                  <div className={`relative p-6 rounded-[1.5rem] border-2 transition-all ${formData.preferredDate2 ? 'bg-white border-blue-500 shadow-lg shadow-blue-500/5' : 'bg-slate-50 border-transparent hover:border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${formData.preferredDate2 ? 'bg-blue-400 text-white' : 'bg-slate-200 text-slate-400'}`}>2</div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Backup Slot</span>
                      </div>
                      {formData.preferredDate2 && (
                        <button type="button" onClick={() => setFormData(p => ({...p, preferredDate2: ''}))} className="p-1.5 bg-slate-100 text-slate-400 rounded-lg hover:bg-rose-50 hover:text-rose-500 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                      <input 
                        type="datetime-local" 
                        name="preferredDate2" 
                        value={formData.preferredDate2} 
                        onChange={handleInputChange} 
                        className="w-full bg-transparent border-0 pl-10 pr-4 py-3 font-bold text-slate-900 focus:ring-0 cursor-pointer outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Step 04 */}
          <section ref={step4Ref} className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-sm border border-slate-200/60">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black text-lg" aria-hidden="true">04</div>
                <h2 className="text-2xl font-black text-slate-900">Visual Proof</h2>
              </div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{formData.photos.length}/10 Photos</div>
            </div>
            
            <div className="grid grid-cols-1 gap-6">
              <label className="relative aspect-video rounded-[2rem] border-2 border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center cursor-pointer hover:bg-white hover:border-blue-300 transition-all shadow-sm">
                <UploadCloud className="w-8 h-8 text-blue-600 mb-4" />
                <h3 className="font-black text-slate-900">Drop or Browse</h3>
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
              </label>
            </div>

            {previewUrls.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-8">
                {previewUrls.map((p, idx) => (
                  <div key={p.id} className="relative group aspect-square rounded-[1.5rem] overflow-hidden border-2 border-white shadow-lg bg-slate-100">
                    <img src={p.url} className="w-full h-full object-cover" alt="Proof" />
                    <button type="button" onClick={() => removePhoto(idx)} className="absolute top-2 right-2 w-8 h-8 bg-black/40 backdrop-blur-md text-white rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="flex flex-col sm:flex-row items-center gap-6 pt-10">
            <button type="submit" disabled={!isFormValid || isSubmitting} className={`flex-[2] h-20 rounded-[2rem] font-black text-xl flex items-center justify-center gap-3 transition-all shadow-2xl ${!isFormValid ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-black active:scale-95'}`}>
              {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Submit Request <ChevronRight className="w-6 h-6" /></>}
            </button>
            <button type="button" onClick={() => setShowResetModal(true)} className="flex-1 h-20 rounded-[2rem] border-2 border-slate-200 bg-white font-black text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all">Reset Form</button>
          </div>
        </form>
      </div>

      {/* MODALS */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="bg-white rounded-[2rem] p-8 max-w-[320px] w-full shadow-2xl relative z-20 text-center animate-in zoom-in-95 duration-300">
            <CheckCircle2 className="w-12 h-12 text-blue-600 mx-auto mb-6" />
            <h3 className="text-xl font-black text-slate-900 mb-2">Ready to Submit?</h3>
            <p className="text-sm text-slate-500 mb-8 font-medium">Please verify your details before sending the request.</p>
            <div className="flex flex-col gap-3">
              <button onClick={confirmSubmit} className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl">Confirm Submission</button>
              <button onClick={() => setShowConfirmModal(false)} className="w-full py-3 text-slate-400 font-bold">Wait, let me check</button>
            </div>
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="fixed inset-0 z-[2001] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowResetModal(false)} />
          <div className="bg-white rounded-[2rem] p-8 max-w-[320px] w-full shadow-2xl relative z-20 text-center animate-in zoom-in-95 duration-300">
            <Trash2 className="w-12 h-12 text-rose-500 mx-auto mb-6" />
            <h3 className="text-xl font-black text-slate-900 mb-2">Reset Form?</h3>
            <p className="text-sm text-slate-500 mb-8 font-medium">This will clear all entries permanently.</p>
            <div className="flex flex-col gap-3">
              <button onClick={performReset} className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl">Reset Everything</button>
              <button onClick={() => setShowResetModal(false)} className="w-full py-3 text-slate-400 font-bold">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DeviceTile: React.FC<{ icon: React.ReactNode; label: string; active: boolean; onClick: () => void; }> = ({ icon, label, active, onClick }) => (
  <button type="button" onClick={onClick} className={`p-8 rounded-[2rem] border-2 text-left transition-all h-full flex flex-col items-start ${active ? 'border-blue-600 bg-blue-50/50 shadow-xl' : 'border-slate-100 bg-slate-50 hover:bg-white focus:border-blue-300'}`} aria-pressed={active}>
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-8 transition-all ${active ? 'bg-blue-600 text-white scale-110' : 'bg-white text-slate-400'}`}>{icon}</div>
    <div className="mt-auto">
      <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${active ? 'text-blue-600' : 'text-slate-400'}`}>Category</p>
      <h3 className={`text-xl font-black transition-colors ${active ? 'text-slate-900' : 'text-slate-600'}`}>{label}</h3>
    </div>
  </button>
);

export default App;
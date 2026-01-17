
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ArrowLeft, 
  Monitor, 
  Smartphone, 
  Globe, 
  AlertCircle, 
  MapPin, 
  Calendar, 
  Camera, 
  CheckCircle2, 
  Loader2,
  ChevronRight,
  ChevronDown,
  Info,
  HelpCircle,
  X,
  Clock,
  RotateCcw,
  AlertTriangle,
  Zap,
  MoreHorizontal,
  Trash2
} from 'lucide-react';
import { DeviceType, PriorityLevel, FormData } from './types';
import { GoogleGenAI } from "@google/genai";

// Initial state
const INITIAL_FORM: FormData = {
  deviceType: null,
  description: '',
  priority: PriorityLevel.MEDIUM,
  address: '',
  contactInfo: '',
  preferredSchedule: '',
  preferredScheduleEnd: '',
  photos: []
};

interface UploadProgress {
  progress: number;
  status: 'uploading' | 'complete' | 'error';
}

// Reusable Tooltip Component
const Tooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-flex items-center group">
      {children}
      <button 
        type="button"
        aria-label="More information"
        className="ml-1.5 cursor-help focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full" 
        onMouseEnter={() => setIsVisible(true)} 
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        onClick={() => setIsVisible(!isVisible)}
      >
        <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-blue-600 transition-colors" />
      </button>
      {isVisible && (
        <div 
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 bg-slate-900 text-white text-[11px] rounded-xl shadow-2xl z-[60] animate-in fade-in zoom-in duration-200"
        >
          <p className="leading-relaxed font-medium">{text}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-8 border-transparent border-t-slate-900"></div>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [uploads, setUploads] = useState<Record<string, UploadProgress>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [smartAnalysis, setSmartAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [previewUrls, setPreviewUrls] = useState<{id: string, url: string, loading: boolean}[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Validation state
  const [contactError, setContactError] = useState<string | null>(null);

  // Refs for scroll tracking
  const step1Ref = useRef<HTMLElement>(null);
  const step2Ref = useRef<HTMLElement>(null);
  const step3Ref = useRef<HTMLElement>(null);
  const step4Ref = useRef<HTMLElement>(null);

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

  const validateContact = (value: string) => {
    if (!value) {
      setContactError("Contact info is required");
      return false;
    }
    const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
    const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    if (!phoneRegex.test(value) && !urlRegex.test(value)) {
      setContactError("Enter a valid phone number or social link");
      return false;
    }
    setContactError(null);
    return true;
  };

  const handleDeviceSelect = (type: DeviceType) => {
    setFormData(prev => ({ ...prev, deviceType: type }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value as any }));
    if (name === 'contactInfo') validateContact(value);
  };

  const simulateFileUpload = (fileId: string) => {
    setUploads(prev => ({ ...prev, [fileId]: { progress: 0, status: 'uploading' } }));
    
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += Math.floor(Math.random() * 20) + 5;
      if (currentProgress >= 100) {
        currentProgress = 100;
        setUploads(prev => ({ ...prev, [fileId]: { progress: 100, status: 'complete' } }));
        clearInterval(interval);
      } else {
        setUploads(prev => ({ ...prev, [fileId]: { ...prev[fileId], progress: currentProgress } }));
      }
    }, 400);
  };

  const handleFiles = (files: File[]) => {
    setFormData(prev => {
      const existingCount = prev.photos.length;
      const remainingSpace = 10 - existingCount;
      const imageFiles = files.filter(file => file.type.startsWith('image/'));
      const filesToAdd = imageFiles.slice(0, remainingSpace);
      
      filesToAdd.forEach(file => {
        const id = file.name + file.size;
        simulateFileUpload(id);
      });
      
      return { ...prev, photos: [...prev.photos, ...filesToAdd] };
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    const fileToRemove = formData.photos[index];
    const id = fileToRemove.name + fileToRemove.size;
    setUploads(prev => {
      const newUploads = { ...prev };
      delete newUploads[id];
      return newUploads;
    });
    setFormData(prev => ({ ...prev, photos: prev.photos.filter((_, i) => i !== index) }));
  };

  const handleLocateMe = () => {
    if (navigator.geolocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
          );
          const data = await response.json();
          setFormData(prev => ({ 
            ...prev, 
            address: data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` 
          }));
        } catch (error) {
          console.error("Reverse geocoding failed", error);
          setFormData(prev => ({ 
            ...prev, 
            address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` 
          }));
        } finally {
          setIsLocating(false);
        }
      }, (error) => {
        console.error("Geolocation failed", error);
        setIsLocating(false);
      });
    }
  };

  const performSmartAnalysis = async () => {
    if (!formData.description || formData.description.length < 10) return;
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze: ${formData.description}. Provide a short 1-sentence diagnostic suggestion for a technician.`,
      });
      setSmartAnalysis(response.text || null);
    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const isFormValid = useMemo(() => {
    const allUploadsComplete = (Object.values(uploads) as UploadProgress[]).every(u => u.status === 'complete');
    return formData.description.trim().length > 0 && 
           formData.address.trim().length > 0 && 
           !contactError && formData.contactInfo.trim().length > 0 && 
           formData.deviceType !== null &&
           (formData.photos.length === 0 || allUploadsComplete);
  }, [formData, contactError, uploads]);

  const confirmSubmit = () => {
    setShowConfirmModal(false);
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
    }, 1500);
  };

  const performReset = () => {
    setFormData(INITIAL_FORM);
    setUploads({});
    setSmartAnalysis(null);
    setShowResetModal(false);
    scrollToStep(1);
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#F8FAFC]">
        <div className="max-w-md w-full bg-white rounded-[2rem] shadow-2xl p-10 text-center animate-in zoom-in-95 duration-500">
          <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-8 ring-8 ring-green-50/50">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">Request Received!</h2>
          <p className="text-slate-500 mb-10 leading-relaxed font-medium">
            We've notified our specialist team. You'll receive a confirmation via your provided contact method shortly.
          </p>
          <button 
            onClick={() => { setIsSubmitted(false); setFormData(INITIAL_FORM); setUploads({}); }}
            className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
          >
            Go back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 selection:bg-blue-100">
      {/* Premium Floating Header */}
      <div className="sticky top-6 z-50 px-4 max-w-4xl mx-auto">
        <div className="bg-white/80 backdrop-blur-xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex gap-1.5 px-1">
              {[1, 2, 3, 4].map((step) => (
                <div 
                  key={step}
                  className={`h-1.5 w-8 rounded-full transition-all duration-500 ${
                    step === currentStep ? 'bg-blue-600 w-12' : step < currentStep ? 'bg-blue-200' : 'bg-slate-100'
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:block">Step {currentStep} of 4</span>
          </div>
          
          {/* Enhanced Reset Shortcut */}
          <button 
            type="button"
            onClick={() => setShowResetModal(true)}
            className="group relative flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200 transition-all active:scale-95"
          >
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-slate-900">Reset</span>
            </div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse border-2 border-white" />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-12">
        <header className="mb-16">
          <button className="flex items-center text-slate-400 hover:text-slate-900 transition-colors mb-8 group font-semibold text-sm">
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Home
          </button>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-xl">
              <h1 className="text-4xl md:text-6xl font-[900] text-slate-900 tracking-tight leading-[1.1] mb-6">
                Request a <span className="text-blue-600">Expert</span> Technician
              </h1>
              <p className="text-lg text-slate-500 font-medium leading-relaxed">
                Connect with certified specialists instantly. Fill out the details below to get started.
              </p>
            </div>
            <div className="hidden lg:block">
              <div className="bg-blue-600 text-white p-6 rounded-[2rem] shadow-xl shadow-blue-200 rotate-3 flex flex-col items-center">
                <Zap className="w-8 h-8 mb-2 fill-white" />
                <span className="text-[10px] font-black uppercase tracking-widest">Urgent fixing</span>
              </div>
            </div>
          </div>
        </header>

        <form onSubmit={(e) => { e.preventDefault(); if(isFormValid) setShowConfirmModal(true); }} className="space-y-8">
          
          {/* 01: Device Select */}
          <section ref={step1Ref} className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-sm border border-slate-100/50">
            <div className="flex items-center gap-4 mb-10">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black text-lg">01</div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Which device needs help?</h2>
                <p className="text-sm text-slate-400 font-medium mt-1">Select the hardware category below</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <DeviceTile 
                icon={<Monitor className="w-7 h-7" />}
                label={DeviceType.LAPTOP}
                active={formData.deviceType === DeviceType.LAPTOP}
                onClick={() => handleDeviceSelect(DeviceType.LAPTOP)}
              />
              <DeviceTile 
                icon={<Smartphone className="w-7 h-7" />}
                label={DeviceType.SMARTPHONE}
                active={formData.deviceType === DeviceType.SMARTPHONE}
                onClick={() => handleDeviceSelect(DeviceType.SMARTPHONE)}
              />
              <DeviceTile 
                icon={<Globe className="w-7 h-7" />}
                label={DeviceType.WEBSITE}
                active={formData.deviceType === DeviceType.WEBSITE}
                onClick={() => handleDeviceSelect(DeviceType.WEBSITE)}
              />
            </div>
          </section>

          {/* 02: Issue Details */}
          <section ref={step2Ref} className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-sm border border-slate-100/50">
            <div className="flex items-center gap-4 mb-10">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black text-lg">02</div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">What's going on?</h2>
                <p className="text-sm text-slate-400 font-medium mt-1">Describe the problem and set priority</p>
              </div>
            </div>

            <div className="space-y-8">
              <div className="relative group">
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 block">Problem Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  onBlur={performSmartAnalysis}
                  placeholder="Tell us exactly what's happening. Include model names or OS versions if you know them."
                  className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-3xl p-6 min-h-[160px] text-slate-700 transition-all font-medium placeholder:text-slate-300 resize-none outline-none"
                />
                
                {isAnalyzing && (
                  <div className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-full text-[10px] font-bold animate-pulse shadow-lg">
                    <Loader2 className="w-3 h-3 animate-spin" /> Analyzing Issue
                  </div>
                )}
                
                {smartAnalysis && !isAnalyzing && (
                  <div className="mt-4 p-4 rounded-2xl bg-indigo-50 border border-indigo-100 flex gap-3 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-1">AI Suggestion</p>
                      <p className="text-sm text-indigo-800 font-semibold italic">"{smartAnalysis}"</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 block">Priority Level</label>
                  <div className="relative">
                    <select
                      name="priority"
                      value={formData.priority}
                      onChange={handleInputChange}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl px-5 py-4 text-slate-700 font-bold transition-all appearance-none outline-none cursor-pointer"
                    >
                      <option value={PriorityLevel.LOW}>Low - No rush</option>
                      <option value={PriorityLevel.MEDIUM}>Medium - Normal</option>
                      <option value={PriorityLevel.HIGH}>High - Faster response</option>
                      <option value={PriorityLevel.URGENT}>Urgent - Immediate help</option>
                    </select>
                    <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Preferred Times</label>
                    <Tooltip text="Pick two slots so we can match you faster. Our experts are flexible!">
                      <span className="cursor-help" />
                    </Tooltip>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative group">
                      <input
                        type="datetime-local"
                        name="preferredSchedule"
                        value={formData.preferredSchedule}
                        onChange={handleInputChange}
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl p-4 text-[10px] font-bold text-slate-700 transition-all outline-none"
                      />
                      <div className="absolute -top-2 left-3 px-2 bg-white text-[9px] font-black text-blue-600 uppercase rounded-full shadow-sm">Choice 1</div>
                    </div>
                    <div className="relative group">
                      <input
                        type="datetime-local"
                        name="preferredScheduleEnd"
                        value={formData.preferredScheduleEnd}
                        onChange={handleInputChange}
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl p-4 text-[10px] font-bold text-slate-700 transition-all outline-none"
                      />
                      <div className="absolute -top-2 left-3 px-2 bg-white text-[9px] font-black text-slate-400 uppercase rounded-full shadow-sm">Choice 2</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 03: Location & Contact */}
          <section ref={step3Ref} className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-sm border border-slate-100/50">
            <div className="flex items-center gap-4 mb-10">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black text-lg">03</div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Where and who?</h2>
                <p className="text-sm text-slate-400 font-medium mt-1">Provide your details for the site visit</p>
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-amber-50/50 border border-amber-100 p-5 rounded-3xl flex gap-4">
                <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                  <Info className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-900">Home Visit Required</p>
                  <p className="text-xs text-amber-700 font-medium mt-1">Our specialist will travel directly to the address provided below. Please ensure someone is present.</p>
                </div>
              </div>

              <div className="relative">
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 block">Service Address</label>
                <div className="relative group">
                  <MapPin className="absolute left-6 top-6 w-5 h-5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder={isLocating ? "Locating your exact address..." : "Unit number, building name, street, city..."}
                    disabled={isLocating}
                    className={`w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-3xl pl-16 pr-6 py-5 min-h-[120px] text-slate-700 transition-all font-medium placeholder:text-slate-300 resize-none outline-none ${isLocating ? 'opacity-50' : ''}`}
                  />
                  <button 
                    type="button"
                    onClick={handleLocateMe}
                    disabled={isLocating}
                    className="absolute right-4 bottom-4 px-4 py-2 bg-white text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-xl shadow-sm border border-slate-100 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {isLocating ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" /> Finding address
                      </div>
                    ) : "Locate Me"}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 block">Contact Method</label>
                <div className="relative group">
                  <input
                    type="text"
                    name="contactInfo"
                    value={formData.contactInfo}
                    onChange={handleInputChange}
                    placeholder="Phone number or Profile Link (FB/IG/X)"
                    className={`w-full bg-slate-50 border-2 rounded-2xl px-5 py-4 text-slate-700 font-bold transition-all outline-none ${
                      contactError ? 'border-rose-400' : 'border-transparent focus:border-blue-500 focus:bg-white'
                    }`}
                  />
                  {contactError && (
                    <p className="mt-2 text-[10px] font-black text-rose-500 flex items-center gap-1.5 uppercase tracking-wide">
                      <AlertCircle className="w-3.5 h-3.5" /> {contactError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* 04: Attachments */}
          <section ref={step4Ref} className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-sm border border-slate-100/50">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black text-lg">04</div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Visual proof</h2>
                  <p className="text-sm text-slate-400 font-medium mt-1">Photos help our specialists diagnose faster</p>
                </div>
              </div>
              <div className="hidden sm:block">
                <div className="bg-slate-100 px-4 py-1.5 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  {formData.photos.length}/10 Photos
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <label 
                className={`relative border-3 border-dashed rounded-[2rem] p-10 flex flex-col items-center justify-center transition-all cursor-pointer group ${
                  formData.photos.length >= 10 ? 'opacity-40 cursor-not-allowed border-slate-100' : 'border-slate-100 hover:border-blue-200 hover:bg-blue-50/20'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(Array.from(e.dataTransfer.files)); }}
              >
                <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                  <Camera className="w-8 h-8" />
                </div>
                <p className="text-lg font-bold text-slate-900">Drop or Click to Upload</p>
                <p className="text-xs text-slate-400 font-medium mt-1">Upload JPG or PNG files up to 10MB</p>
                <input 
                  type="file" 
                  multiple 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleFileChange} 
                  disabled={formData.photos.length >= 10}
                />
              </label>

              {previewUrls.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {previewUrls.map((p, idx) => {
                    const uploadInfo = uploads[p.id] || { progress: 0, status: 'uploading' };
                    return (
                      <div key={p.id} className="relative group">
                        <div className="relative aspect-square rounded-[1.5rem] overflow-hidden shadow-xl border-2 border-white ring-1 ring-slate-100 bg-slate-50">
                          {p.loading ? (
                            <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
                          ) : (
                            <img src={p.url} className={`w-full h-full object-cover transition-all ${uploadInfo.status === 'uploading' ? 'blur-[2px] opacity-40 scale-105' : 'group-hover:scale-110'}`} alt="Preview" />
                          )}
                          
                          {/* Overlay for Progress */}
                          {uploadInfo.status === 'uploading' && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                              <span className="text-[12px] font-black text-blue-600 mb-2">{uploadInfo.progress}%</span>
                              <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden shadow-inner">
                                <div 
                                  className="h-full bg-blue-600 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(37,99,235,0.4)]" 
                                  style={{ width: `${uploadInfo.progress}%` }} 
                                />
                              </div>
                              <span className="text-[8px] font-black uppercase tracking-widest text-blue-400 mt-2">Uploading</span>
                            </div>
                          )}

                          {/* Complete Status Indicator */}
                          {uploadInfo.status === 'complete' && (
                            <div className="absolute top-2 left-2 p-1.5 bg-green-500 text-white rounded-full shadow-lg scale-90">
                              <CheckCircle2 className="w-3 h-3" />
                            </div>
                          )}

                          {/* Remove Button */}
                          <button 
                            type="button" 
                            onClick={() => removePhoto(idx)}
                            className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur-sm text-rose-500 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-50 hover:scale-110"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        
                        {/* File Name Caption */}
                        <div className="mt-2 px-1">
                          <p className="text-[10px] font-bold text-slate-500 truncate">{formData.photos[idx]?.name}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Form Footer Actions */}
          <div className="flex flex-col md:flex-row items-center gap-6 pt-10">
            <button 
              type="button"
              onClick={() => setShowResetModal(true)}
              className="w-full md:w-auto px-8 py-5 text-slate-400 font-bold hover:text-slate-900 transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Reset Form
            </button>
            <button 
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className={`w-full md:flex-1 h-20 rounded-[2rem] font-[900] text-lg flex items-center justify-center gap-3 transition-all shadow-2xl ${
                !isFormValid 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' 
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200 active:scale-95'
              }`}
            >
              {isSubmitting ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  Submit Request <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
          
          <p className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
            Secure processing by TechSupport Cloud
          </p>
        </form>
      </div>

      {/* Modern Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="bg-white rounded-[2.5rem] p-10 max-w-lg w-full shadow-[0_30px_100px_rgba(0,0,0,0.15)] relative z-10 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mb-8">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">Final check?</h3>
            <p className="text-slate-500 mb-10 leading-relaxed font-medium">
              We'll send your request details to our nearby specialists. Please ensure your contact details are active to receive calls.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="py-4 bg-slate-50 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 transition-colors"
              >
                Go back
              </button>
              <button 
                onClick={confirmSubmit}
                className="py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
              >
                Confirm & Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Styled Reset Warning Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowResetModal(false)} />
          <div className="bg-white rounded-[2.5rem] p-10 max-w-md w-full shadow-[0_30px_100px_rgba(0,0,0,0.2)] relative z-10 animate-in zoom-in-95 duration-300 text-center">
            <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-[2rem] flex items-center justify-center mb-8 mx-auto ring-8 ring-rose-50/50">
              <Trash2 className="w-10 h-10" />
            </div>
            <h3 className="text-3xl font-[900] text-slate-900 mb-3 tracking-tight">Start Over?</h3>
            <p className="text-slate-500 mb-10 leading-relaxed font-medium">
              This will clear all your progress, descriptions, and uploaded photos. This action cannot be undone.
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={performReset}
                className="w-full py-5 bg-rose-500 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-rose-600 transition-all shadow-xl shadow-rose-200 active:scale-95"
              >
                Yes, Clear Everything
              </button>
              <button 
                onClick={() => setShowResetModal(false)}
                className="w-full py-5 text-slate-400 font-bold hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface DeviceTileProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

const DeviceTile: React.FC<DeviceTileProps> = ({ icon, label, active, onClick }) => (
  <button 
    type="button"
    onClick={onClick}
    className={`relative p-8 rounded-[2rem] border-2 transition-all flex flex-col items-start text-left h-full ${
      active 
      ? 'border-blue-600 bg-blue-50/50 shadow-xl shadow-blue-600/5' 
      : 'border-slate-50 bg-slate-50 hover:bg-slate-100 hover:border-slate-200'
    }`}
  >
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 transition-all ${
      active ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-white text-slate-400 group-hover:text-slate-600'
    }`}>
      {icon}
    </div>
    <div className="mt-auto">
      <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${active ? 'text-blue-600' : 'text-slate-400'}`}>Category</p>
      <h3 className={`text-xl font-extrabold tracking-tight ${active ? 'text-slate-900' : 'text-slate-700'}`}>{label}</h3>
    </div>
    {active && (
      <div className="absolute top-6 right-6 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center animate-in zoom-in-50">
        <CheckCircle2 className="w-3 h-3 text-white" />
      </div>
    )}
  </button>
);

export default App;

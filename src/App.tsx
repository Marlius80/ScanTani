/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  History, 
  User as UserIcon, 
  LogOut, 
  Search, 
  Leaf, 
  ShieldAlert, 
  Droplets, 
  FlaskConical, 
  Bookmark, 
  BookmarkCheck,
  ChevronRight,
  TrendingUp,
  MapPin,
  X,
  Loader2,
  Settings,
  Bell,
  LayoutDashboard,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut, 
  updateProfile,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { analyzePlantImage, PlantAnalysis } from './services/geminiService';
import { cn } from './lib/utils';
import ReactMarkdown from 'react-markdown';

// --- Types ---
interface ScanRecord extends PlantAnalysis {
  id: string;
  userId: string;
  imageUrl: string;
  timestamp: any;
  isBookmarked: boolean;
  location?: { latitude: number; longitude: number };
}

// --- Components ---

const Button = ({ 
  children, 
  onClick, 
  className, 
  variant = 'primary', 
  disabled = false,
  isLoading = false
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  className?: string; 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  disabled?: boolean;
  isLoading?: boolean;
}) => {
  const variants = {
    primary: 'bg-[#7d2ae8] text-white hover:bg-[#6a23c5] shadow-sm',
    secondary: 'bg-[#00c4cc] text-white hover:bg-[#00b0b8] shadow-sm',
    outline: 'border-2 border-[#7d2ae8] text-[#7d2ae8] hover:bg-[#7d2ae8]/5',
    ghost: 'text-slate-600 hover:text-[#7d2ae8] hover:bg-[#7d2ae8]/5',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        'px-4 py-2 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95',
        variants[variant],
        className
      )}
    >
      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
    </button>
  );
};

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow', className)}>
    {children}
  </div>
);

const Badge = ({ children, variant = 'info' }: { children: React.ReactNode; variant?: 'info' | 'warning' | 'error' | 'success' }) => {
  const variants = {
    info: 'bg-blue-50 text-blue-600 border-blue-100',
    warning: 'bg-amber-50 text-amber-600 border-amber-100',
    error: 'bg-red-50 text-red-600 border-red-100',
    success: 'bg-emerald-50 text-emerald-600 border-emerald-100'
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border', variants[variant])}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'scan' | 'history' | 'profile'>('dashboard');
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<PlantAnalysis | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhotoUrl, setEditPhotoUrl] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [appSettings, setAppSettings] = useState({
    pushNotifications: true,
    saveToGallery: true,
    language: 'id'
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Listener
  useEffect(() => {
    if (!user) {
      setScans([]);
      return;
    }

    const q = query(
      collection(db, 'scans'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ScanRecord[];
      setScans(data);
    });

    return () => unsubscribe();
  }, [user]);

  // Camera Setup
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Gagal mengakses kamera. Pastikan izin kamera telah diberikan.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  useEffect(() => {
    if (activeTab === 'scan') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [activeTab]);

  // Actions
  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
      // After login, the user state will change and the dashboard will show
    } catch (err) {
      console.error("Login failed:", err);
      alert("Gagal masuk. Silakan coba lagi.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setActiveTab('dashboard');
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    setIsUpdatingProfile(true);
    try {
      await updateProfile(user, {
        displayName: editName,
        photoURL: editPhotoUrl
      });
      
      // Force refresh user state by getting the current user from auth again
      if (auth.currentUser) {
        setUser({ ...auth.currentUser } as FirebaseUser);
      } else {
        setUser({ ...user, displayName: editName, photoURL: editPhotoUrl } as FirebaseUser);
      }
      
      setShowEditProfile(false);
    } catch (err) {
      console.error("Failed to update profile:", err);
      alert("Gagal memperbarui profil.");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImage(base64);
    
    setIsScanning(true);
    try {
      const analysis = await analyzePlantImage(base64);
      setScanResult(analysis);
      setShowResultModal(true);
    } catch (err) {
      console.error("Analysis failed:", err);
      alert("Gagal menganalisis gambar. Silakan coba lagi.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setCapturedImage(base64);
      
      setIsScanning(true);
      try {
        const analysis = await analyzePlantImage(base64);
        setScanResult(analysis);
        setShowResultModal(true);
      } catch (err) {
        console.error("Analysis failed:", err);
        alert("Gagal menganalisis gambar. Silakan coba lagi.");
      } finally {
        setIsScanning(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const saveScan = async () => {
    if (!user || !scanResult || !capturedImage) return;

    setIsSaving(true);
    try {
      let location = undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) => {
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 });
        });
        location = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch (e) {
        console.warn("Geolocation failed", e);
      }

      await addDoc(collection(db, 'scans'), {
        ...scanResult,
        userId: user.uid,
        imageUrl: capturedImage,
        timestamp: serverTimestamp(),
        isBookmarked: false,
        location
      });
      
      setShowResultModal(false);
      setScanResult(null);
      setCapturedImage(null);
      setActiveTab('history');
    } catch (err) {
      console.error("Failed to save scan:", err);
      alert("Gagal menyimpan riwayat scan.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleBookmark = async (scan: ScanRecord) => {
    try {
      await updateDoc(doc(db, 'scans', scan.id), {
        isBookmarked: !scan.isBookmarked
      });
    } catch (err) {
      console.error("Failed to toggle bookmark:", err);
    }
  };

  const deleteScan = async (id: string) => {
    if (!confirm("Hapus riwayat scan ini?")) return;
    try {
      await deleteDoc(doc(db, 'scans', id));
    } catch (err) {
      console.error("Failed to delete scan:", err);
    }
  };

  // --- Renderers ---

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-[#7d2ae8] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white text-slate-900 flex flex-col items-center justify-center p-6 overflow-hidden relative">
        {/* Background Gradients */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#7d2ae8]/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#00c4cc]/10 blur-[100px] rounded-full pointer-events-none" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="z-10 text-center max-w-md"
        >
          <div className="w-24 h-24 bg-white border-4 border-[#7d2ae8] rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-xl">
            <Leaf className="w-12 h-12 text-[#7d2ae8]" />
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight mb-4 text-slate-900">
            ScanTani <span className="text-[#7d2ae8]">AI</span>
          </h1>
          <p className="text-slate-600 mb-12 text-lg leading-relaxed">
            Desain masa depan pertanian Anda dengan deteksi penyakit tanaman berbasis AI.
          </p>
          
          <Button 
            onClick={handleLogin} 
            isLoading={isLoggingIn}
            className="w-full py-4 text-lg rounded-full"
          >
            Mulai Mendesain Solusi
          </Button>
          
          <p className="mt-8 text-xs text-slate-400 font-bold uppercase tracking-[0.2em]">
            Inspirasi dari Canva • Powered by Gemini
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-900 font-sans selection:bg-[#7d2ae8]/20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#7d2ae8] to-[#00c4cc] rounded-xl flex items-center justify-center shadow-lg">
            <Leaf className="w-6 h-6 text-white" />
          </div>
          <span className="font-extrabold tracking-tight text-xl text-slate-900">ScanTani</span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowNotifications(true)}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors relative"
          >
            <Bell className="w-5 h-5" />
            {scans.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />}
          </button>
          <div className="w-9 h-9 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden">
            <img src={user.photoURL || ''} alt={user.displayName || ''} referrerPolicy="no-referrer" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-32 pt-6 px-6 max-w-2xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-8"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Halo, {user.displayName?.split(' ')[0]}!</h2>
                  <p className="text-slate-500 font-medium">Apa yang ingin Anda periksa hari ini?</p>
                </div>
                <Button 
                  onClick={() => setActiveTab('scan')} 
                  className="rounded-full px-8 py-4 shadow-xl bg-gradient-to-r from-[#7d2ae8] to-[#6a23c5] hover:scale-105 transition-transform"
                >
                  <Camera className="w-5 h-5" />
                  <span className="font-bold">Mulai Mendesain Solusi</span>
                </Button>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-5 space-y-3 border-l-4 border-l-[#7d2ae8]">
                  <div className="flex items-center justify-between">
                    <div className="p-2 bg-[#7d2ae8]/10 rounded-lg">
                      <Search className="w-5 h-5 text-[#7d2ae8]" />
                    </div>
                    <Badge variant="info">Total</Badge>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-slate-900">{scans.length}</div>
                    <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Scan Selesai</div>
                  </div>
                </Card>
                <Card className="p-5 space-y-3 border-l-4 border-l-[#00c4cc]">
                  <div className="flex items-center justify-between">
                    <div className="p-2 bg-[#00c4cc]/10 rounded-lg">
                      <ShieldAlert className="w-5 h-5 text-[#00c4cc]" />
                    </div>
                    <Badge variant="warning">Alert</Badge>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-slate-900">{scans.filter(s => s.diseaseName !== 'Healthy').length}</div>
                    <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Terdeteksi</div>
                  </div>
                </Card>
              </div>

              {/* Recent Activity */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-xl text-slate-900">Proyek Scan Terbaru</h3>
                  <button onClick={() => setActiveTab('history')} className="text-sm text-[#7d2ae8] font-bold hover:underline">Lihat Semua</button>
                </div>
                
                {scans.length > 0 ? (
                  <div className="space-y-3">
                    {scans.slice(0, 3).map(scan => (
                      <Card key={scan.id} className="p-4 flex items-center gap-4 group cursor-pointer hover:border-[#7d2ae8]/50">
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200">
                          <img src={scan.imageUrl} alt={scan.plantName} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-slate-900 truncate">{scan.plantName}</h4>
                            {scan.diseaseName === 'Healthy' ? (
                              <Badge variant="success">Sehat</Badge>
                            ) : (
                              <Badge variant="error">Sakit</Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 font-medium truncate">{scan.diseaseName}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#7d2ae8] transition-colors" />
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="p-10 text-center border-dashed border-slate-300 bg-white/50">
                    <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Camera className="w-7 h-7 text-slate-400" />
                    </div>
                    <p className="text-slate-500 font-medium">Belum ada proyek scan. Mulai sekarang!</p>
                  </Card>
                )}
              </div>

              {/* Tips Section */}
              <Card className="p-6 bg-gradient-to-r from-[#7d2ae8]/5 to-[#00c4cc]/5 border-none shadow-md">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white rounded-2xl shadow-sm">
                    <TrendingUp className="w-6 h-6 text-[#7d2ae8]" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 mb-1">Inspirasi Hari Ini</h4>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Tanaman yang sehat berawal dari pemantauan rutin. Gunakan AgroScan setiap minggu untuk hasil maksimal.
                    </p>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'scan' && (
            <motion.div
              key="scan"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <div className="relative aspect-[3/4] rounded-[2.5rem] overflow-hidden bg-slate-200 border-4 border-white shadow-2xl">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="w-full h-full object-cover"
                />
                
                {/* Overlay UI */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Viewfinder corners */}
                  <div className="absolute top-10 left-10 w-14 h-14 border-t-4 border-l-4 border-white/80 rounded-tl-2xl" />
                  <div className="absolute top-10 right-10 w-14 h-14 border-t-4 border-r-4 border-white/80 rounded-tr-2xl" />
                  <div className="absolute bottom-10 left-10 w-14 h-14 border-b-4 border-l-4 border-white/80 rounded-bl-2xl" />
                  <div className="absolute bottom-10 right-10 w-14 h-14 border-b-4 border-r-4 border-white/80 rounded-br-2xl" />
                  
                  {/* Scanning Line */}
                  {isScanning && (
                    <motion.div 
                      initial={{ top: '15%' }}
                      animate={{ top: '85%' }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute left-10 right-10 h-1 bg-gradient-to-r from-transparent via-[#7d2ae8] to-transparent shadow-[0_0_20px_#7d2ae8] z-10"
                    />
                  )}
                </div>

                {/* Capture Button Container */}
                <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-6 px-8">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isScanning}
                    className="p-4 bg-white/20 backdrop-blur-xl rounded-full border border-white/30 text-white hover:bg-white/40 transition-colors disabled:opacity-50"
                  >
                    <ImageIcon className="w-6 h-6" />
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />
                  
                  <button 
                    onClick={captureAndAnalyze}
                    disabled={isScanning}
                    className="w-22 h-22 bg-white rounded-full flex items-center justify-center p-1.5 shadow-2xl active:scale-90 transition-transform"
                  >
                    <div className="w-full h-full rounded-full border-[6px] border-[#7d2ae8]/10 flex items-center justify-center">
                      {isScanning ? (
                        <Loader2 className="w-10 h-10 text-[#7d2ae8] animate-spin" />
                      ) : (
                        <div className="w-14 h-14 bg-gradient-to-br from-[#7d2ae8] to-[#00c4cc] rounded-full shadow-inner" />
                      )}
                    </div>
                  </button>

                  <button className="p-4 bg-white/20 backdrop-blur-xl rounded-full border border-white/30 text-white hover:bg-white/40 transition-colors">
                    <Droplets className="w-6 h-6" />
                  </button>
                </div>
              </div>
              
              <div className="text-center space-y-2">
                <h3 className="font-extrabold text-2xl text-slate-900">Studio Scan AI</h3>
                <p className="text-slate-500 font-medium">Ambil foto daun untuk memulai analisis desain alam</p>
              </div>
              
              <canvas ref={canvasRef} className="hidden" />
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-extrabold text-slate-900">Semua Desain Scan</h2>
                <div className="flex gap-2">
                  <button className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 shadow-sm"><Search className="w-4 h-4" /></button>
                  <button className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 shadow-sm"><Settings className="w-4 h-4" /></button>
                </div>
              </div>

              {scans.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {scans.map(scan => (
                    <Card key={scan.id} className="p-4 flex gap-4 relative group hover:border-[#7d2ae8]/30">
                      <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                        <img src={scan.imageUrl} alt={scan.plantName} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-bold text-slate-900 truncate">{scan.plantName}</h4>
                            <div className="flex gap-2">
                              <button onClick={() => toggleBookmark(scan)} className="text-slate-300 hover:text-[#7d2ae8] transition-colors">
                                {scan.isBookmarked ? <BookmarkCheck className="w-5 h-5 text-[#7d2ae8]" /> : <Bookmark className="w-5 h-5" />}
                              </button>
                              <button onClick={() => deleteScan(scan.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                          <p className={cn("text-sm font-bold mb-2", scan.diseaseName === 'Healthy' ? 'text-emerald-600' : 'text-red-600')}>
                            {scan.diseaseName}
                          </p>
                          <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            <span className="flex items-center gap-1"><History className="w-3 h-3" /> {new Date(scan.timestamp?.toDate()).toLocaleDateString()}</span>
                            {scan.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Lokasi</span>}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="py-24 text-center">
                  <div className="w-20 h-20 bg-white rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-lg border border-slate-100">
                    <History className="w-10 h-10 text-slate-200" />
                  </div>
                  <h3 className="font-extrabold text-xl text-slate-900 mb-2">Belum Ada Desain</h3>
                  <p className="text-slate-500 font-medium max-w-xs mx-auto">Mulai scan pertama Anda untuk membangun perpustakaan kesehatan tanaman.</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8"
            >
              <div className="text-center space-y-4">
                <div className="relative inline-block">
                  <div className="w-24 h-24 rounded-[2rem] bg-white border-4 border-white overflow-hidden mx-auto shadow-xl ring-4 ring-[#7d2ae8]/10 flex items-center justify-center">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <UserIcon className="w-10 h-10 text-slate-300" />
                    )}
                  </div>
                  <button 
                    onClick={() => {
                      setEditName(user.displayName || '');
                      setEditPhotoUrl(user.photoURL || '');
                      setShowEditProfile(true);
                    }}
                    className="absolute -bottom-2 -right-2 w-10 h-10 bg-[#7d2ae8] rounded-2xl flex items-center justify-center border-4 border-white shadow-lg hover:bg-[#6c24c9] transition-colors"
                  >
                    <Settings className="w-5 h-5 text-white" />
                  </button>
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-900">{user.displayName || 'Pengguna'}</h2>
                  <p className="text-slate-500 font-medium">{user.email}</p>
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  onClick={() => {
                    setEditName(user.displayName || '');
                    setEditPhotoUrl(user.photoURL || '');
                    setShowEditProfile(true);
                  }}
                  className="w-full flex items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all shadow-sm group"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600"><UserIcon className="w-5 h-5" /></div>
                    <span className="font-bold text-slate-700">Edit Profil</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#7d2ae8] transition-colors" />
                </button>
                <button 
                  onClick={() => setShowNotifications(true)}
                  className="w-full flex items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all shadow-sm group"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600"><Bell className="w-5 h-5" /></div>
                    <span className="font-bold text-slate-700">Notifikasi</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#7d2ae8] transition-colors" />
                </button>
                <button 
                  onClick={() => setShowSettings(true)}
                  className="w-full flex items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all shadow-sm group"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-slate-100 rounded-xl text-slate-600"><Settings className="w-5 h-5" /></div>
                    <span className="font-bold text-slate-700">Pengaturan App</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#7d2ae8] transition-colors" />
                </button>
                <button 
                  onClick={handleLogout}
                  className="w-full flex items-center justify-between p-5 bg-red-50 border border-red-100 rounded-2xl hover:bg-red-100 transition-all shadow-sm group"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-red-100 rounded-xl text-red-600"><LogOut className="w-5 h-5" /></div>
                    <span className="font-bold text-red-600">Keluar Sesi</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-red-300 group-hover:text-red-600 transition-colors" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 px-6 pb-8 pt-4 bg-gradient-to-t from-[#f8f9fa] via-[#f8f9fa] to-transparent">
        <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-[2rem] p-2 flex items-center justify-between shadow-xl">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={cn("flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl transition-all", activeTab === 'dashboard' ? 'text-[#7d2ae8] bg-[#7d2ae8]/5' : 'text-slate-400')}
          >
            <LayoutDashboard className="w-6 h-6" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Beranda</span>
          </button>
          <button 
            onClick={() => setActiveTab('scan')}
            className={cn("flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl transition-all", activeTab === 'scan' ? 'text-[#7d2ae8] bg-[#7d2ae8]/5' : 'text-slate-400')}
          >
            <Camera className="w-6 h-6" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Scan</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={cn("flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl transition-all", activeTab === 'history' ? 'text-[#7d2ae8] bg-[#7d2ae8]/5' : 'text-slate-400')}
          >
            <History className="w-6 h-6" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Proyek</span>
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
            className={cn("flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl transition-all", activeTab === 'profile' ? 'text-[#7d2ae8] bg-[#7d2ae8]/5' : 'text-slate-400')}
          >
            <UserIcon className="w-6 h-6" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Profil</span>
          </button>
        </div>
      </nav>

      {/* Result Modal */}
      <AnimatePresence>
        {showResultModal && scanResult && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowResultModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-lg bg-white border-t sm:border border-slate-200 rounded-t-[3rem] sm:rounded-[3rem] overflow-hidden shadow-2xl"
            >
              {/* Modal Header Image */}
              <div className="h-56 relative">
                <img src={capturedImage || ''} alt="Captured" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />
                <button 
                  onClick={() => setShowResultModal(false)}
                  className="absolute top-6 right-6 p-2 bg-white/80 backdrop-blur-md rounded-full border border-slate-200 text-slate-900 shadow-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 space-y-6 max-h-[75vh] overflow-y-auto">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-3xl font-extrabold tracking-tight mb-1 text-slate-900">{scanResult.plantName}</h2>
                    <div className="flex items-center gap-2">
                      {scanResult.diseaseName === 'Healthy' ? (
                        <Badge variant="success">Tanaman Sehat</Badge>
                      ) : (
                        <Badge variant="error">{scanResult.diseaseName}</Badge>
                      )}
                      <span className="text-slate-400 font-bold text-xs uppercase tracking-widest">• Severity: {scanResult.severity}%</span>
                    </div>
                  </div>
                  <div className="w-16 h-16 rounded-2xl bg-[#7d2ae8]/10 border border-[#7d2ae8]/20 flex flex-col items-center justify-center shadow-inner">
                    <span className="text-2xl font-extrabold text-[#7d2ae8]">{scanResult.severity}</span>
                    <span className="text-[8px] uppercase font-bold text-[#7d2ae8]/50 tracking-widest">Score</span>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <h4 className="flex items-center gap-2 font-extrabold text-xs uppercase tracking-[0.15em] text-slate-400">
                      <ShieldAlert className="w-4 h-4" /> Analisis Visual AI
                    </h4>
                    <p className="text-slate-600 leading-relaxed font-medium">
                      {scanResult.description}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="p-5 bg-[#00c4cc]/5 border border-[#00c4cc]/10 rounded-3xl space-y-3">
                      <h4 className="flex items-center gap-2 font-extrabold text-[#00c4cc] text-xs uppercase tracking-widest">
                        <Droplets className="w-4 h-4" /> Solusi Organik
                      </h4>
                      <div className="text-slate-600 text-sm leading-relaxed font-medium">
                        <ReactMarkdown>{scanResult.recommendations.organic}</ReactMarkdown>
                      </div>
                    </div>
                    <div className="p-5 bg-[#7d2ae8]/5 border border-[#7d2ae8]/10 rounded-3xl space-y-3">
                      <h4 className="flex items-center gap-2 font-extrabold text-[#7d2ae8] text-xs uppercase tracking-widest">
                        <FlaskConical className="w-4 h-4" /> Solusi Kimia
                      </h4>
                      <div className="text-slate-600 text-sm leading-relaxed font-medium">
                        <ReactMarkdown>{scanResult.recommendations.chemical}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 flex gap-3">
                  <Button 
                    onClick={saveScan} 
                    isLoading={isSaving}
                    className="flex-1 py-4 rounded-2xl text-lg"
                  >
                    Simpan Desain
                  </Button>
                  <Button 
                    variant="ghost" 
                    onClick={() => setShowResultModal(false)}
                    className="px-6 rounded-2xl"
                  >
                    Batal
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {showEditProfile && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditProfile(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-extrabold text-slate-900">Edit Profil</h3>
                <button 
                  onClick={() => setShowEditProfile(false)}
                  className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700">Nama Tampilan</label>
                  <input 
                    type="text" 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#7d2ae8]/50 focus:border-[#7d2ae8] transition-all"
                    placeholder="Nama Anda"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700">URL Foto Profil</label>
                  <input 
                    type="text" 
                    value={editPhotoUrl}
                    onChange={(e) => setEditPhotoUrl(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#7d2ae8]/50 focus:border-[#7d2ae8] transition-all"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="pt-6 flex gap-3">
                <Button 
                  onClick={handleUpdateProfile} 
                  isLoading={isUpdatingProfile}
                  className="flex-1 py-3 rounded-xl"
                >
                  Simpan Perubahan
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notifications Modal */}
      <AnimatePresence>
        {showNotifications && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 sm:justify-end sm:items-stretch sm:p-0">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNotifications(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              className="relative w-full max-w-md bg-white sm:rounded-l-3xl overflow-hidden shadow-2xl flex flex-col h-full max-h-[80vh] sm:max-h-full rounded-3xl sm:rounded-none mt-auto sm:mt-0"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <h3 className="text-xl font-extrabold text-slate-900">Notifikasi</h3>
                <button 
                  onClick={() => setShowNotifications(false)}
                  className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
                {scans.length > 0 ? (
                  <div className="space-y-4">
                    {scans.slice(0, 10).map((scan, idx) => (
                      <div key={scan.id || idx} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex gap-4">
                        <div className={cn("p-2 rounded-xl h-fit", scan.diseaseName === 'Healthy' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                          {scan.diseaseName === 'Healthy' ? <Leaf className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm mb-1">Hasil Scan: {scan.plantName}</h4>
                          <p className="text-slate-600 text-xs leading-relaxed">
                            {scan.diseaseName === 'Healthy' 
                              ? 'Tanaman Anda terlihat sehat! Terus pertahankan perawatan yang baik.' 
                              : `Terdeteksi ${scan.diseaseName} dengan tingkat keparahan ${scan.severity}%. Segera lakukan penanganan.`}
                          </p>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2 block">
                            {new Date(scan.timestamp?.toDate()).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Bell className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-slate-500 font-medium">Belum ada notifikasi</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 sm:justify-end sm:items-stretch sm:p-0">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              className="relative w-full max-w-md bg-white sm:rounded-l-3xl overflow-hidden shadow-2xl flex flex-col h-full max-h-[80vh] sm:max-h-full rounded-3xl sm:rounded-none mt-auto sm:mt-0"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <h3 className="text-xl font-extrabold text-slate-900">Pengaturan App</h3>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">Notifikasi Push</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Terima peringatan jadwal perawatan</p>
                    </div>
                    <button 
                      onClick={() => setAppSettings(s => ({...s, pushNotifications: !s.pushNotifications}))}
                      className={cn("w-12 h-6 rounded-full transition-colors relative", appSettings.pushNotifications ? "bg-[#7d2ae8]" : "bg-slate-200")}
                    >
                      <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", appSettings.pushNotifications ? "left-7" : "left-1")} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">Simpan ke Galeri</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Otomatis simpan foto hasil scan</p>
                    </div>
                    <button 
                      onClick={() => setAppSettings(s => ({...s, saveToGallery: !s.saveToGallery}))}
                      className={cn("w-12 h-6 rounded-full transition-colors relative", appSettings.saveToGallery ? "bg-[#7d2ae8]" : "bg-slate-200")}
                    >
                      <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", appSettings.saveToGallery ? "left-7" : "left-1")} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 px-1">Bahasa Aplikasi</label>
                  <select 
                    value={appSettings.language}
                    onChange={(e) => setAppSettings(s => ({...s, language: e.target.value}))}
                    className="w-full p-4 bg-white border border-slate-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-[#7d2ae8]/50 focus:border-[#7d2ae8] appearance-none font-medium text-slate-700"
                  >
                    <option value="id">Bahasa Indonesia</option>
                    <option value="en">English</option>
                  </select>
                </div>

                <div className="pt-4 border-t border-slate-200">
                  <button 
                    onClick={() => {
                      if(window.confirm('Apakah Anda yakin ingin menghapus semua riwayat scan? Tindakan ini tidak dapat dibatalkan.')) {
                        alert('Permintaan penghapusan data sedang diproses.');
                      }
                    }}
                    className="w-full p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl font-bold hover:bg-red-100 transition-colors text-center"
                  >
                    Hapus Semua Data Scan
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

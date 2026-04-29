import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Upload, 
  History as HistoryIcon, 
  Info, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  Leaf, 
  Search,
  ChevronRight,
  RefreshCw,
  X,
  Droplets,
  Thermometer,
  ShieldCheck,
  User,
  Settings as SettingsIcon,
  LogOut,
  Bell,
  Activity,
  UserPlus,
  LogIn,
  Loader2,
  Lock,
  Mail,
  Smartphone,
  Globe,
  MessageSquare,
  Send,
  Sun,
  Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  setDoc,
  doc,
  addDoc,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { handleFirestoreError, OperationType } from './lib/firestoreUtils';
import { cn } from './lib/utils';

// Constants
const GOOGLE_API_KEY = process.env.GEMINI_API_KEY;

// Types
interface ScanResult {
  id: string;
  diseaseName: string;
  confidence: number;
  date: string;
  image: string;
  description: string;
  causes: string[];
  treatment: string[];
  prevention: string[];
  severity: 'Low' | 'Medium' | 'High';
}

type Screen = 'splash' | 'auth' | 'signin' | 'signup' | 'forgot' | 'landing' | 'scan' | 'result' | 'history' | 'info' | 'settings' | 'chat';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt: any;
}

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [screen, setScreen] = useState<Screen>('splash');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userNickname, setUserNickname] = useState<string>('');
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [currentScan, setCurrentScan] = useState<ScanResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ai = GOOGLE_API_KEY ? new GoogleGenAI({ apiKey: GOOGLE_API_KEY }) : null;

  const logout = () => signOut(auth);

  // Handle Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Fetch nickname from Firestore
        try {
          const userSnap = await getDocFromServer(doc(db, 'users', u.uid));
          if (userSnap.exists()) {
            setUserNickname(userSnap.data().nickname || '');
          }
        } catch (e) { console.error(e); }
        setScreen('landing');
      } else if (screen !== 'splash' && screen !== 'auth' && screen !== 'signup' && screen !== 'forgot' && screen !== 'signin') {
        setScreen('auth');
      }
    });
    return () => unsubscribe();
  }, []);

  // Splash Transition
  useEffect(() => {
    if (screen === 'splash') {
      const timer = setTimeout(() => {
        if (!auth.currentUser) setScreen('auth');
        else setScreen('landing');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [screen]);

  // Load History
  useEffect(() => {
    if (!user) { setHistory([]); return; }
    const q = query(collection(db, 'scans'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: (doc.data().createdAt?.toDate() || new Date()).toLocaleString()
      })) as ScanResult[];
      setHistory(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'scans'));
    return () => unsubscribe();
  }, [user]);

  // Load Chat Messages
  useEffect(() => {
    if (!user || screen !== 'chat') return;
    const q = query(
      collection(db, `chats/${user.uid}/messages`), 
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      setChatMessages(data);
    });
    return () => unsubscribe();
  }, [user, screen]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || chatLoading || !user || !ai) return;
    
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatLoading(true);

    try {
      // 1. Ensure Chat Document exists
      const chatRef = doc(db, 'chats', user.uid);
      await setDoc(chatRef, {
        userId: user.uid,
        lastMessage: userMsg,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Save User Message
      await addDoc(collection(db, `chats/${user.uid}/messages`), {
        role: 'user',
        text: userMsg,
        createdAt: serverTimestamp()
      });

      // 3. Get AI Response
      const history = chatMessages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...history,
          { role: "user", parts: [{ text: userMsg }] }
        ],
        config: {
          systemInstruction: "You are Dr Plant, a professional agricultural AI assistant. Help users identify plant diseases and provide care tips. Be concise and professional."
        }
      });

      const aiResponse = response.text || "I couldn't process that. Please try again.";

      // 4. Save AI Message
      await addDoc(collection(db, `chats/${user.uid}/messages`), {
        role: 'model',
        text: aiResponse,
        createdAt: serverTimestamp()
      });

      // 5. Update last messenger
      await setDoc(chatRef, { lastMessage: aiResponse, updatedAt: serverTimestamp() }, { merge: true });

    } catch (error: any) {
      console.error(error);
      alert("Chat error. Please try again.");
    } finally {
      setChatLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!email || !password) return alert("Enter email and password");
    setAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      alert(error.message);
    } finally { setAuthLoading(false); }
  };

  const handleSignUp = async () => {
    if (!email || !password || !name || !nickname) return alert("Fill all fields");
    setAuthLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db, 'users', cred.user.uid), {
        displayName: name,
        nickname: nickname,
        email: email,
        createdAt: serverTimestamp()
      });
      setSuccessMsg("Account Created Successfully!");
      setTimeout(() => {
        setSuccessMsg(null);
        setScreen('signin');
      }, 2000);
    } catch (error: any) {
      alert(error.message);
    } finally { setAuthLoading(false); }
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const res = await signInWithPopup(auth, provider);
      // Ensure user entry exists
      const userRef = doc(db, 'users', res.user.uid);
      const snap = await getDocFromServer(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          displayName: res.user.displayName,
          nickname: res.user.displayName?.split(' ')[0],
          email: res.user.email,
          createdAt: serverTimestamp()
        });
      }
    } catch (error: any) {
      alert(error.message);
    } finally { setAuthLoading(false); }
  };

  const resetPassword = async () => {
    if (!email) return alert("Enter email address");
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Password reset email sent!");
      setScreen('signin');
    } catch (error: any) { alert(error.message); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
        setScreen('scan');
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!selectedImage || !ai || !user) return;
    setIsLoading(true);
    try {
      const base64Data = selectedImage.split(',')[1];
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{
          parts: [
            { text: "Analyze this plant leaf for diseases. Return JSON: { \"diseaseName\": string, \"confidence\": number, \"description\": string, \"causes\": string[], \"treatment\": string[], \"prevention\": string[], \"severity\": \"Low\"|\"Medium\"|\"High\" }" },
            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
          ]
        }],
        config: { responseMimeType: "application/json" }
      });
      const data = JSON.parse(response.text || '{}');
      const scanData = {
        userId: user.uid,
        ...data,
        image: selectedImage,
        createdAt: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, 'scans'), scanData);
      setCurrentScan({ id: docRef.id, ...data, date: new Date().toLocaleString(), image: selectedImage });
      setScreen('result');
    } catch (error: any) {
      if (error?.code === 'permission-denied') handleFirestoreError(error, OperationType.CREATE, 'scans');
      else alert("Analysis failed.");
    } finally { setIsLoading(false); }
  };

  return (
    <div className={cn(
      "min-h-screen font-sans overflow-x-hidden flex items-center justify-center p-4 transition-colors duration-500",
      theme === 'dark' ? "bg-[#010409] text-white" : "bg-slate-50 text-slate-900"
    )}>
      {/* Theme Toggle Button */}
      <button 
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className={cn(
          "fixed bottom-6 right-6 w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl z-[100] transition-all active:scale-90",
          theme === 'dark' ? "bg-white text-black" : "bg-[#0D1117] text-white"
        )}
      >
        {theme === 'dark' ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
      </button>

      <div className={cn(
        "w-full max-w-md h-[844px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden flex flex-col rounded-[3.2rem] border transition-colors duration-500",
        theme === 'dark' ? "bg-[#0D1117] border-white/5" : "bg-white border-slate-200"
      )}>
        
        <AnimatePresence mode="wait">
          {/* Splash */}
          {screen === 'splash' && (
            <motion.div 
              key="splash"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={cn(
                "flex-1 flex flex-col items-center justify-center transition-colors duration-500",
                theme === 'dark' ? "bg-[#010409]" : "bg-white"
              )}
            >
              <div className="relative">
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: [1, 1.2, 1], opacity: 1 }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-32 h-32 bg-green-500 rounded-[2.5rem] flex items-center justify-center shadow-[0_0_60px_rgba(34,197,94,0.3)] rotate-12"
                >
                  <Leaf className="w-16 h-16 text-white fill-white -rotate-12" />
                </motion.div>
                <div className="absolute -bottom-4 -right-4 bg-[#0D1117] p-2 rounded-xl shadow-2xl">
                   <Droplets className="w-6 h-6 text-blue-400 animate-bounce" />
                </div>
              </div>
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-10 text-4xl font-black tracking-tighter"
              >
                Dr Plant<span className="text-green-500">.</span>
              </motion.h1>
              <p className="mt-3 text-slate-500 font-bold uppercase tracking-[0.3em] text-[8px] animate-pulse">Initializing AI Bio-Engine</p>
            </motion.div>
          )}

          {/* Auth Portal */}
          {screen === 'auth' && (
            <motion.div 
              key="auth"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex-1 p-8 flex flex-col justify-end pb-20 transition-colors duration-500",
                theme === 'dark' ? "bg-gradient-to-t from-[#010409] to-[#0D1117]" : "bg-gradient-to-t from-slate-100 to-white"
              )}
            >
              <div className="mb-12">
                <div className="w-14 h-14 bg-green-500 rounded-2xl flex items-center justify-center shadow-lg shadow-green-500/20 mb-6">
                  <Leaf className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-4xl font-black leading-tight mb-4">Protect Your <br/><span className="text-green-500">Harvest.</span></h2>
                <p className="text-slate-500 font-medium leading-relaxed">Join thousands of farmers using professional diagnosis tools today.</p>
              </div>
              <div className="space-y-4">
                <button 
                  onClick={() => setScreen('signin')}
                  className="w-full h-16 bg-white text-black font-black rounded-2xl active:scale-95 transition-all shadow-xl"
                >
                  SIGN IN
                </button>
                <button 
                  onClick={() => setScreen('signup')}
                  className="w-full h-16 bg-[#161B22] border border-white/10 text-white font-bold rounded-2xl active:scale-95 transition-all"
                >
                  CREATE ACCOUNT
                </button>
                <div className="flex items-center gap-4 py-4 opacity-30">
                  <div className="flex-1 h-px bg-white"></div>
                  <span className="text-[10px] font-black">QUICK ACCESS</span>
                  <div className="flex-1 h-px bg-white"></div>
                </div>
                <button 
                  onClick={handleGoogleSignIn}
                  className="w-full h-16 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-600/20"
                >
                  <Globe className="w-5 h-5" />
                  SIGN IN WITH GOOGLE
                </button>
              </div>
            </motion.div>
          )}

          {/* Sign In Screen */}
          {screen === 'signin' && (
            <motion.div key="signin" initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex-1 p-8">
              <button 
                onClick={() => setScreen('auth')} 
                className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center mb-10 transition-colors",
                  theme === 'dark' ? "bg-[#161B22]" : "bg-slate-100"
                )}
              >
                <ArrowLeft className={cn("w-5 h-5", theme === 'dark' ? "text-white" : "text-slate-600")}/>
              </button>
              <h2 className="text-3xl font-black mb-2 font-heading">Welcome Back</h2>
              <p className="text-slate-500 mb-10">Access your saved diagnoses and care tips.</p>
              <div className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600"/>
                  <input 
                    placeholder="Email" 
                    value={email} 
                    onChange={e=>setEmail(e.target.value)} 
                    className={cn(
                      "w-full h-16 border rounded-2xl pl-14 pr-6 outline-none focus:ring-1 focus:ring-green-500/50 transition-colors",
                      theme === 'dark' ? "bg-[#161B22] border-white/5" : "bg-slate-50 border-slate-200"
                    )} 
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600"/>
                  <input 
                    type="password" 
                    placeholder="Password" 
                    value={password} 
                    onChange={e=>setPassword(e.target.value)} 
                    className={cn(
                      "w-full h-16 border rounded-2xl pl-14 pr-6 outline-none focus:ring-1 focus:ring-green-500/50 transition-colors",
                      theme === 'dark' ? "bg-[#161B22] border-white/5" : "bg-slate-50 border-slate-200"
                    )} 
                  />
                </div>
                <button onClick={() => setScreen('forgot')} className="text-xs font-bold text-slate-600 hover:text-white transition-colors">Forgot Password?</button>
                <button onClick={handleSignIn} disabled={authLoading} className="w-full h-16 bg-green-600 text-white font-black rounded-2xl shadow-xl shadow-green-600/20 flex items-center justify-center gap-3 active:scale-95 transition-all">
                  {authLoading ? <Loader2 className="w-5 h-5 animate-spin"/> : <LogIn className="w-5 h-5"/>}
                  SIGN IN
                </button>
              </div>
            </motion.div>
          )}

          {/* Signup Screen */}
          {screen === 'signup' && (
            <motion.div key="signup" initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex-1 p-8 overflow-y-auto">
              <button 
                onClick={() => setScreen('auth')} 
                className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center mb-8 transition-colors",
                  theme === 'dark' ? "bg-[#161B22]" : "bg-slate-100"
                )}
              >
                <ArrowLeft className={cn("w-5 h-5", theme === 'dark' ? "text-white" : "text-slate-600")}/>
              </button>
              <h2 className="text-3xl font-black mb-2 font-heading">Join Dr Plant</h2>
              <p className="text-slate-500 mb-8">Personalized AI care for your garden.</p>
              
              {successMsg ? (
                <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="p-10 bg-green-500/10 rounded-3xl border border-green-500/30 flex flex-col items-center">
                  <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
                  <p className="font-black text-center text-lg">{successMsg}</p>
                  <p className="text-xs text-slate-500 mt-2">Redirecting to Login...</p>
                </motion.div>
              ) : (
                <div className="space-y-4 pb-10">
                  <input 
                    placeholder="Full Name" 
                    value={name} 
                    onChange={e=>setName(e.target.value)} 
                    className={cn(
                      "w-full h-16 border rounded-2xl px-14 outline-none transition-colors",
                      theme === 'dark' ? "bg-[#161B22] border-white/5" : "bg-slate-50 border-slate-200 px-6 text-slate-800"
                    )} 
                  />
                  <input 
                    placeholder="Nickname" 
                    value={nickname} 
                    onChange={e=>setNickname(e.target.value)} 
                    className={cn(
                      "w-full h-16 border rounded-2xl px-14 outline-none transition-colors",
                      theme === 'dark' ? "bg-[#161B22] border-white/5" : "bg-slate-50 border-slate-200 px-6 text-slate-800"
                    )} 
                  />
                  <input 
                    placeholder="Email" 
                    value={email} 
                    onChange={e=>setEmail(e.target.value)} 
                    className={cn(
                      "w-full h-16 border rounded-2xl px-14 outline-none transition-colors",
                      theme === 'dark' ? "bg-[#161B22] border-white/5" : "bg-slate-50 border-slate-200 px-6 text-slate-800"
                    )} 
                  />
                  <input 
                    type="password" 
                    placeholder="Password" 
                    value={password} 
                    onChange={e=>setPassword(e.target.value)} 
                    className={cn(
                      "w-full h-16 border rounded-2xl px-14 outline-none transition-colors",
                      theme === 'dark' ? "bg-[#161B22] border-white/5" : "bg-slate-50 border-slate-200 px-6 text-slate-800"
                    )} 
                  />
                  <button onClick={handleSignUp} disabled={authLoading} className="w-full h-16 bg-green-600 text-white font-black rounded-2xl shadow-xl shadow-green-600/20 flex items-center justify-center gap-3 transition-transform active:scale-95">
                    {authLoading ? <Loader2 className="w-5 h-5 animate-spin"/> : <UserPlus className="w-5 h-5"/>}
                    CREATE ACCOUNT
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* Forgot Password */}
          {screen === 'forgot' && (
            <motion.div key="forgot" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex-1 p-8">
              <button onClick={() => setScreen('signin')} className="w-12 h-12 bg-[#161B22] rounded-2xl flex items-center justify-center mb-10"><ArrowLeft className="w-5 h-5"/></button>
              <h2 className="text-3xl font-black mb-2">Reset Key</h2>
              <p className="text-slate-500 mb-10">Enter your email and we'll send a reset link.</p>
              <input placeholder="Email Address" value={email} onChange={e=>setEmail(e.target.value)} className="w-full h-16 bg-[#161B22] border border-white/5 rounded-2xl px-6 mb-6 outline-none" />
              <button onClick={resetPassword} className="w-full h-16 bg-white text-black font-black rounded-2xl">SEND RESET EMAIL</button>
            </motion.div>
          )}

          {/* Landing/Dashboard */}
          {screen === 'landing' && user && (
            <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col overflow-y-auto">
              <div className="p-8 pb-32">
                <div className="flex justify-between items-center mb-10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-tr from-green-600 to-emerald-400 rounded-2xl flex items-center justify-center font-black text-white text-xl shadow-lg border border-white/10">
                      {(userNickname || user.displayName || user.email || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em] mb-1">Welcome Back</p>
                      <h3 className={cn("text-xl font-bold tracking-tight font-heading", theme === 'dark' ? "text-white" : "text-slate-900")}>Hey, {userNickname || user.displayName?.split(' ')[0] || 'Gardener'}!</h3>
                    </div>
                  </div>
                  <button 
                    onClick={() => setScreen('settings')} 
                    className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors active:scale-90",
                      theme === 'dark' ? "bg-[#161B22] border-white/5 text-slate-500" : "bg-slate-100 border-slate-200 text-slate-600"
                    )}
                  >
                    <Bell className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-gradient-to-br from-green-600 to-emerald-600 rounded-[3.2rem] p-8 mb-10 relative overflow-hidden shadow-2xl shadow-green-500/20">
                  <div className="absolute top-0 right-0 p-8 opacity-20"><Leaf className="w-24 h-24 text-white"/></div>
                  <h4 className="text-2xl font-black mb-6 leading-tight max-w-[150px] text-white">Check your crop status now.</h4>
                  <div className="flex gap-4">
                    <button onClick={() => fileInputRef.current?.click()} className="bg-white text-black px-8 py-4 rounded-2xl font-black text-sm active:scale-95 shadow-xl">START SCAN</button>
                    <button onClick={() => setScreen('chat')} className="bg-white/20 backdrop-blur-md text-white p-4 rounded-2xl active:scale-95">
                      <MessageSquare className="w-5 h-5"/>
                    </button>
                  </div>
                </div>

                <section>
                  <div className="flex justify-between items-center mb-6">
                    <h5 className={cn("font-bold text-base font-heading", theme === 'dark' ? "text-white" : "text-slate-900")}>Recent Activity</h5>
                    <button onClick={()=>setScreen('history')} className="text-xs font-black text-green-500 uppercase tracking-widest">History</button>
                  </div>
                  {history.length > 0 ? (
                    <div className="space-y-4">
                      {history.slice(0, 3).map((item, idx) => (
                        <motion.div 
                          key={item.id} 
                          initial={{ opacity: 0, x: -20 }} 
                          animate={{ opacity: 1, x: 0 }} 
                          transition={{ delay: idx * 0.1 }} 
                          onClick={() => {setCurrentScan(item); setScreen('result');}} 
                          className={cn(
                            "p-4 rounded-[1.5rem] border flex gap-4 cursor-pointer hover:scale-[1.02] transition-all",
                            theme === 'dark' ? "bg-[#161B22] border-white/5 hover:bg-[#1C2128]" : "bg-white border-slate-200 hover:bg-slate-50 shadow-sm"
                          )}
                        >
                          <img src={item.image} className="w-16 h-16 rounded-xl object-cover shrink-0 shadow-lg" />
                          <div className="flex-1 min-w-0">
                            <h6 className={cn("font-bold text-sm mb-1 truncate font-heading", theme === 'dark' ? "text-white" : "text-slate-800")}>{item.diseaseName}</h6>
                            <p className="text-[10px] text-slate-500 font-medium mb-2">{item.date}</p>
                            <span className={cn("px-2 py-0.5 text-[8px] font-black uppercase rounded-full", item.severity === 'Low' ? "bg-green-500/10 text-green-500" : item.severity === 'Medium' ? "bg-amber-500/10 text-amber-500" : "bg-red-500/10 text-red-500")}>{item.severity} Risk</span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className={cn(
                      "p-12 rounded-[2rem] border border-dashed flex flex-col items-center opacity-30",
                      theme === 'dark' ? "bg-[#161B22] border-white/10" : "bg-slate-100 border-slate-300"
                    )}>
                      <Activity className={cn("w-12 h-12 mb-4", theme === 'dark' ? "text-white" : "text-slate-400")}/>
                      <p className="text-[10px] font-black uppercase tracking-widest">No Bio-Logs Found</p>
                    </div>
                  )}
                </section>
              </div>
            </motion.div>
          )}

          {/* Full-Screen Scan */}
          {screen === 'scan' && selectedImage && (
            <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("flex-1 p-8 flex flex-col", theme === 'dark' ? "bg-[#0D1117]" : "bg-white")}>
               <div className="flex justify-between items-center mb-8">
                 <h2 className="text-3xl font-black mb-8 tracking-tighter font-heading">AI Inspection</h2>
                 <button onClick={()=>setScreen('landing')} className={cn("w-10 h-10 rounded-xl flex items-center justify-center", theme === 'dark' ? "bg-white/5" : "bg-slate-100")}><X className="w-5 h-5"/></button>
               </div>
               <div className="flex-1 rounded-[3.5rem] overflow-hidden border border-white/10 relative shadow-2xl group">
                 <img src={selectedImage} className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all duration-1000" />
                 {isLoading && (
                   <div className={cn("absolute inset-0 backdrop-blur-xl flex flex-col items-center justify-center text-center p-10", theme === 'dark' ? "bg-[#0D1117]/85" : "bg-white/90")}>
                      <div className="relative mb-12">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} className="w-28 h-28 border-4 border-green-500/10 border-t-green-500 rounded-full" />
                        <div className="absolute inset-0 flex items-center justify-center"><Leaf className="w-10 h-10 text-green-500 animate-pulse" /></div>
                      </div>
                      <h3 className={cn("text-2xl font-black mb-4 tracking-tighter font-heading", theme === 'dark' ? "text-white" : "text-slate-900")}>IDENTIFYING PATHOGEN</h3>
                      <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] leading-relaxed max-w-[180px]">Synthesizing molecular structure & leaf pigmentation...</p>
                   </div>
                 )}
               </div>
               {!isLoading && (
                 <div className="mt-8 grid grid-cols-2 gap-4">
                   <button onClick={() => setScreen('landing')} className={cn("h-18 rounded-[1.5rem] font-bold text-slate-500 transition-colors", theme === 'dark' ? "bg-[#161B22]" : "bg-slate-100")}>ABORT</button>
                   <button onClick={analyzeImage} className="h-18 rounded-[1.5rem] bg-green-600 font-black text-white shadow-lg shadow-green-500/20">RUN DIAGNOSIS</button>
                 </div>
               )}
            </motion.div>
          )}

          {/* Result View */}
          {screen === 'result' && currentScan && (
             <motion.div key="result" initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={cn("flex-1 flex flex-col overflow-y-auto transition-colors", theme === 'dark' ? "bg-[#010409]" : "bg-white")}>
               <div className="h-[45%] relative">
                 <img src={currentScan.image} className="w-full h-full object-cover" />
                 <div className={cn("absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t to-transparent", theme === 'dark' ? "from-[#010409]" : "from-white")}></div>
                 <button onClick={()=>setScreen('landing')} className="absolute top-8 left-8 w-12 h-12 bg-black/50 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-white/10 active:scale-90 transition-transform"><ArrowLeft className="w-6 h-6 text-white"/></button>
               </div>
               <div className="flex-1 -mt-16 p-8 relative">
                 <div className="flex justify-between items-start mb-10">
                   <div>
                     <p className="text-xs font-black text-green-500 uppercase tracking-[0.2em] mb-2">Final Report</p>
                     <h2 className={cn("text-4xl font-black leading-none font-heading", theme === 'dark' ? "text-white" : "text-slate-900")}>{currentScan.diseaseName}</h2>
                     <div className="mt-4 flex items-center gap-4">
                        <span className={cn("px-4 py-1.5 rounded-full text-[10px] font-black uppercase", currentScan.severity === 'Low' ? "bg-green-500/10 text-green-500" : currentScan.severity === 'Medium' ? "bg-amber-500/10 text-amber-500" : "bg-red-500/10 text-red-500")}>{currentScan.severity} RISK level</span>
                        <span className="text-slate-500 text-xs font-black">{(currentScan.confidence*100).toFixed(0)}% MATCH</span>
                     </div>
                   </div>
                 </div>
                 <div className="space-y-10 pb-20">
                   <p className={cn("text-lg leading-relaxed italic border-l-4 border-green-500 pl-6", theme === 'dark' ? "text-slate-400" : "text-slate-600")}>"{currentScan.description}"</p>
                   <div className="grid grid-cols-1 gap-6">
                      <div className={cn("p-8 rounded-[2.5rem] border transition-colors", theme === 'dark' ? "bg-[#0D1117] border-white/5" : "bg-slate-50 border-slate-200")}>
                         <div className="flex items-center gap-4 mb-6 text-emerald-400 font-heading"><Droplets className="w-6 h-6"/><h4 className="font-black uppercase tracking-widest text-sm">Treatment Steps</h4></div>
                         <ul className="space-y-4">
                           {currentScan.treatment.map((t, i) => <li key={i} className="flex gap-4 text-sm text-slate-400"><span className="w-6 h-6 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center text-[10px] font-black shrink-0">{i+1}</span><span className={theme === 'dark' ? "text-slate-400" : "text-slate-600"}>{t}</span></li>)}
                         </ul>
                      </div>
                      <div className={cn("p-8 rounded-[2.5rem] border transition-colors", theme === 'dark' ? "bg-[#0D1117] border-white/5" : "bg-slate-50 border-slate-200")}>
                         <div className="flex items-center gap-4 mb-6 text-green-500 font-heading"><ShieldCheck className="w-6 h-6"/><h4 className="font-black uppercase tracking-widest text-sm">Prevention</h4></div>
                         <ul className="space-y-4">
                           {currentScan.prevention.map((p, i) => <li key={i} className="flex gap-4 text-sm text-slate-400"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5"/><span className={theme === 'dark' ? "text-slate-400" : "text-slate-600"}>{p}</span></li>)}
                         </ul>
                      </div>
                   </div>
                   <button onClick={()=>setScreen('landing')} className={cn("w-full h-18 font-black rounded-2xl shadow-xl active:scale-95 transition-all", theme === 'dark' ? "bg-white text-black" : "bg-slate-900 text-white")}>CLOSE REPORT</button>
                 </div>
               </div>
             </motion.div>
          )}

          {/* History / Info / Settings placeholders */}
          {screen === 'history' && (
            <motion.div key="hist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("flex-1 p-8 overflow-y-auto transition-colors", theme === 'dark' ? "bg-[#010409]" : "bg-white")}>
              <button 
                onClick={() => setScreen('landing')} 
                className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center mb-10 transition-colors",
                  theme === 'dark' ? "bg-[#161B22]" : "bg-slate-100"
                )}
              >
                <ArrowLeft className={cn("w-5 h-5", theme === 'dark' ? "text-slate-400" : "text-slate-600")} />
              </button>
              <h2 className={cn("text-3xl font-black mb-10 font-heading", theme === 'dark' ? "text-white" : "text-slate-900")}>Scan Archives</h2>
              <div className="space-y-4 pb-20">
                {history.map(item => (
                  <div 
                    key={item.id} 
                    onClick={() => {setCurrentScan(item); setScreen('result');}} 
                    className={cn(
                      "p-4 rounded-3xl border flex gap-4 transition-all active:scale-95",
                      theme === 'dark' ? "bg-[#161B22] border-white/5" : "bg-white border-slate-200 shadow-sm"
                    )}
                  >
                    <img src={item.image} className="w-20 h-20 rounded-2xl object-cover shrink-0" />
                    <div>
                      <h4 className={cn("font-bold mb-1 truncate font-heading", theme === 'dark' ? "text-white" : "text-slate-800")}>{item.diseaseName}</h4>
                      <p className="text-[10px] text-slate-500 font-bold mb-3">{item.date}</p>
                      <span className="text-[9px] font-black uppercase text-green-500 px-2 py-1 bg-green-500/5 rounded-lg border border-green-500/20">View Details →</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {screen === 'settings' && (
            <motion.div key="sett" initial={{ y: 50 }} animate={{ y: 0 }} className={cn("flex-1 p-8 transition-colors", theme === 'dark' ? "bg-[#010409]" : "bg-white")}>
              <button 
                onClick={() => setScreen('landing')} 
                className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center mb-10 transition-colors",
                  theme === 'dark' ? "bg-[#161B22]" : "bg-slate-100"
                )}
              >
                <ArrowLeft className={cn("w-5 h-5", theme === 'dark' ? "text-slate-400" : "text-slate-600")} />
              </button>
              <h2 className={cn("text-3xl font-black mb-10 font-heading", theme === 'dark' ? "text-white" : "text-slate-900")}>Preferences</h2>
              <div className={cn(
                "p-8 rounded-[2.5rem] flex flex-col items-center mb-10 border transition-colors",
                theme === 'dark' ? "bg-[#161B22] border-white/5" : "bg-slate-50 border-slate-200"
              )}>
                <div className="w-20 h-20 bg-gradient-to-tr from-green-600 to-emerald-400 rounded-3xl flex items-center justify-center text-3xl font-black mb-4 text-white">{(userNickname || user?.displayName || '?')[0]}</div>
                <h3 className={cn("text-xl font-bold font-heading", theme === 'dark' ? "text-white" : "text-slate-900")}>{userNickname || user?.displayName || 'Gardener'}</h3>
                <p className="text-slate-500 text-sm mb-6">{user?.email}</p>
                <button onClick={logout} className="px-8 py-3 bg-red-500/10 text-red-500 font-black rounded-xl border border-red-500/20 active:scale-95 transition-all">SECURE LOGOUT</button>
              </div>
            </motion.div>
          )}          {/* Chat Screen */}
          {screen === 'chat' && (
            <motion.div 
              key="chat"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className={cn("flex-1 flex flex-col transition-colors", theme === 'dark' ? "bg-[#0D1117]" : "bg-white")}
            >
              <div className={cn(
                "p-8 border-b flex items-center justify-between backdrop-blur-xl sticky top-0 z-10 transition-colors",
                theme === 'dark' ? "bg-[#0D1117]/80 border-white/5" : "bg-white/80 border-slate-200"
              )}>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setScreen('landing')} 
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                      theme === 'dark' ? "bg-[#161B22]" : "bg-slate-100"
                    )}
                  >
                    <ArrowLeft className={cn("w-5 h-5", theme === 'dark' ? "text-white" : "text-slate-600")} />
                  </button>
                  <div>
                    <h2 className={cn("font-bold font-heading", theme === 'dark' ? "text-white" : "text-slate-900")}>Plant Expert</h2>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest font-heading">AI Online</span>
                    </div>
                  </div>
                </div>
              </div>

              <div 
                ref={chatScrollRef}
                className="flex-1 overflow-y-auto p-6 space-y-4 scroll-smooth"
              >
                {chatMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 text-center">
                    <MessageSquare className="w-16 h-16 mb-4" />
                    <p className="font-black tracking-widest uppercase text-sm font-heading">Start a conversation<br/>with Dr Plant Assistant</p>
                  </div>
                )}
                {chatMessages.map((msg) => (
                  <div 
                    key={msg.id}
                    className={cn(
                      "flex",
                      msg.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    <div className={cn(
                      "max-w-[80%] p-4 rounded-b-2xl text-sm leading-relaxed transition-all",
                      msg.role === 'user' 
                        ? "bg-green-600 text-white rounded-tl-2xl shadow-lg shadow-green-600/20" 
                        : cn("rounded-tr-2xl border transition-colors", theme === 'dark' ? "bg-[#161B22] text-slate-300 border-white/5" : "bg-slate-100 text-slate-700 border-slate-200")
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className={cn(
                      "p-4 rounded-2xl rounded-tl-none border flex gap-1",
                      theme === 'dark' ? "bg-[#161B22] border-white/5" : "bg-slate-100 border-slate-200"
                    )}>
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                    </div>
                  </div>
                )}
              </div>

              <div className={cn(
                "p-6 border-t mb-4 transition-colors",
                theme === 'dark' ? "bg-[#0D1117] border-white/5" : "bg-white border-slate-200"
              )}>
                <div className="relative flex items-center gap-3">
                  <input 
                    placeholder="Ask about your plants..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    className={cn(
                      "flex-1 h-14 border rounded-2xl px-6 outline-none focus:ring-4 transition-all",
                      theme === 'dark' ? "bg-[#161B22] border-white/10 text-white focus:ring-green-500/10" : "bg-slate-50 border-slate-200 text-slate-800 focus:ring-green-500/10"
                    )}
                  />
                  <button 
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim() || chatLoading}
                    className="w-14 h-14 bg-green-600 text-white rounded-2xl flex items-center justify-center active:scale-90 transition-all disabled:opacity-50 disabled:grayscale"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        {/* Navigation Bar */}
        {screen !== 'splash' && screen !== 'auth' && screen !== 'signin' && screen !== 'signup' && screen !== 'forgot' && screen !== 'scan' && screen !== 'result' && screen !== 'chat' && (
          <div className={cn(
            "absolute bottom-0 inset-x-0 h-28 backdrop-blur-3xl border-t flex items-center justify-between px-6 pb-2 transition-colors z-[80]",
            theme === 'dark' ? "bg-[#0D1117]/95 border-white/5" : "bg-white/95 border-slate-200 shadow-lg"
          )}>
            <button onClick={() => setScreen('landing')} className={cn("flex flex-col items-center gap-1 transition-all", screen === 'landing' ? "text-green-500" : "text-slate-500")}>
              <Activity className="w-6 h-6" />
              <span className="text-[8px] font-black uppercase tracking-tighter">Home</span>
            </button>
            <button onClick={() => setScreen('history')} className={cn("flex flex-col items-center gap-1 transition-all", screen === 'history' ? "text-green-500" : "text-slate-500")}>
              <HistoryIcon className="w-6 h-6" />
              <span className="text-[8px] font-black uppercase tracking-tighter">Logs</span>
            </button>
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "w-16 h-16 bg-gradient-to-tr from-green-600 to-emerald-400 rounded-full flex items-center justify-center -mt-16 border-[10px] shadow-2xl active:scale-90 transition-all",
                theme === 'dark' ? "border-[#0D1117]" : "border-white"
              )}
            >
              <Camera className="w-6 h-6 text-white" />
            </button>

            <button onClick={() => setScreen('chat')} className={cn("flex flex-col items-center gap-1 transition-all", screen === 'chat' ? "text-green-500" : "text-slate-500")}>
              <MessageSquare className="w-6 h-6" />
              <span className="text-[8px] font-black uppercase tracking-tighter font-heading">Expert</span>
            </button>
            <button onClick={() => setScreen('settings')} className={cn("flex flex-col items-center gap-1 transition-all", screen === 'settings' ? "text-green-500" : "text-slate-500")}>
              <SettingsIcon className="w-6 h-6" />
              <span className="text-[8px] font-black uppercase tracking-tighter font-heading">Profile</span>
            </button>
          </div>
        )}

        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
      </div>
    </div>
  );
}

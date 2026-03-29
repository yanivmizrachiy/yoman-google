import React, { useState, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  RefreshCw, 
  Settings, 
  X, 
  Trash2, 
  Clock, 
  AlignLeft, 
  Palette, 
  Sparkles,
  Check,
  Monitor,
  LayoutGrid,
  List as ListIcon,
  ExternalLink,
  Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, addHours } from 'date-fns';
import { GoogleGenAI, Type } from "@google/genai";
import { cn } from './lib/utils';

const GOOGLE_COLORS = [
  { id: '1', name: 'Lavender', hex: '#a4bdfc' },
  { id: '2', name: 'Sage', hex: '#7ae7bf' },
  { id: '3', name: 'Grape', hex: '#dbadff' },
  { id: '4', name: 'Flamingo', hex: '#ff887c' },
  { id: '5', name: 'Banana', hex: '#fbd75b' },
  { id: '6', name: 'Mandarin', hex: '#ffb878' },
  { id: '7', name: 'Peacock', hex: '#46d6db' },
  { id: '8', name: 'Graphite', hex: '#e1e1e1' },
  { id: '9', name: 'Blueberry', hex: '#5484ed' },
  { id: '10', name: 'Basil', hex: '#51b886' },
  { id: '11', name: 'Tomato', hex: '#dc2127' },
];

const FullCalendarComponent = FullCalendar as any;

export default function App() {
  const [events, setEvents] = useState<any[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [configStatus, setConfigStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSmartInputOpen, setIsSmartInputOpen] = useState(false);
  const [smartInput, setSmartInput] = useState('');
  const [isSmartProcessing, setIsSmartProcessing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [formData, setFormData] = useState({
    summary: '',
    description: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    startTime: format(new Date(), 'HH:mm'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    endTime: format(addHours(new Date(), 1), 'HH:mm'),
    colorId: '1',
    allDay: false
  });

  const calendarRef = useRef<any>(null);

  const handleBackup = async () => {
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yoman_backup_${format(new Date(), 'yyyy-MM-dd')}.json`;
      a.click();
    } catch (error) {
      console.error('Backup failed');
    }
  };

  useEffect(() => {
    checkAuth();
    
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (calendarRef.current) {
        calendarRef.current.getApi().changeView(mobile ? 'listWeek' : 'dayGridMonth');
      }
    };

    window.addEventListener('resize', handleResize);
    
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkAuth();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBtn(false);
    }
    setDeferredPrompt(null);
  };

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setIsAuthenticated(data.authenticated);
      setUser(data.user);
      setConfigStatus(data.config);
      if (data.authenticated) fetchEvents();
    } catch (error) {
      console.error('Health check failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setIsAuthenticated(false);
      setUser(null);
      setEvents([]);
    } catch (error) {
      console.error('Logout failed');
    }
  };

  const fetchEvents = async () => {
    setSyncStatus('syncing');
    try {
      const res = await fetch('/api/events');
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      const data = await res.json();
      setEvents(data || []);
      setSyncStatus('synced');
    } catch (error) {
      setSyncStatus('error');
    }
  };

  const handleLogin = async () => {
    const res = await fetch('/api/auth/url');
    const { url } = await res.json();
    window.open(url, 'google_auth', 'width=600,height=700');
  };

  const handleDateClick = (arg: any) => {
    setFormData({
      ...formData,
      startDate: arg.dateStr,
      endDate: arg.dateStr,
      summary: '',
      description: '',
      allDay: arg.allDay || false
    });
    setSelectedEvent(null);
    setIsModalOpen(true);
  };

  const handleEventClick = (arg: any) => {
    const event = events.find(e => e.id === arg.event.id);
    if (event) {
      const start = event.start.dateTime ? parseISO(event.start.dateTime) : parseISO(event.start.date!);
      const end = event.end.dateTime ? parseISO(event.end.dateTime) : parseISO(event.end.date!);
      setFormData({
        summary: event.summary,
        description: event.description || '',
        startDate: format(start, 'yyyy-MM-dd'),
        startTime: format(start, 'HH:mm'),
        endDate: format(end, 'yyyy-MM-dd'),
        endTime: format(end, 'HH:mm'),
        colorId: event.colorId || '1',
        allDay: !!event.start.date
      });
      setSelectedEvent(event);
      setIsModalOpen(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSyncStatus('syncing');
    
    const start = formData.allDay ? { date: formData.startDate } : { dateTime: `${formData.startDate}T${formData.startTime}:00Z` };
    const end = formData.allDay ? { date: formData.endDate } : { dateTime: `${formData.endDate}T${formData.endTime}:00Z` };

    const eventBody = {
      summary: formData.summary,
      description: formData.description,
      start,
      end,
      colorId: formData.colorId
    };

    // Optimistic Update
    const tempId = 'temp-' + Date.now();
    const optimisticEvent = { ...eventBody, id: tempId, backgroundColor: GOOGLE_COLORS.find(c => c.id === formData.colorId)?.hex };
    
    if (selectedEvent) {
      setEvents(prev => prev.map(e => e.id === selectedEvent.id ? { ...e, ...optimisticEvent, id: selectedEvent.id } : e));
    } else {
      setEvents(prev => [...prev, optimisticEvent]);
    }

    try {
      const method = selectedEvent ? 'PUT' : 'POST';
      const url = selectedEvent ? `/api/events/${selectedEvent.id}` : '/api/events';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventBody)
      });
      
      if (!res.ok) throw new Error('Failed to save');
      
      setIsModalOpen(false);
      fetchEvents(); // Refresh to get real ID and server state
    } catch (error) {
      setSyncStatus('error');
      fetchEvents(); // Rollback on error
    }
  };

  const handleSmartSubmit = async () => {
    if (!smartInput.trim()) return;
    setIsSmartProcessing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are a TITAN Calendar AI assistant. Parse this Hebrew calendar request into a structured action. 
        Today is ${format(new Date(), 'yyyy-MM-dd HH:mm')}. 
        Current events in calendar: ${JSON.stringify(events.map(e => ({ id: e.id, summary: e.summary, start: e.start.dateTime || e.start.date, end: e.end.dateTime || e.end.date })))}
        
        Request: "${smartInput}"`,
        config: {
          systemInstruction: "You are the TITAN AI Core. Your mission is to manage the user's Google Calendar with absolute precision. \n" +
            "1. 'create': Generate new events. Infer missing details logically. \n" +
            "2. 'update': Modify existing events. You MUST use the provided 'id' from the context. \n" +
            "3. 'delete': Remove events. You MUST use the provided 'id'. \n" +
            "4. 'list': Search or navigate. Return 'startDate' to move the calendar view. \n" +
            "Rules: \n" +
            "- Always use the current date/time context: " + format(new Date(), 'yyyy-MM-dd HH:mm') + "\n" +
            "- If the user is vague (e.g., 'פגישה מחר'), assume a reasonable time (e.g., 10:00 AM). \n" +
            "- Return ONLY valid JSON. \n" +
            "- For 'update' and 'delete', find the closest matching event in the provided context and use its 'id'.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              action: { type: Type.STRING, enum: ["create", "update", "delete", "list"] },
              data: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  startDate: { type: Type.STRING },
                  startTime: { type: Type.STRING },
                  endDate: { type: Type.STRING },
                  endTime: { type: Type.STRING },
                  allDay: { type: Type.BOOLEAN },
                  query: { type: Type.STRING }
                }
              }
            },
            required: ["action", "data"]
          }
        }
      });
      
      const parsed = JSON.parse(response.text);
      const { action, data } = parsed;

      if (action === 'create') {
        setFormData({ ...formData, ...data, description: `AI: ${smartInput}`, colorId: '5' });
        setIsSmartInputOpen(false);
        setIsModalOpen(true);
      } else if (action === 'update') {
        const event = events.find(e => e.id === data.id);
        if (event) {
          setFormData({ ...formData, ...data, description: `AI Updated: ${smartInput}`, colorId: '6' });
          setSelectedEvent(event);
          setIsSmartInputOpen(false);
          setIsModalOpen(true);
        }
      } else if (action === 'delete') {
        if (data.id) {
          // Optimistic Delete
          setEvents(prev => prev.filter(e => e.id !== data.id));
          setSyncStatus('syncing');
          await fetch(`/api/events/${data.id}`, { method: 'DELETE' });
          fetchEvents();
          setIsSmartInputOpen(false);
        }
      } else if (action === 'list') {
        if (data.startDate) {
          calendarRef.current?.getApi().gotoDate(data.startDate);
          // If it's a specific event, highlight it or just show week view
          if (data.id) {
            calendarRef.current?.getApi().changeView('timeGridWeek');
          }
        }
        setIsSmartInputOpen(false);
      }
      
      setSmartInput('');
    } catch (error) {
      console.error('AI error', error);
      alert('משהו השתבש בעיבוד ה-AI. נסה שוב או הזן ידנית.');
    } finally {
      setIsSmartProcessing(false);
    }
  };

  if (isLoading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0f172a] text-white">
      <motion.div 
        animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="w-24 h-24 bg-blue-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/40 mb-8"
      >
        <CalendarIcon className="w-12 h-12 text-white" />
      </motion.div>
      <h2 className="text-2xl font-black tracking-widest animate-pulse">TITAN V8.0 INITIALIZING...</h2>
      <p className="text-slate-500 font-bold mt-2">מעלה מערכות ביצועים...</p>
    </div>
  );

  const isConfigured = configStatus?.clientId && configStatus?.clientSecret;

  if (!isConfigured) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0f172a] p-6 direction-rtl text-white">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="max-w-2xl w-full bg-slate-900/50 backdrop-blur-2xl p-12 rounded-[48px] shadow-3xl border border-white/10">
        <div className="flex items-center gap-6 mb-10">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/20">
            <Settings className="w-10 h-10 text-white animate-spin-slow" />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter mb-1">TITAN SETUP REQUIRED</h1>
            <p className="text-slate-400 font-bold">המנוע של ה-TITAN זקוק למפתחות כדי להתניע</p>
          </div>
        </div>

        <div className="space-y-4 mb-10">
          <div className={cn("p-6 rounded-3xl border flex items-center justify-between", configStatus?.clientId ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20")}>
            <div className="flex items-center gap-4">
              <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center", configStatus?.clientId ? "bg-emerald-500 text-white" : "bg-rose-500 text-white")}>
                {configStatus?.clientId ? <Check className="w-6 h-6" /> : <X className="w-6 h-6" />}
              </div>
              <div>
                <span className="block text-sm font-black uppercase tracking-widest opacity-50">Step 1</span>
                <span className="text-lg font-bold">GOOGLE_CLIENT_ID</span>
              </div>
            </div>
            {!configStatus?.clientId && <span className="text-rose-400 font-black text-xs uppercase">Missing</span>}
          </div>

          <div className={cn("p-6 rounded-3xl border flex items-center justify-between", configStatus?.clientSecret ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20")}>
            <div className="flex items-center gap-4">
              <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center", configStatus?.clientSecret ? "bg-emerald-500 text-white" : "bg-rose-500 text-white")}>
                {configStatus?.clientSecret ? <Check className="w-6 h-6" /> : <X className="w-6 h-6" />}
              </div>
              <div>
                <span className="block text-sm font-black uppercase tracking-widest opacity-50">Step 2</span>
                <span className="text-lg font-bold">GOOGLE_CLIENT_SECRET</span>
              </div>
            </div>
            {!configStatus?.clientSecret && <span className="text-rose-400 font-black text-xs uppercase">Missing</span>}
          </div>

          <div className="bg-blue-500/5 border border-blue-500/20 p-8 rounded-[32px] mt-8">
            <h3 className="text-blue-400 font-black text-sm uppercase tracking-widest mb-4 flex items-center gap-2">
              <Monitor className="w-4 h-4" /> הוראות ביצוע
            </h3>
            <ol className="space-y-4 text-slate-300 font-bold text-sm list-decimal list-inside">
              <li>לחץ על <span className="text-white">Settings</span> (גלגל שיניים) למעלה מימין ב-AI Studio.</li>
              <li>הוסף את המפתחות תחת <span className="text-white">Environment Variables</span>.</li>
              <li>השתמש בשמות המדויקים שמופיעים למעלה באדום.</li>
              <li>לאחר השמירה, המתן לטעינה מחדש וה-TITAN יתעורר לחיים.</li>
            </ol>
          </div>
        </div>

        <button onClick={() => window.location.reload()} className="w-full bg-white text-slate-900 py-6 rounded-2xl font-black text-xl hover:bg-blue-50 transition-all active:scale-95 flex items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6" /> בדוק שוב את המערכת
        </button>
      </motion.div>
    </div>
  );

  if (!isAuthenticated) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#f0f4f8] p-6 direction-rtl">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-md w-full bg-white p-10 rounded-[40px] shadow-2xl text-center border border-white">
        <div className="w-24 h-24 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
          <CalendarIcon className="w-12 h-12 text-blue-600" />
        </div>
        <h1 className="text-4xl font-black text-gray-900 mb-4 tracking-tight">היומן של יניב</h1>
        <p className="text-gray-500 mb-6 text-lg leading-relaxed">נהל את הזמן שלך בצורה חכמה, מהירה ומסונכרנת עם Google Calendar.</p>
        
        {/* Redirect URI Helper */}
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-left mb-8">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Authorized Redirect URI</span>
          <code className="text-[11px] text-blue-600 break-all font-mono font-bold">
            {window.location.origin}/auth/callback
          </code>
          <p className="text-[10px] text-slate-400 mt-2 font-bold leading-tight">
            * וודא שהכתובת הזו מוגדרת ב-Google Cloud Console תחת Authorized Redirect URIs.
          </p>
        </div>

        <button onClick={handleLogin} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-bold text-xl shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-3">
          <Monitor className="w-6 h-6" /> התחברות עם Google
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-[#020617] direction-rtl font-sans overflow-hidden text-slate-200">
      {/* Titan Status Overlay */}
      <div className="fixed bottom-6 left-6 z-50 pointer-events-none">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-slate-900/40 backdrop-blur-3xl border border-white/10 p-4 rounded-2xl shadow-2xl flex items-center gap-4"
        >
          <div className="relative">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-ping absolute inset-0" />
            <div className="w-3 h-3 bg-blue-500 rounded-full relative" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] leading-none mb-1">System Status</span>
            <span className="text-xs font-black text-white tracking-tighter">TITAN MONSTER V8.0 ONLINE</span>
          </div>
        </motion.div>
      </div>

      {/* Header */}
      <header className="bg-[#0f172a]/40 backdrop-blur-3xl border-b border-white/10 p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-center sticky top-0 z-30 shadow-2xl gap-4">
        <div className="flex items-center justify-between w-full sm:w-auto gap-4">
          <div className="flex items-center gap-4 sm:gap-6">
            <motion.div 
              whileHover={{ rotate: 10, scale: 1.1 }}
              className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-600 to-indigo-800 rounded-[18px] sm:rounded-[24px] flex items-center justify-center shadow-2xl shadow-blue-500/40 flex-shrink-0"
            >
              <CalendarIcon className="w-6 h-6 sm:w-9 sm:h-9 text-white" />
            </motion.div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-black text-white leading-none mb-1 tracking-tighter">היומן של יניב</h1>
              <div className="flex items-center gap-2.5">
                <motion.div 
                  animate={syncStatus === 'syncing' ? { scale: [1, 1.6, 1], opacity: [1, 0.4, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 1.2 }}
                  className={cn("w-2 h-2 sm:w-3 sm:h-3 rounded-full shadow-sm", syncStatus === 'synced' ? "bg-emerald-500 shadow-emerald-500/50" : syncStatus === 'syncing' ? "bg-blue-500 shadow-blue-500/50" : "bg-rose-500 shadow-rose-500/50")} 
                />
                <span className="text-[10px] sm:text-[12px] font-black text-slate-400 uppercase tracking-[0.25em]">{syncStatus === 'synced' ? "TITAN ONLINE" : "סנכרון..."}</span>
              </div>
            </div>
          </div>

          {/* User Profile & Logout (Mobile) */}
          <div className="flex sm:hidden items-center gap-2">
            <a href="https://yanivmiz.co.il" target="_blank" rel="noopener noreferrer" className="p-2 bg-slate-800 text-white rounded-xl"><Globe className="w-5 h-5" /></a>
            {user?.picture && <img src={user.picture} alt="Yaniv" className="w-10 h-10 rounded-full border-2 border-blue-500/20 shadow-md" referrerPolicy="no-referrer" />}
            <button onClick={handleLogout} className="p-2 bg-rose-500/10 text-rose-500 rounded-xl"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="hidden sm:flex items-center gap-2 mr-4">
            <a 
              href="https://yanivmiz.co.il" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-2 px-5 py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-white/10 rounded-2xl text-xs font-black text-white transition-all group"
            >
              <Globe className="w-4 h-4 text-blue-400 group-hover:rotate-12 transition-transform" />
              האתר שלי
              <ExternalLink className="w-3 h-3 opacity-50" />
            </a>
          </div>

          {showInstallBtn && (
            <div className="flex gap-2">
              <button onClick={handleInstall} className="hidden sm:flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-black shadow-2xl shadow-blue-500/20 transition-all">
                <Monitor className="w-4 h-4" /> התקן TITAN
              </button>
            </div>
          )}
          
          <div className="flex items-center gap-2 bg-slate-800/50 p-1.5 rounded-[22px] border border-white/10">
            <button onClick={() => calendarRef.current?.getApi().today()} className="px-4 sm:px-6 py-2.5 sm:py-3 hover:bg-slate-700 rounded-xl text-xs sm:text-sm font-black text-white transition-all active:scale-90">היום</button>
            <button onClick={() => calendarRef.current?.getApi().changeView('timeGridWeek')} className="px-4 sm:px-6 py-2.5 sm:py-3 hover:bg-slate-700 rounded-xl text-xs sm:text-sm font-black text-white transition-all active:scale-90">שבוע</button>
          </div>
          
          <div className="flex gap-2 items-center">
            {/* User Profile & Logout (Desktop) */}
            <div className="hidden sm:flex items-center gap-3 bg-white/5 p-2 rounded-2xl border border-white/10 mr-2">
              {user?.picture && <img src={user.picture} alt="Yaniv" className="w-10 h-10 rounded-full border-2 border-blue-500/40 shadow-sm" referrerPolicy="no-referrer" />}
              <div className="flex flex-col">
                <span className="text-xs font-black text-white leading-none">יניב מזרחי</span>
                <button onClick={handleLogout} className="text-[10px] font-bold text-rose-400 hover:text-rose-500 text-right">התנתק</button>
              </div>
            </div>

            <motion.button 
              whileHover={{ scale: 1.05, rotate: 180 }}
              transition={{ type: "spring", stiffness: 200 }}
              onClick={fetchEvents} 
              className={cn(
                "p-3 sm:p-4 bg-slate-800 border border-white/10 rounded-2xl shadow-lg transition-all hover:border-blue-500 hover:text-blue-400",
                syncStatus === 'syncing' && "animate-spin text-blue-400 border-blue-500"
              )}
            >
              <RefreshCw className="w-5 h-5 sm:w-7 sm:h-7" />
            </motion.button>
            <button onClick={handleBackup} className="p-3 sm:p-4 bg-white text-slate-900 rounded-2xl shadow-xl hover:bg-slate-100 transition-all"><Settings className="w-5 h-5 sm:w-7 sm:h-7" /></button>
          </div>
        </div>
      </header>

      {/* Calendar View */}
      <main className="flex-1 p-2 sm:p-6 overflow-hidden">
        <div className="h-full bg-slate-900/40 backdrop-blur-3xl rounded-[24px] sm:rounded-[32px] shadow-2xl border border-white/10 overflow-hidden p-1 sm:p-4">
          <FullCalendarComponent
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView={isMobile ? 'listWeek' : 'dayGridMonth'}
            headerToolbar={isMobile ? { start: 'prev,next', center: 'title', end: '' } : { start: 'prev,next', center: 'title', end: 'dayGridMonth,timeGridWeek,listMonth' }}
            events={events.map(e => ({
              id: e.id, title: e.summary, start: e.start.dateTime || e.start.date, end: e.end.dateTime || e.end.date,
              backgroundColor: e.backgroundColor || (e.colorId ? GOOGLE_COLORS.find(c => c.id === e.colorId)?.hex : '#3b82f6'),
              borderColor: 'transparent',
              allDay: !!e.start.date,
              textColor: '#fff'
            }))}
            locale="he" direction="rtl" height="100%"
            dateClick={handleDateClick} eventClick={handleEventClick}
            buttonText={{ month: 'חודש', week: 'שבוע', list: 'רשימה' }}
            dayMaxEvents={true}
            nowIndicator={true}
          />
        </div>
      </main>

      {/* FABs */}
      <div className="fixed bottom-6 right-6 sm:bottom-8 sm:left-8 flex flex-col gap-4 z-40">
        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setIsSmartInputOpen(true)} className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-900 text-blue-400 rounded-[20px] sm:rounded-[24px] shadow-2xl border border-white/10 flex items-center justify-center"><Sparkles className="w-6 h-6 sm:w-8 sm:h-8" /></motion.button>
        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => { setSelectedEvent(null); setIsModalOpen(true); }} className="w-14 h-14 sm:w-16 sm:h-16 bg-blue-600 text-white rounded-[20px] sm:rounded-[24px] shadow-2xl shadow-blue-500/40 flex items-center justify-center"><Plus className="w-8 h-8 sm:w-10 sm:h-10" /></motion.button>
      </div>

      {/* Event Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative w-full max-w-xl bg-slate-900 border border-white/10 rounded-t-[40px] sm:rounded-[40px] shadow-3xl overflow-hidden p-8">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-black text-white">{selectedEvent ? 'עריכת אירוע' : 'אירוע חדש'}</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full"><X className="w-7 h-7 text-slate-500" /></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-6">
                <input type="text" required placeholder="מה קורה?" value={formData.summary} onChange={e => setFormData({...formData, summary: e.target.value})} className="w-full p-5 bg-slate-800/50 border-2 border-transparent rounded-2xl focus:border-blue-500 focus:bg-slate-800 outline-none text-xl font-bold transition-all text-white placeholder:text-slate-600" />
                
                <div className="flex items-center gap-2 mb-2">
                  <input 
                    type="checkbox" 
                    id="allDay" 
                    checked={formData.allDay} 
                    onChange={e => setFormData({...formData, allDay: e.target.checked})}
                    className="w-5 h-5 rounded border-white/10 bg-slate-800 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="allDay" className="text-sm font-bold text-slate-400">יום שלם</label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase mr-2">התחלה</label>
                    <div className="flex gap-2">
                      <input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="flex-1 p-4 bg-slate-800/50 text-white rounded-xl outline-none" />
                      {!formData.allDay && <input type="time" value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})} className="w-24 p-4 bg-slate-800/50 text-white rounded-xl outline-none" />}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase mr-2">סיום</label>
                    <div className="flex gap-2">
                      <input type="date" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} className="flex-1 p-4 bg-slate-800/50 text-white rounded-xl outline-none" />
                      {!formData.allDay && <input type="time" value={formData.endTime} onChange={e => setFormData({...formData, endTime: e.target.value})} className="w-24 p-4 bg-slate-800/50 text-white rounded-xl outline-none" />}
                    </div>
                  </div>
                </div>
                <textarea placeholder="פרטים נוספים..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full p-5 bg-slate-800/50 text-white rounded-2xl min-h-[120px] outline-none placeholder:text-slate-600" />
                <div className="flex flex-wrap gap-3">
                  {GOOGLE_COLORS.map(c => (
                    <button key={c.id} type="button" onClick={() => setFormData({...formData, colorId: c.id})} className={cn("w-10 h-10 rounded-full border-4 transition-all", formData.colorId === c.id ? "border-white scale-110" : "border-transparent")} style={{ backgroundColor: c.hex }} />
                  ))}
                </div>
                <div className="flex gap-4 pt-4">
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit" 
                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-5 rounded-2xl font-black text-xl shadow-2xl shadow-blue-500/20"
                  >
                    {selectedEvent ? 'עדכן אירוע' : 'צור אירוע חדש'}
                  </motion.button>
                  {selectedEvent && (
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="button" 
                      onClick={async () => { 
                        // Optimistic Delete
                        const eventId = selectedEvent.id;
                        setEvents(prev => prev.filter(e => e.id !== eventId));
                        setIsModalOpen(false);
                        setSyncStatus('syncing');
                        try {
                          await fetch(`/api/events/${eventId}`, { method: 'DELETE' }); 
                          fetchEvents(); 
                        } catch (e) {
                          setSyncStatus('error');
                          fetchEvents(); // Rollback
                        }
                      }} 
                      className="w-24 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center border border-rose-500/20 hover:bg-rose-500/20 transition-all"
                    >
                      <Trash2 className="w-8 h-8" />
                    </motion.button>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Smart Input Modal */}
      <AnimatePresence>
        {isSmartInputOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSmartInputOpen(false)} className="absolute inset-0 bg-slate-900/80 backdrop-blur-xl" />
            <motion.div initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, y: 20 }} className="relative w-full max-w-lg bg-white rounded-[40px] p-10 shadow-3xl border border-white">
              <div className="flex items-center gap-5 mb-10">
                <div className="w-16 h-16 bg-blue-50 rounded-[22px] flex items-center justify-center shadow-inner"><Sparkles className="w-9 h-9 text-blue-600" /></div>
                <div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">כתיבה חכמה AI</h2>
                  <p className="text-slate-400 font-bold text-sm">פשוט תגיד מה קורה, אני כבר אדאג ליומן</p>
                </div>
              </div>
              <textarea 
                autoFocus 
                value={smartInput} 
                onChange={e => setSmartInput(e.target.value)} 
                placeholder="לדוגמה: פגישה עם יניב מחר ב-10 בבוקר במשרד" 
                className="w-full p-8 bg-slate-50 rounded-[32px] min-h-[180px] text-xl font-bold outline-none mb-10 focus:bg-white border-4 border-transparent focus:border-blue-100 transition-all placeholder:text-slate-300" 
              />
              <div className="flex gap-4">
                <button 
                  onClick={handleSmartSubmit} 
                  disabled={isSmartProcessing || !smartInput.trim()} 
                  className="flex-1 bg-slate-900 text-white py-6 rounded-[24px] font-black text-xl disabled:opacity-50 flex items-center justify-center gap-4 shadow-2xl shadow-slate-300 active:scale-95 transition-all"
                >
                  {isSmartProcessing ? <RefreshCw className="w-7 h-7 animate-spin" /> : <><Sparkles className="w-7 h-7" /> צור אירוע חכם</>}
                </button>
                <button onClick={() => setIsSmartInputOpen(false)} className="px-10 bg-slate-100 text-slate-600 rounded-[24px] font-black text-lg hover:bg-slate-200 transition-all">ביטול</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .fc { direction: rtl; font-family: inherit; border: none !important; }
        .fc .fc-toolbar-title { font-size: 1.5rem; font-weight: 900; color: #0f172a; }
        .fc .fc-button-primary { background: #f1f5f9; border: none; color: #475569; font-weight: 800; padding: 0.75rem 1.25rem; border-radius: 1rem; }
        .fc .fc-button-primary:hover { background: #e2e8f0; color: #0f172a; }
        .fc .fc-button-primary:not(:disabled).fc-button-active { background: #2563eb; color: white; }
        .fc .fc-daygrid-day-number { padding: 12px; font-weight: 700; color: #94a3b8; }
        .fc .fc-day-today { background: #eff6ff !important; }
        .fc .fc-day-today .fc-daygrid-day-number { color: #2563eb; font-size: 1.1rem; }
        .fc .fc-event { border-radius: 8px; padding: 4px 8px; font-weight: 700; border: none; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .fc-theme-standard td, .fc-theme-standard th { border-color: #f1f5f9; }
        .fc-scrollgrid { border: none !important; }
      `}</style>
    </div>
  );
}

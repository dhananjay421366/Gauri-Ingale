import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { io } from 'socket.io-client';
import { LayoutDashboard, Monitor, Building2, Bell, Settings, LogOut, Wifi, CircleUserRound, X, Check } from 'lucide-react';
import { api } from './lib/api';
import Dashboard from './pages/Dashboard';
import PCDetails from './pages/PCDetails';
import Admin from './pages/Admin';
import Login from './pages/Login';

const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/pcs', label: 'PC Monitor', icon: Monitor },
  { to: '/labs', label: 'Labs', icon: Building2 },
  { to: '/admin', label: 'Admin control', icon: Settings }
];

function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [toast, setToast] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    api.get('/dashboard').then(({ data }) => setAlerts(data.alerts || [])).catch(() => {});
    const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity
    });
    socket.on('alert:new', alert => {
      setAlerts(current => [alert, ...current.filter(item => item.id !== alert.id)].slice(0, 30));
      setToast(alert.message);
      setTimeout(() => setToast(null), 4500);
    });
    return () => socket.disconnect();
  }, []);

  const unread = alerts.filter(alert => !alert.isRead).length;
  const markRead = async alert => {
    try { await api.patch(`/alerts/${alert.id}/read`); } catch {}
    setAlerts(current => current.map(item => item.id === alert.id ? { ...item, isRead: true } : item));
  };
  const markAllRead = async () => {
    await Promise.all(alerts.filter(alert => !alert.isRead).map(alert => api.patch(`/alerts/${alert.id}/read`).catch(() => {})));
    setAlerts(current => current.map(alert => ({ ...alert, isRead: true })));
  };

  return <div className="min-h-screen bg-mist flex">
    <aside className="hidden lg:flex w-64 flex-col bg-ink text-white p-6">
      <div className="flex items-center gap-3 mb-12"><div className="w-10 h-10 bg-aqua rounded-xl grid place-items-center font-bold text-ink">IL</div><div><div className="font-bold tracking-widest">INFOLAB</div><div className="text-[10px] text-slate-400 uppercase tracking-[.2em]">Live operations</div></div></div>
      <div className="text-xs text-slate-500 uppercase tracking-widest mb-3">Workspace</div>
      <nav className="space-y-2">{nav.map(item => <Link key={item.to} to={item.to} className={`flex gap-3 items-center px-4 py-3 rounded-xl text-sm ${location.pathname === item.to ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}><item.icon size={18}/>{item.label}</Link>)}</nav>
      <div className="mt-auto p-4 rounded-2xl bg-white/5"><div className="text-xs text-slate-400">Signed in as</div><div className="font-semibold mt-1">{user.name || 'Administrator'}</div><button onClick={() => { localStorage.clear(); navigate('/login'); }} className="text-slate-400 hover:text-white text-sm mt-4 flex gap-2 items-center"><LogOut size={15}/> Sign out</button></div>
    </aside>
    <main className="flex-1 min-w-0"><header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-5 md:px-10"><div><div className="text-xs font-semibold text-aqua uppercase tracking-widest">Operations center</div><h1 className="text-xl font-bold">{location.pathname === '/admin' ? 'Admin control' : location.pathname.startsWith('/pcs/') ? 'Computer details' : `Good morning, ${user.name?.split(' ')[0] || 'Admin'}`}</h1></div><div className="flex items-center gap-4"><div className="relative"><button onClick={() => setShowNotifications(value => !value)} className="relative p-2 text-slate-500 hover:text-ink"><Bell size={20}/>{unread > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full grid place-items-center">{unread > 9 ? '9+' : unread}</span>}</button>{showNotifications && <div className="absolute right-0 top-12 z-30 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden"><div className="px-4 py-3 border-b flex justify-between items-center"><span className="font-bold">Notifications</span><button onClick={markAllRead} className="text-xs text-teal-600 flex items-center gap-1"><Check size={13}/> Mark all read</button></div><div className="max-h-80 overflow-auto">{alerts.length ? alerts.map(alert => <button key={alert.id} onClick={() => markRead(alert)} className={`w-full text-left px-4 py-3 border-b hover:bg-slate-50 ${alert.isRead ? 'opacity-60' : ''}`}><div className="flex justify-between gap-3"><span className="text-xs font-bold text-rose-600">{alert.severity}</span><span className="text-[10px] text-slate-400">{new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><div className="text-sm font-semibold mt-1">{alert.message}</div></button>) : <div className="p-8 text-center text-sm text-slate-400">You’re all caught up.</div>}</div></div>}</div><div className="w-9 h-9 rounded-full bg-teal-100 text-teal-700 grid place-items-center"><CircleUserRound size={18}/></div></div></header><div className="p-5 md:p-10 max-w-[1500px] mx-auto"><Outlet/></div></main>
    {toast && <div className="fixed bottom-6 right-6 z-40 bg-ink text-white rounded-xl px-5 py-4 shadow-soft flex items-center gap-3"><Wifi className="text-aqua" size={18}/><span className="text-sm">{toast}</span><button onClick={() => setToast(null)}><X size={15}/></button></div>}
  </div>;
}

const Protected = () => localStorage.getItem('accessToken') ? <Outlet/> : <Navigate to="/login" replace/>;
export default function App() { return <Routes><Route path="/login" element={<Login/>}/><Route element={<Protected/>}><Route element={<Layout/>}><Route index element={<Dashboard/>}/><Route path="/pcs" element={<Dashboard/>}/><Route path="/pcs/:id" element={<PCDetails/>}/><Route path="/labs" element={<Dashboard labsOnly/>}/><Route path="/admin" element={<Admin/>}/></Route></Route><Route path="*" element={<Navigate to="/"/>}/></Routes>; }

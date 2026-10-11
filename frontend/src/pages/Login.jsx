import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, LockKeyhole } from 'lucide-react';
import { api } from '../lib/api';

export default function Login() {
  const [signup, setSignup] = useState(false);
  const [form, setForm] = useState({ name: '', email: 'admin@infolab.dev', password: 'password123', confirmPassword: 'password123' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });
  const toggleMode = () => { setSignup((value) => !value); setError(''); setForm((value) => ({ ...value, name: '', confirmPassword: value.password })); };
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (signup && form.password !== form.confirmPassword) return setError('Passwords do not match');
    setLoading(true);
    try {
      const payload = signup ? { name: form.name, email: form.email, password: form.password } : { email: form.email, password: form.password };
      const { data } = await api.post(signup ? '/auth/signup' : '/auth/login', payload);
      localStorage.setItem('accessToken', data.accessToken); localStorage.setItem('refreshToken', data.refreshToken); localStorage.setItem('user', JSON.stringify(data.user)); nav('/');
    } catch (e) { setError(e.response?.data?.message || (signup ? 'Unable to create account' : 'Unable to sign in')); } finally { setLoading(false); }
  };
  const inputClass = 'mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-teal-200';
  return <div className="min-h-screen bg-ink flex items-center justify-center p-5"><div className="w-full max-w-5xl grid lg:grid-cols-2 bg-white rounded-3xl overflow-hidden shadow-2xl"><div className="hidden lg:flex bg-gradient-to-br from-teal-500 to-cyan-700 p-12 text-white flex-col justify-between"><div><div className="flex gap-3 items-center"><div className="w-11 h-11 rounded-xl bg-white/20 grid place-items-center font-bold">IL</div><span className="tracking-[.25em] font-bold">INFOLAB</span></div><h1 className="text-5xl font-bold leading-tight mt-24">Every lab.<br />One clear signal.</h1><p className="text-teal-50 mt-6 max-w-sm">Real-time visibility for the spaces where your best work happens.</p></div><div className="flex items-center gap-2 text-sm text-teal-50"><Activity size={17} /> Live systems monitoring</div></div><div className="p-8 md:p-14"><div className="lg:hidden flex items-center gap-2 font-bold mb-12 text-ink"><Activity className="text-aqua" /> INFOLAB</div><div className="max-w-sm mx-auto"><div className="text-sm font-semibold text-aqua uppercase tracking-widest">{signup ? 'Create your account' : 'Welcome back'}</div><h2 className="text-3xl font-bold mt-2">{signup ? 'Join your lab' : 'Sign in to your lab'}</h2><p className="text-slate-500 mt-2 mb-8">{signup ? 'Get started with live lab monitoring.' : 'Monitor your systems from one calm place.'}</p><form onSubmit={submit} className="space-y-5">{signup && <label className="block text-sm font-semibold">Full name<input type="text" required minLength="2" value={form.name} onChange={update('name')} className={inputClass} /></label>}<label className="block text-sm font-semibold">Work email<input type="email" required value={form.email} onChange={update('email')} className={inputClass} /></label><label className="block text-sm font-semibold">Password<div className="relative"><LockKeyhole size={17} className="absolute left-4 top-3.5 text-slate-400" /><input type="password" required minLength="6" value={form.password} onChange={update('password')} className={`${inputClass} px-11`} /></div></label>{signup && <label className="block text-sm font-semibold">Confirm password<input type="password" required minLength="6" value={form.confirmPassword} onChange={update('confirmPassword')} className={inputClass} /></label>}{error && <div className="text-sm text-rose-600 bg-rose-50 px-4 py-3 rounded-lg">{error}</div>}<button disabled={loading} className="w-full bg-ink text-white rounded-xl py-3.5 font-semibold flex justify-center gap-2 items-center hover:bg-slate-800 disabled:opacity-60">{loading ? (signup ? 'Creating account…' : 'Signing in…') : (signup ? 'Create account' : 'Continue')}<ArrowRight size={17} /></button></form>{!signup && <p className="text-xs text-slate-400 mt-8">Demo: admin@infolab.dev · password123</p>}<p className="text-sm text-center text-slate-500 mt-8">{signup ? 'Already have an account?' : 'Need an account?'} <button type="button" onClick={toggleMode} className="font-semibold text-teal-700 hover:text-teal-900">{signup ? 'Sign in' : 'Sign up'}</button></p></div></div></div></div>;
}

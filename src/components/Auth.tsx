import React from 'react';
import { signInWithPopup, googleProvider, auth } from '../firebase.ts';
import { Brain, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { motion } from 'motion/react';

export default function Auth() {
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-6 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-2xl shadow-neutral-200 border border-neutral-100 text-center"
      >
        <div className="w-20 h-20 bg-neutral-900 rounded-[1.5rem] flex items-center justify-center text-white mx-auto mb-8 shadow-xl shadow-neutral-200">
          <Brain size={40} />
        </div>
        
        <h1 className="text-4xl font-black tracking-tight text-neutral-900 mb-4 leading-tight">
          Mind & Money <br/>
          <span className="text-neutral-400">Bienestar</span>
        </h1>
        
        <p className="text-neutral-500 mb-10 text-lg font-medium leading-relaxed">
          Un espacio personal para ordenar mente, hábitos, objetivos, calendario y finanzas con ayuda de IA.
        </p>

        <div className="space-y-4 mb-10">
          <Feature icon={<ShieldCheck size={18} className="text-neutral-900" />} text="Acceso seguro con Google" />
          <Feature icon={<Target size={18} className="text-neutral-900" />} text="Objetivos, hábitos y finanzas conectados" />
          <Feature icon={<Sparkles size={18} className="text-neutral-900" />} text="IA para detectar patrones y desalineaciones" />
        </div>

        <button
          onClick={handleLogin}
          className="w-full bg-neutral-900 text-white py-5 px-8 rounded-2xl font-bold text-lg hover:bg-neutral-800 transition-all shadow-xl shadow-neutral-200 flex items-center justify-center gap-3 active:scale-95"
        >
          <img src="https://www.google.com/favicon.ico" alt="" className="w-5 h-5 bg-white rounded-full p-0.5" />
          Continuar con Google
        </button>
        
        <p className="mt-8 text-xs text-neutral-400 font-medium uppercase tracking-widest">
          Privado y seguro • Powered by Gemini
        </p>
      </motion.div>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode, text: string }) {
  return (
    <div className="flex items-center gap-3 text-neutral-600 font-medium text-sm bg-neutral-50 p-3 rounded-xl border border-neutral-100">
      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
        {icon}
      </div>
      {text}
    </div>
  );
}

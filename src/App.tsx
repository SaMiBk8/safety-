/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from './lib/firebase';

// Basic Login Component
const Login = () => {
  const { user, loading } = useAuth();
  
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen font-sans">Loading...</div>;
  if (user) return <Navigate to="/dashboard" />;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100"
      >
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg shadow-blue-200">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">SafeChild</h1>
        <p className="text-slate-500 mb-8 italic">Professional Child Safety & Educational Coordination</p>
        
        <button 
          onClick={handleLogin}
          className="w-full py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Sign in with Google
        </button>
      </motion.div>
    </div>
  );
};

import { SystemAdminDashboard } from './components/dashboards/SystemAdminDashboard';
import { SchoolAdminDashboard } from './components/dashboards/SchoolAdminDashboard';
import { TeacherDashboard } from './components/dashboards/TeacherDashboard';
import { ParentDashboard } from './components/dashboards/ParentDashboard';
import { ChildDashboard } from './components/dashboards/ChildDashboard';
import { VisitorDashboard } from './components/dashboards/VisitorDashboard';
import { VideoCall } from './components/VideoCall';
import { Sun, Moon } from 'lucide-react';

const Dashboard = () => {
  const { user, profile, loading, isAdmin, isSchoolAdmin, isTeacher, isParent, isChild, isVisitor } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [activeCall, setActiveCall] = useState<{ channel: string } | null>(null);
  
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  if (loading) return <div className="flex items-center justify-center min-h-screen font-sans text-slate-400 dark:bg-slate-950">Loading...</div>;
  if (!user) return <Navigate to="/" />;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-300">
      <nav className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-8 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-100 dark:shadow-none">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">SafeChild</span>
          </div>
          
          <div className="flex items-center gap-4 sm:gap-6">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-amber-400 rounded-xl transition-all"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <div className="text-right hidden sm:block">
              <div className="text-sm font-bold text-slate-900 dark:text-white">{user.displayName}</div>
              <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold capitalize">{profile?.role?.replace('_', ' ') || 'Guest'}</div>
            </div>
            
            <button 
              onClick={() => signOut(auth)}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
              title="Sign Out"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-8 py-8">
        {profile?.status === 'blocked' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 p-8 rounded-3xl text-center max-w-2xl mx-auto"
          >
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mb-4 mx-auto">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-red-900 dark:text-red-100 mb-2">Account Blocked</h2>
            <p className="text-red-700 dark:text-red-300">
              Your account has been blocked by a system administrator. Please contact support if you believe this is a mistake.
            </p>
          </motion.div>
        )}

        {profile?.status !== 'blocked' && isVisitor && <VisitorDashboard />}
        
        {profile?.status === 'active' && !isVisitor && (
          <>
            {isAdmin && <SystemAdminDashboard />}
            {isSchoolAdmin && <SchoolAdminDashboard />}
            {isTeacher && <TeacherDashboard />}
            {isParent && <ParentDashboard onStartCall={(channel) => setActiveCall({ channel })} />}
            {isChild && <ChildDashboard onStartCall={(channel) => setActiveCall({ channel })} />}
            
            {profile.role && !isAdmin && !isSchoolAdmin && !isTeacher && !isParent && !isChild && (
              <div className="text-center py-20">
                <h2 className="text-2xl font-bold text-slate-400">Dashboard for {profile.role} is coming soon...</h2>
              </div>
            )}
          </>
        )}
      </main>

      {activeCall && (
        <VideoCall 
          appId="YOUR_AGORA_APP_ID" // User needs to provide this
          channel={activeCall.channel}
          onClose={() => setActiveCall(null)}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </AnimatePresence>
      </Router>
    </AuthProvider>
  );
}

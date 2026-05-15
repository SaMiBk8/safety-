import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db, storage } from '../../lib/firebase';
import { doc, updateDoc, addDoc, collection, serverTimestamp, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Users, GraduationCap, MessageSquare, Send, FileText, Info, CheckCircle2, Clock, BookOpen, Activity, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { UserRole, School } from '../../types';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';

import { Chat } from '../Chat';
import { PrivateMessaging } from '../PrivateMessaging';

export const VisitorDashboard: React.FC = () => {
  const { user, profile, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'request' | 'messenger'>('request');
  const [unreadTotal, setUnreadTotal] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'messages'),
      where('receiverId', '==', user.uid),
      where('isRead', '==', false)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadTotal(snapshot.size);
    });
    return () => unsubscribe();
  }, [user?.uid]);
  const [requestedRole, setRequestedRole] = useState<UserRole | ''>('');
  const [roleCategory, setRoleCategory] = useState<'family' | 'professional'>('family');
  const [teacherType, setTeacherType] = useState<'standard' | 'quran' | 'sports'>('standard');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const snap = await getDocs(collection(db, 'schools'));
        setSchools(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as School)));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'schools', user);
      }
    };
    fetchSchools();

    const fetchAdmin = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'system_admin'));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setAdminUid(snap.docs[0].id);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'users', user);
      }
    };
    fetchAdmin();
  }, []);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !requestedRole) return;
    if (requestedRole === 'teacher' && teacherType === 'standard' && !subject.trim()) {
      setError('Please specify your subject');
      return;
    }

    if (selectedFile && selectedFile.size > 5 * 1024 * 1024) {
      setError('File is too large. Maximum size is 5MB.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    setUploadProgress(0);
    try {
      let fileUrl = null;
      if (selectedFile) {
        // Optimization: For small files (< 400KB), use data URL to bypass Storage stall risks
        if (selectedFile.size < 400 * 1024) {
          fileUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(selectedFile);
          });
        } else {
          const storageRef = ref(storage, `verification/${user.uid}/${Date.now()}_${selectedFile.name}`);
          
          fileUrl = await new Promise<string>((resolve, reject) => {
            const uploadTask = uploadBytesResumable(storageRef, selectedFile);
            
            let lastBytesTransferred = 0;
            let stallTimeout = setTimeout(() => {
              uploadTask.cancel();
              reject(new Error('Upload stalled. Please check your connection or try a smaller file.'));
            }, 120000); // 2 minute stall timeout

            uploadTask.on('state_changed', 
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(progress);
                
                if (snapshot.bytesTransferred > lastBytesTransferred) {
                  lastBytesTransferred = snapshot.bytesTransferred;
                  clearTimeout(stallTimeout);
                  stallTimeout = setTimeout(() => {
                    uploadTask.cancel();
                    reject(new Error('Upload stalled. Please check your connection.'));
                  }, 120000);
                }
              }, 
              (error: any) => {
                clearTimeout(stallTimeout);
                if (error.code === 'storage/retry-limit-exceeded') {
                  reject(new Error('The upload connection was lost multiple times. Please check your internet and try again.'));
                } else {
                  reject(error);
                }
              }, 
              async () => {
                clearTimeout(stallTimeout);
                try {
                  const url = await getDownloadURL(uploadTask.snapshot.ref);
                  resolve(url);
                } catch (err) {
                  reject(err);
                }
              }
            );
          });
        }
      }

      // Update profile with requested role
      await updateDoc(doc(db, 'users', user.uid), {
        requestedRole: requestedRole === 'teacher' 
          ? (teacherType === 'quran' ? 'quran_teacher' : teacherType === 'sports' ? 'sports_coach' : 'teacher')
          : requestedRole,
        subject: requestedRole === 'teacher' && teacherType === 'standard' ? subject : null,
        schoolId: selectedSchoolId || null,
        requestMessage: message,
        fileName: selectedFile?.name || null,
        fileUrl,
        updatedAt: serverTimestamp()
      });

      // Also send a message to admin
      await addDoc(collection(db, 'visitor_messages'), {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        requestedRole: requestedRole === 'teacher' 
          ? (teacherType === 'quran' ? 'quran_teacher' : teacherType === 'sports' ? 'sports_coach' : 'teacher')
          : requestedRole,
        subject: requestedRole === 'teacher' && teacherType === 'standard' ? subject : null,
        schoolId: selectedSchoolId || null,
        message,
        fileName: selectedFile?.name || null,
        fileUrl,
        createdAt: serverTimestamp(),
        status: 'unread'
      });

      setSubmitted(true);
      toast.success('Request sent successfully!');
    } catch (error: any) {
      console.error('Submission Error:', error);
      let errorMessage = 'Failed to submit request. Please try again.';
      
      if (error.message?.includes('Upload timed out')) {
        errorMessage = error.message;
      } else if (error.code === 'storage/retry-limit-exceeded') {
        errorMessage = 'The upload connection was lost. Please check your internet and try again.';
      } else if (error.code === 'storage/unauthorized') {
        errorMessage = 'You do not have permission to upload files.';
      } else if (error.code === 'storage/canceled') {
        errorMessage = 'Upload was canceled.';
      }

      setError(errorMessage);
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`, user);
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Visitor Portal</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Welcome to our school community</p>
        </div>
        <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-2xl shadow-inner">
          <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
      </header>

      <div className="flex gap-4 border-b border-slate-100 dark:border-slate-800 overflow-x-auto whitespace-nowrap pb-px scrollbar-hide">
        <button 
          onClick={() => setActiveTab('request')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative shrink-0 ${
            activeTab === 'request' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Role Request
          {activeTab === 'request' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('messenger')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative flex items-center gap-2 shrink-0 ${
            activeTab === 'messenger' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Private Chat
          {unreadTotal > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full animate-bounce">
              {unreadTotal}
            </span>
          )}
          {activeTab === 'messenger' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
      </div>

      {activeTab === 'messenger' ? (
        <PrivateMessaging />
      ) : (
        <>
          {/* Pending Setup Notification */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-6 rounded-3xl flex gap-4"
      >
        <div className="w-12 h-12 bg-amber-100 dark:bg-amber-800 rounded-2xl flex items-center justify-center shrink-0">
          <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h3 className="font-bold text-amber-900 dark:text-amber-100">Account Pending Setup</h3>
          <p className="text-amber-700 dark:text-amber-300 text-sm mt-1">
            Welcome to SafeChild! Your account is currently in the review queue. An administrator needs to assign your role before you can access the dashboard.
          </p>
          <div className="mt-4">
            <button 
              onClick={refreshProfile}
              className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700 transition-all shadow-lg shadow-amber-200 dark:shadow-none"
            >
              Check Admin Status
            </button>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* App Info Section */}
        <section className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm space-y-6">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-600" />
              What is SafeChild?
            </h2>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              SafeChild is a comprehensive safety and educational management platform designed to connect parents, teachers, and school administrators to ensure the well-being of students.
            </p>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center shrink-0">
                  <Info className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">Real-time Tracking</h4>
                  <p className="text-xs text-slate-500">Parents can monitor their child's location in real-time.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center shrink-0">
                  <GraduationCap className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">Academic Progress</h4>
                  <p className="text-xs text-slate-500">Track grades, attendance, and homework submissions.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-red-50 dark:bg-red-900/30 rounded-lg flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">SOS Emergency</h4>
                  <p className="text-xs text-slate-500">Instant alerts for immediate assistance in case of danger.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Request Access Section */}
        <section className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
            {!submitted ? (
              <form onSubmit={handleSubmitRequest} className="space-y-6">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Request Access</h3>
                <p className="text-sm text-slate-500">Choose your role and tell us a bit about yourself.</p>
                
                <div className="space-y-6">
                  <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                    <button
                      type="button"
                      onClick={() => {
                        setRoleCategory('family');
                        setRequestedRole('');
                      }}
                      className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                        roleCategory === 'family' 
                          ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' 
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Family & Student
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRoleCategory('professional');
                        setRequestedRole('');
                      }}
                      className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                        roleCategory === 'professional' 
                          ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' 
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Staff & Admin
                    </button>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      {roleCategory === 'family' ? 'Select Family Role' : 'Select Professional Role'}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {roleCategory === 'family' ? (
                        <>
                          {[
                            { id: 'parent', label: 'Parent', icon: Users, desc: 'Monitor your children' },
                            { id: 'child', label: 'Student', icon: GraduationCap, desc: 'Access your classes' },
                          ].map((role) => (
                            <button
                              key={role.id}
                              type="button"
                              onClick={() => {
                                setRequestedRole(role.id as UserRole);
                                setError(null);
                              }}
                              className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center text-center gap-3 group relative overflow-hidden ${
                                requestedRole === role.id 
                                  ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-200 dark:shadow-none' 
                                  : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-blue-200 dark:hover:border-blue-900'
                              }`}
                            >
                              <div className={`p-3 rounded-2xl transition-colors ${
                                requestedRole === role.id ? 'bg-white/20' : 'bg-slate-50 dark:bg-slate-900 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30'
                              }`}>
                                <role.icon className={`w-6 h-6 ${requestedRole === role.id ? 'text-white' : 'text-blue-600'}`} />
                              </div>
                              <div>
                                <span className="block text-xs font-black uppercase tracking-wider">{role.label}</span>
                                <span className={`text-[10px] mt-1 block opacity-60 font-medium ${requestedRole === role.id ? 'text-white' : 'text-slate-500'}`}>
                                  {role.desc}
                                </span>
                              </div>
                            </button>
                          ))}
                        </>
                      ) : (
                        <>
                          {[
                            { id: 'teacher', label: 'Teacher', icon: GraduationCap, desc: 'Quran, Sports, or Academic' },
                            { id: 'staff', label: 'Staff', icon: Users, desc: 'School logistics & Admin' },
                            { id: 'authorized_person', label: 'Authorized', icon: UserCheck, desc: 'Pickup authorization' },
                            { id: 'system_admin', label: 'Admin', icon: Shield, desc: 'System management' },
                          ].map((role) => (
                            <button
                              key={role.id}
                              type="button"
                              onClick={() => {
                                setRequestedRole(role.id as UserRole);
                                setError(null);
                              }}
                              className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center text-center gap-3 group relative overflow-hidden ${
                                requestedRole === role.id 
                                  ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-200 dark:shadow-none' 
                                  : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-blue-200 dark:hover:border-blue-900'
                              }`}
                            >
                              <div className={`p-3 rounded-2xl transition-colors ${
                                requestedRole === role.id ? 'bg-white/20' : 'bg-slate-50 dark:bg-slate-900 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30'
                              }`}>
                                <role.icon className={`w-6 h-6 ${requestedRole === role.id ? 'text-white' : 'text-blue-600'}`} />
                              </div>
                              <div>
                                <span className="block text-xs font-black uppercase tracking-wider">{role.label}</span>
                                <span className={`text-[10px] mt-1 block opacity-60 font-medium ${requestedRole === role.id ? 'text-white' : 'text-slate-500'}`}>
                                  {role.desc}
                                </span>
                              </div>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {requestedRole === 'teacher' && (
                    <motion.div 
                      key="teacher-options"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="p-6 bg-slate-50 dark:bg-slate-950 rounded-[2rem] border border-slate-100 dark:border-slate-800 space-y-6"
                    >
                      <div className="space-y-4">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Specialization</label>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { id: 'standard', label: 'Subject', icon: FileText, color: 'blue' },
                            { id: 'quran', label: 'Quran', icon: BookOpen, color: 'emerald' },
                            { id: 'sports', label: 'Sports', icon: Activity, color: 'orange' },
                          ].map((type) => (
                            <button
                              key={type.id}
                              type="button"
                              onClick={() => {
                                setTeacherType(type.id as any);
                                setError(null);
                              }}
                              className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                                teacherType === type.id 
                                  ? `bg-white dark:bg-slate-900 border-blue-500 text-blue-600 shadow-lg` 
                                  : 'bg-white dark:bg-slate-900 border-transparent text-slate-500 dark:text-slate-400 hover:border-slate-200 dark:hover:border-slate-700'
                              }`}
                            >
                              <type.icon className="w-5 h-5" />
                              <span className="text-[10px] font-black uppercase tracking-tight">{type.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {teacherType === 'standard' && (
                        <motion.div 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="space-y-3"
                        >
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Which Subject do you teach?</label>
                          <div className="relative">
                            <input 
                              type="text"
                              value={subject}
                              onChange={(e) => {
                                setSubject(e.target.value);
                                if (error) setError(null);
                              }}
                              placeholder="e.g. Mathematics, English, History..."
                              className={`w-full px-6 py-4 bg-white dark:bg-slate-900 border-2 rounded-2xl outline-none transition-all font-bold text-slate-900 dark:text-white ${
                                error ? 'border-red-500 focus:border-red-500' : 'border-transparent focus:border-blue-500'
                              }`}
                            />
                            <FileText className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                          </div>
                          {error && <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider ml-2">{error}</p>}
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-3">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Select School (Optional)</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                    value={selectedSchoolId}
                    onChange={(e) => setSelectedSchoolId(e.target.value)}
                  >
                    <option value="">Select a school...</option>
                    {schools.map(school => (
                      <option key={school.id} value={school.id}>{school.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Message to Admin</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Provide your school ID or any other information..."
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white min-h-[100px]"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Upload Verification (Optional)</label>
                  <input 
                    type="file" 
                    id="file-upload" 
                    className="hidden" 
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                  <label 
                    htmlFor="file-upload"
                    className={`p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all block ${
                      selectedFile 
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' 
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {selectedFile ? (
                      <>
                        <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                        <p className="text-xs text-emerald-600 font-bold">{selectedFile.name}</p>
                        <p className="text-[10px] text-emerald-500 mt-1">Click to change file</p>
                      </>
                    ) : (
                      <>
                        <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                        <p className="text-xs text-slate-400">Click to upload ID or documents</p>
                      </>
                    )}
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !requestedRole}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 flex flex-col items-center justify-center gap-1 shadow-xl shadow-blue-100 dark:shadow-none"
                >
                  <div className="flex items-center gap-2">
                    {isSubmitting ? 'Sending...' : 'Send Request'}
                    <Send className="w-4 h-4" />
                  </div>
                  {uploadProgress !== null && uploadProgress < 100 && (
                    <div className="w-full max-w-[200px] h-1 bg-white/20 rounded-full mt-1 overflow-hidden">
                      <div 
                        className="h-full bg-white transition-all duration-300" 
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  )}
                </button>
              </form>
            ) : (
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center py-12 space-y-4"
              >
                <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Request Sent!</h3>
                <p className="text-slate-500 text-sm max-w-[250px] mx-auto">
                  Your information has been sent to the administrator. We will review it and assign your role shortly.
                </p>
                <button 
                  onClick={() => setSubmitted(false)}
                  className="text-blue-600 font-bold text-sm hover:underline"
                >
                  Update Request
                </button>
              </motion.div>
            )}
          </div>
        </section>
      </div>

      {/* Admin Chat Section */}
      <section className="bg-slate-900 dark:bg-slate-950 p-8 rounded-[2.5rem] text-white shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold">Live Support</h3>
              <p className="text-[10px] text-slate-400">Chat with a system administrator</p>
            </div>
          </div>
          <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full uppercase tracking-wider">Online</span>
        </div>
        
        <div className="h-[300px] bg-white/5 rounded-3xl overflow-hidden mb-4">
          {adminUid ? (
            <Chat receiverId={adminUid} receiverName="System Admin" />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 italic text-sm">
              Connecting to support...
            </div>
          )}
        </div>
      </section>
        </>
      )}
    </div>
  );
};

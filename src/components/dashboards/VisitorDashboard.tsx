import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db, storage } from '../../lib/firebase';
import { doc, updateDoc, addDoc, collection, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Users, GraduationCap, MessageSquare, Send, FileText, Info, CheckCircle2, Clock } from 'lucide-react';
import { UserRole, School } from '../../types';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';

import { Chat } from '../Chat';

export const VisitorDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const [requestedRole, setRequestedRole] = useState<UserRole | ''>('');
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');

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

    setIsSubmitting(true);
    try {
      let fileUrl = null;
      if (selectedFile) {
        const storageRef = ref(storage, `verification/${user.uid}/${selectedFile.name}`);
        const snapshot = await uploadBytes(storageRef, selectedFile);
        fileUrl = await getDownloadURL(snapshot.ref);
      }

      // Update profile with requested role
      await updateDoc(doc(db, 'users', user.uid), {
        requestedRole,
        schoolId: selectedSchoolId || null,
        requestMessage: message,
        updatedAt: serverTimestamp()
      });

      // Also send a message to admin
      await addDoc(collection(db, 'visitor_messages'), {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        requestedRole,
        schoolId: selectedSchoolId || null,
        message,
        fileName: selectedFile?.name || null,
        fileUrl,
        createdAt: serverTimestamp(),
        status: 'unread'
      });

      setSubmitted(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`, user);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
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
                
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">I am a...</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'teacher', label: 'Teacher', icon: GraduationCap },
                      { id: 'parent', label: 'Parent', icon: Users },
                      { id: 'child', label: 'Student', icon: GraduationCap },
                    ].map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => setRequestedRole(role.id as UserRole)}
                        className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${
                          requestedRole === role.id 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-none' 
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-blue-300'
                        }`}
                      >
                        <role.icon className="w-6 h-6" />
                        <span className="text-[10px] font-bold uppercase">{role.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

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
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl shadow-blue-100 dark:shadow-none"
                >
                  {isSubmitting ? 'Sending...' : 'Send Request'}
                  <Send className="w-4 h-4" />
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
    </div>
  );
};

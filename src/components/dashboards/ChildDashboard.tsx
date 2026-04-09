import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDocs, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Student, SOSAlert, Announcement } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, MapPin, Calendar, BookOpen, Clock, X, CheckCircle2, Send, FileText, Megaphone, MessageSquare } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';

import { Chat } from '../Chat';
import { ContactList } from '../ContactList';
import { FeedbackModal } from '../FeedbackModal';

export const ChildDashboard: React.FC<{ onStartCall?: (channel: string, receiverId: string, receiverName: string) => void }> = ({ onStartCall }) => {
  const { profile, user } = useAuth();
  const [studentData, setStudentData] = useState<Student | null>(null);
  const [isSOSActive, setIsSOSActive] = useState(false);
  const [activeModal, setActiveModal] = useState<'homework' | 'messenger' | 'feedback' | null>(null);
  const [selectedContactForFeedback, setSelectedContactForFeedback] = useState<{ uid: string, name: string } | null>(null);
  const [selectedContact, setSelectedContact] = useState<{ uid: string, displayName: string } | null>(null);
  const [homeworkTitle, setHomeworkTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teacherProfile, setTeacherProfile] = useState<{ uid: string, name: string } | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!studentData?.schoolId) return;
    const q = query(collection(db, 'announcements'), where('schoolId', '==', studentData.schoolId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'announcements', user || undefined);
    });
    return () => unsubscribe();
  }, [studentData?.schoolId]);

  useEffect(() => {
    const fetchTeacher = async () => {
      if (studentData?.teacherId) {
        try {
          const teacherDoc = await getDoc(doc(db, 'users', studentData.teacherId));
          if (teacherDoc.exists()) {
            const data = teacherDoc.data();
            setTeacherProfile({ uid: teacherDoc.id, name: data.displayName || 'Teacher' });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${studentData.teacherId}`, user);
        }
      }
    };
    fetchTeacher();
  }, [studentData]);

  // 1. Fetch student record and update location periodically
  useEffect(() => {
    if (!user?.uid) return;

    const q = query(collection(db, 'students'), where('childUid', '==', user.uid));
    const unsubscribeStudent = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setStudentData({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Student);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students', user || undefined);
    });

    // Use real GPS if available, otherwise fallback to simulation
    const updateLocation = (lat: number, lng: number) => {
      if (studentData?.id) {
        updateDoc(doc(db, 'students', studentData.id), {
          location: {
            lat,
            lng,
            lastUpdated: serverTimestamp()
          }
        }).catch(err => console.error("Location Update Error:", err));
      }
    };

    let watchId: number;

    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          updateLocation(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.error("GPS Error:", error);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      const interval = setInterval(() => {
        const newLat = 34.0522 + (Math.random() - 0.5) * 0.01;
        const newLng = -118.2437 + (Math.random() - 0.5) * 0.01;
        updateLocation(newLat, newLng);
      }, 10000);
      return () => {
        unsubscribeStudent();
        clearInterval(interval);
      };
    }

    return () => {
      unsubscribeStudent();
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [user?.uid, studentData?.id]);

  const triggerSOS = async () => {
    if (!studentData || isSOSActive) return;

    setIsSOSActive(true);
    try {
      await addDoc(collection(db, 'sos_alerts'), {
        childUid: user?.uid,
        parentUid: studentData.parentUid,
        location: studentData.location || { lat: 34.0522, lng: -118.2437 },
        status: 'active',
        createdAt: serverTimestamp()
      });
      
      if (onStartCall) {
        onStartCall(`sos_${user?.uid}`, studentData.parentUid, 'Parent');
      }

      setTimeout(() => setIsSOSActive(false), 5000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'sos_alerts', user);
      setIsSOSActive(false);
    }
  };

  const handleHomeworkSubmit = async () => {
    if (!homeworkTitle || !studentData?.id) {
      console.error("Cannot submit homework: studentData or homeworkTitle missing", { homeworkTitle, studentData });
      return;
    }
    setIsSubmitting(true);
    try {
      let fileUrl = null;
      if (selectedFile) {
        const storageRef = ref(storage, `homework/${user?.uid}/${Date.now()}_${selectedFile.name}`);
        const snapshot = await uploadBytes(storageRef, selectedFile);
        fileUrl = await getDownloadURL(snapshot.ref);
      }

      await addDoc(collection(db, 'homework_submissions'), {
        studentId: studentData.id,
        schoolId: studentData.schoolId,
        childUid: user?.uid || '',
        title: homeworkTitle,
        fileName: selectedFile?.name || null,
        fileUrl,
        submittedAt: serverTimestamp(),
        status: 'pending'
      });
      setHomeworkTitle('');
      setSelectedFile(null);
      setActiveModal(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'homework_submissions', user || undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Hello, {user?.displayName}!</h2>
          <p className="text-slate-500 dark:text-slate-400">Stay safe and have a great day at school.</p>
        </div>
        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center">
          <MapPin className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <button 
          onClick={() => setActiveModal('messenger')}
          className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center hover:bg-purple-200 transition-colors"
        >
          <Send className="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </button>
      </header>

      {announcements.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-600 text-white p-6 rounded-[2.5rem] shadow-xl shadow-blue-100 dark:shadow-none"
        >
          <div className="flex items-center gap-2 mb-3">
            <Megaphone className="w-5 h-5" />
            <span className="text-xs font-black uppercase tracking-widest">School Announcement</span>
          </div>
          <h3 className="text-lg font-black mb-1">{announcements[0].title}</h3>
          <p className="text-blue-100 text-sm">{announcements[0].content}</p>
        </motion.div>
      )}

      {/* SOS Button Section */}
      <section className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-xl text-center space-y-6">
        <div className="flex flex-col items-center">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={triggerSOS}
            className={`w-32 h-32 rounded-full flex items-center justify-center shadow-2xl transition-all ${
              isSOSActive ? 'bg-red-600 animate-pulse' : 'bg-red-500 hover:bg-red-600 shadow-red-200 dark:shadow-none'
            }`}
          >
            <ShieldAlert className="w-16 h-16 text-white" />
          </motion.button>
          <h3 className="mt-6 text-xl font-black text-slate-900 dark:text-white uppercase tracking-widest">SOS Emergency</h3>
          <p className="text-slate-400 dark:text-slate-500 text-sm max-w-[200px] mx-auto mt-2">
            Press and hold in case of danger. Your parents will be notified immediately.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Schedule Card */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Today's Schedule
            </h3>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-lg">Monday</span>
          </div>
          
          <div className="space-y-3">
            {[
              { time: '08:00', subject: 'Mathematics', room: 'Room 102' },
              { time: '10:00', subject: 'Science', room: 'Lab A' },
              { time: '12:00', subject: 'Lunch Break', room: 'Cafeteria' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="text-xs font-bold text-slate-400 dark:text-slate-500 w-10">{item.time}</div>
                <div>
                  <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">{item.subject}</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500">{item.room}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Homework Card */}
        <div className="bg-slate-900 dark:bg-slate-950 p-6 rounded-3xl text-white shadow-xl space-y-4">
          <h3 className="font-bold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-400" />
            My Homework
          </h3>
          <div className="space-y-3">
            <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between">
              <div>
                <div className="font-bold text-sm">History Essay</div>
                <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3" /> Due Tomorrow
                </div>
              </div>
              <button 
                onClick={() => setActiveModal('homework')}
                className="px-3 py-1 bg-blue-600 rounded-lg text-[10px] font-bold hover:bg-blue-700 transition-colors"
              >
                Submit
              </button>
            </div>
            <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between opacity-50">
              <div>
                <div className="font-bold text-sm">Math Exercises</div>
                <div className="text-[10px] text-emerald-400 flex items-center gap-1 mt-1">
                  Completed
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {activeModal === 'homework' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveModal(null)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">Submit Homework</h3>
                  <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-500 mb-2">Homework Title / Description</label>
                    <textarea 
                      placeholder="What are you submitting?"
                      className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none dark:text-white min-h-[120px]"
                      value={homeworkTitle}
                      onChange={(e) => setHomeworkTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-500 mb-2">Upload Files (Optional)</label>
                    <input 
                      type="file" 
                      id="homework-upload" 
                      className="hidden" 
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    />
                    <label 
                      htmlFor="homework-upload"
                      className={`p-6 border-2 border-dashed rounded-3xl text-center cursor-pointer transition-all block ${
                        selectedFile 
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' 
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {selectedFile ? (
                        <>
                          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                          <p className="text-xs text-emerald-600 font-bold">{selectedFile.name}</p>
                        </>
                      ) : (
                        <>
                          <Send className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                          <p className="text-xs text-slate-400">Click to upload files or drag and drop</p>
                        </>
                      )}
                    </label>
                  </div>
                  <button 
                    onClick={handleHomeworkSubmit}
                    disabled={!homeworkTitle || isSubmitting}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5" />
                    )}
                    {isSubmitting ? 'Submitting...' : 'Submit to Teacher'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
        {activeModal === 'messenger' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveModal(null)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white dark:bg-slate-900 w-full max-w-4xl h-[80vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row"
            >
              <div className="w-full md:w-80 border-r border-slate-100 dark:border-slate-800 flex flex-col">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">Contacts</h3>
                  <button onClick={() => setActiveModal(null)} className="md:hidden p-2">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <ContactList 
                    onSelect={(c) => setSelectedContact({ uid: c.uid, displayName: c.displayName })} 
                    selectedId={selectedContact?.uid} 
                  />
                </div>
                <div className="p-4 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => {
                      if (selectedContact) {
                        setSelectedContactForFeedback({ uid: selectedContact.uid, name: selectedContact.displayName });
                        setActiveModal('feedback');
                      }
                    }}
                    disabled={!selectedContact}
                    className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Give Feedback
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950/50">
                {selectedContact ? (
                  <>
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center">
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white">{selectedContact.displayName}</h4>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Active Chat</p>
                      </div>
                      <button onClick={() => setActiveModal(null)} className="hidden md:block p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <X className="w-6 h-6 text-slate-400" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <Chat receiverId={selectedContact.uid} receiverName={selectedContact.displayName} />
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                    <div className="w-16 h-16 bg-white dark:bg-slate-900 rounded-3xl shadow-sm flex items-center justify-center mb-4">
                      <MessageSquare className="w-8 h-8 text-slate-200" />
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white mb-2">Select a Contact</h4>
                    <p className="text-sm text-slate-500 max-w-xs">Choose your teacher from the list to start messaging.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <FeedbackModal 
        isOpen={activeModal === 'feedback'}
        onClose={() => setActiveModal(null)}
        toUid={selectedContactForFeedback?.uid || ''}
        toName={selectedContactForFeedback?.name || ''}
      />
    </div>
  );
};

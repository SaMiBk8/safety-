import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db, storage } from '../../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, getDoc, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { 
  ShieldAlert, 
  BookOpen, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  Send, 
  Star, 
  Activity, 
  Megaphone,
  X,
  FileText,
  MessageSquare,
  Search,
  Plus,
  ArrowLeft,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { PrivateMessaging } from '../PrivateMessaging';
import { Chat } from '../Chat';

import { UserProfile } from '../../types';

interface Student {
  id: string;
  name: string;
  schoolId: string;
  parentUid: string;
  childUid: string;
  teacherIds: string[];
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  schoolId: string;
}

import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';

export const ChildDashboard: React.FC<{ onStartCall?: (channel: string, receiverId: string, receiverName: string) => void }> = ({ onStartCall }) => {
  const { profile, user } = useAuth();
  const [studentData, setStudentData] = useState<Student | null>(null);
  const [isSOSActive, setIsSOSActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'messages'>('home');
  const [activeModal, setActiveModal] = useState<'homework' | 'sos' | 'detail' | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [selectedDetail, setSelectedDetail] = useState<any>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<{ uid: string, displayName: string } | null>(null);
  const [schoolTeachers, setSchoolTeachers] = useState<any[]>([]);
  const [homeworkTitle, setHomeworkTitle] = useState('');
  const [homeworkDescription, setHomeworkDescription] = useState('');
  const [homeworkExternalLink, setHomeworkExternalLink] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [teacherProfiles, setTeacherProfiles] = useState<{ uid: string, name: string, role: string }[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [quranProgress, setQuranProgress] = useState<any[]>([]);
  const [sportsTraining, setSportsTraining] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);

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

  useEffect(() => {
    if (!profile?.schoolId) return;
    const q = query(
      collection(db, 'users'),
      where('schoolId', '==', profile.schoolId),
      where('role', 'in', ['teacher', 'quran_teacher', 'sports_coach'])
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSchoolTeachers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [profile?.schoolId]);

  useEffect(() => {
    if (!studentData?.schoolId) return;
    const q = query(collection(db, 'announcements'), where('schoolId', '==', studentData.schoolId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement)));
    });
    return () => unsubscribe();
  }, [studentData?.schoolId]);

  useEffect(() => {
    const fetchTeachers = async () => {
      const ids = studentData?.teacherIds || [];
      if (ids.length > 0) {
        try {
          const teacherDocs = await Promise.all(
            ids.map(id => getDoc(doc(db, 'users', id)))
          );
          const profiles = teacherDocs
            .filter(d => d.exists())
            .map(d => {
              const data = d.data();
              return { 
                uid: d.id, 
                name: data?.displayName || 'Teacher',
                role: data?.role || 'teacher'
              };
            });
          setTeacherProfiles(profiles);
        } catch (error) {
          console.error("Error fetching teachers:", error);
        }
      }
    };
    fetchTeachers();
  }, [studentData?.teacherIds]);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'students'), where('childUid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setStudentData({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Student);
      }
    });
    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!studentData?.id) return;

    const unsubAssignments = onSnapshot(
      query(collection(db, 'assignments'), where('schoolId', '==', studentData.schoolId)),
      (snapshot) => setAssignments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    );

    const unsubQuran = onSnapshot(
      query(collection(db, 'quran_progress'), where('studentId', '==', studentData.id)),
      (snapshot) => setQuranProgress(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    );

    const unsubSports = onSnapshot(
      query(collection(db, 'sports_training'), where('studentId', '==', studentData.id)),
      (snapshot) => setSportsTraining(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    );

    const unsubSchedules = onSnapshot(
      query(collection(db, 'schedules'), where('schoolId', '==', studentData.schoolId)),
      (snapshot) => setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    );

    return () => {
      unsubAssignments();
      unsubQuran();
      unsubSports();
      unsubSchedules();
    };
  }, [studentData?.id]);

  const formatDate = (val: any) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val && typeof val === 'object' && 'seconds' in val) {
      try {
        return new Date(val.seconds * 1000).toLocaleString();
      } catch (e) {
        return 'Invalid Date';
      }
    }
    return String(val);
  };

  const triggerSOS = async () => {
    if (!user?.uid || !studentData?.parentUid) return;
    setIsSOSActive(true);
    toast.error("SOS Triggered! Notifying parents...");
    setTimeout(() => setIsSOSActive(false), 10000);
  };

  const handleHomeworkSubmit = async () => {
    if (isSubmitting) return;
    if (!studentData) {
      toast.error("Student profile not loaded yet. Please wait a moment.");
      return;
    }
    if (!homeworkTitle) {
      toast.error("Please provide a title for your homework.");
      return;
    }
    if (!selectedTeacherId && !homeworkExternalLink) {
      toast.error("Please select a teacher or provide an external link.");
      return;
    }

    setIsSubmitting(true);
    const submissionToast = toast.loading("Submitting homework...");

    try {
      let fileUrl = homeworkExternalLink || null;
      let fileName = selectedFile?.name || (homeworkExternalLink ? "External Link" : null);

      if (selectedFile) {
        // Files > 64KB should use Storage for reliability
        if (selectedFile.size < 64 * 1024) {
          const reader = new FileReader();
          fileUrl = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(selectedFile);
          });
        } else {
          const storageRef = ref(storage, `homework/${user.uid}/${Date.now()}_${selectedFile.name}`);
          const uploadTask = uploadBytesResumable(storageRef, selectedFile);
          
          fileUrl = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              uploadTask.cancel();
              reject(new Error("Upload timed out (> 5 mins). Please check your connection."));
            }, 300000);

            uploadTask.on('state_changed', 
              (snap) => {
                const progress = (snap.bytesTransferred / snap.totalBytes) * 100;
                setUploadProgress(progress);
              },
              (err) => {
                clearTimeout(timeout);
                reject(err);
              },
              async () => {
                clearTimeout(timeout);
                resolve(await getDownloadURL(uploadTask.snapshot.ref));
              }
            );
          });
        }
      }

      const teacher = teacherProfiles.find(t => t.uid === selectedTeacherId);
      await addDoc(collection(db, 'homework_submissions'), {
        studentId: studentData.id,
        studentName: studentData.name || profile?.displayName || 'Student',
        schoolId: studentData.schoolId || '',
        childUid: user.uid,
        teacherId: selectedTeacherId || null,
        teacherName: teacher?.name || (homeworkExternalLink ? "Submission Link" : 'Teacher'),
        title: homeworkTitle,
        description: homeworkDescription,
        fileName,
        fileUrl,
        submittedAt: serverTimestamp(),
        status: 'submitted'
      });

      setHomeworkTitle('');
      setHomeworkDescription('');
      setHomeworkExternalLink('');
      setSelectedFile(null);
      setUploadProgress(null);
      setActiveModal(null);
      toast.success("Homework submitted successfully!", { id: submissionToast });
    } catch (error: any) {
      console.error("Submission error:", error);
      toast.error(error.message || "Failed to submit homework.", { id: submissionToast });
      handleFirestoreError(error, OperationType.CREATE, 'homework_submissions', user || undefined);
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-10 pb-32">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white">
            Hello, <span className="text-blue-600">{profile?.displayName?.split(' ')[0] || 'Student'}</span>! 👋
          </h1>
          <p className="text-slate-500 font-medium mt-1">Ready for another great day of learning?</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveTab('home')}
            className={`px-6 py-3 rounded-2xl font-black text-sm transition-all ${activeTab === 'home' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-none' : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('messages')}
            className={`px-6 py-3 rounded-2xl font-black text-sm transition-all relative ${activeTab === 'messages' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-none' : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            Messages
            {unreadTotal > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white dark:border-slate-900 font-bold">
                {unreadTotal}
              </span>
            )}
          </button>
        </div>
      </header>

      {activeTab === 'messages' ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <PrivateMessaging />
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
          <section className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-2xl text-center space-y-8">
            <div className="flex flex-col items-center">
              <div className="relative">
                <AnimatePresence>
                  {isSOSActive && <motion.div animate={{ scale: 2, opacity: 0 }} transition={{ repeat: Infinity, duration: 1.5 }} className="absolute inset-0 bg-red-500 rounded-full" />}
                </AnimatePresence>
                <motion.button onClick={triggerSOS} className={`w-36 h-36 rounded-full flex items-center justify-center relative z-10 ${isSOSActive ? 'bg-red-600' : 'bg-red-500'}`}>
                  <ShieldAlert className="w-16 h-16 text-white" />
                </motion.button>
              </div>
              <h3 className="mt-8 text-2xl font-black tracking-widest uppercase text-slate-900 dark:text-white">SOS Emergency</h3>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-blue-600 p-8 rounded-[2.5rem] text-white shadow-2xl space-y-6">
              <div className="flex items-center gap-3">
                <Calendar className="w-6 h-6" />
                <h3 className="font-black text-xl uppercase tracking-tighter">My Schedule</h3>
              </div>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
                  const daySchedules = schedules.filter(s => s.day === day).sort((a,b) => a.startTime.localeCompare(b.startTime));
                  if (daySchedules.length === 0) return null;
                  return (
                    <div key={day} className="space-y-2">
                      <div className="text-[10px] font-black text-blue-200 uppercase tracking-widest ml-1">{day}</div>
                      {daySchedules.map(sch => (
                        <div key={sch.id} className="flex items-center justify-between p-4 bg-white/10 rounded-2xl border border-white/10">
                          <div className="flex flex-col">
                            <span className="font-bold leading-tight">{sch.subject}</span>
                            <span className="text-[10px] text-blue-100">{sch.teacherName || 'TBD'}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-lg whitespace-nowrap">
                              {sch.startTime} - {sch.endTime}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {schedules.length === 0 && (
                  <div className="p-10 text-center text-blue-100 italic text-sm border-2 border-dashed border-white/20 rounded-3xl">
                    No schedule entries found.
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black flex items-center gap-3"><BookOpen className="text-blue-400" /> Assignments</h3>
                <button onClick={() => setActiveModal('homework')} className="bg-blue-600 px-6 py-3 rounded-2xl font-black text-sm">Submit Work</button>
              </div>
              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                {assignments.length > 0 ? assignments.map(a => (
                  <div key={a.id} className="p-6 bg-white/5 rounded-3xl border border-white/10 group hover:bg-white/10 transition-colors">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <div className="font-black text-lg">{a.title}</div>
                        <p className="text-sm text-slate-400 mt-2 line-clamp-2">{a.description}</p>
                        {a.fileUrl && (
                          <div className="mt-4">
                            <a 
                              href={a.fileUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 text-blue-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600/40 transition-all border border-blue-600/30"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <FileText className="w-3.5 h-3.5" />
                              View Material
                            </a>
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => {
                          setSelectedDetail({ ...a, type: 'assignment' });
                          setActiveModal('detail');
                        }}
                        className="p-3 bg-white/10 rounded-2xl hover:bg-blue-600 transition-colors flex items-center gap-2 group-hover:scale-105"
                      >
                        <Info className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase">Details</span>
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-10 text-slate-500 italic">No assignments yet</div>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl space-y-6">
              <h3 className="text-lg font-black flex items-center gap-3 text-slate-900 dark:text-white">
                <Calendar className="text-blue-600" /> Quran Progress
              </h3>
              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                {quranProgress.length > 0 ? quranProgress.map(p => (
                  <div key={p.id} className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl flex justify-between items-center group hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <div>
                      <div className="font-black text-sm text-slate-900 dark:text-white">Surah {p.surah}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Ayat: {p.ayat}</div>
                      <div className="flex text-amber-400 gap-0.5 mt-2">
                        {[1,2,3,4,5].map(s => <Star key={s} className={`w-3 h-3 ${s <= p.rating ? 'fill-current' : 'opacity-20'}`} />)}
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setSelectedDetail({ ...p, type: 'quran' });
                        setActiveModal('detail');
                      }}
                      className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl hover:text-blue-600 transition-colors flex items-center gap-2 group-hover:scale-105 shadow-sm"
                    >
                      <Info className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase">Details</span>
                    </button>
                  </div>
                )) : (
                  <div className="text-center py-10 text-slate-400 italic">No progress recorded</div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions / Contact Parent */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black flex items-center gap-3 text-slate-900 dark:text-white">
                <MessageSquare className="text-indigo-500" /> Contact Parent
              </h3>
              <button 
                onClick={() => setActiveTab('messages')}
                className="text-xs font-black uppercase text-blue-600 hover:underline"
              >
                Go to Messenger
              </button>
            </div>
            <p className="text-sm text-slate-500">Need help? Send a secure message directly to your parent.</p>
          </div>

          <section className="bg-emerald-600 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
              <Activity className="w-48 h-48" />
            </div>
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h3 className="text-2xl font-black flex items-center gap-3"><Activity /> Sports & Physical Training</h3>
                <p className="text-emerald-100 mt-2 font-medium">Keep moving and stay healthy! View your latest training records.</p>
              </div>
              <div className="flex gap-4 w-full md:w-auto">
                {sportsTraining.length > 0 ? (
                  <div className="flex-1 md:flex-none p-4 bg-white/10 rounded-3xl border border-white/10 flex items-center justify-between gap-6 pointer-events-none">
                     <div>
                       <div className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Last Activity</div>
                       <div className="font-black text-lg">{sportsTraining[0].activity}</div>
                     </div>
                     <div className="text-right">
                       <div className="text-2xl font-black">{sportsTraining[0].duration}m</div>
                       <div className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Duration</div>
                     </div>
                  </div>
                ) : (
                  <div className="text-emerald-200 italic font-medium">No training sessions recorded yet</div>
                )}
                <button 
                  onClick={() => {
                    if (sportsTraining.length > 0) {
                      setSelectedDetail({ ...sportsTraining[0], type: 'sports' });
                      setActiveModal('detail');
                    } else {
                      toast.info("No training details to show yet!");
                    }
                  }}
                  className="px-6 py-4 bg-white text-emerald-600 rounded-[1.5rem] font-black text-sm shadow-xl hover:scale-105 transition-transform shrink-0 flex items-center gap-2"
                >
                  <Info className="w-4 h-4" />
                  View Details
                </button>
              </div>
            </div>
          </section>
        </motion.div>
      )}

      <AnimatePresence>
        {activeModal === 'detail' && selectedDetail && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setActiveModal(null)} />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              className="relative bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className={`h-24 flex items-center justify-between px-8 text-white ${
                selectedDetail.type === 'assignment' ? 'bg-blue-600' :
                selectedDetail.type === 'quran' ? 'bg-amber-500' :
                'bg-emerald-600'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    {selectedDetail.type === 'assignment' ? <BookOpen /> :
                     selectedDetail.type === 'quran' ? <Calendar /> : <Activity />}
                  </div>
                  <h3 className="text-xl font-black uppercase tracking-tight">Detail View</h3>
                </div>
                <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-white/20 rounded-xl transition-all"><X /></button>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Title / Activity</h4>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    {selectedDetail.title || selectedDetail.surah || selectedDetail.activity}
                  </div>
                </div>

                {selectedDetail.type === 'assignment' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Due Date</h4>
                        <div className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                          <Clock className="w-4 h-4 text-blue-500" />
                          {formatDate(selectedDetail.dueDate) || 'No deadline'}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Teacher</h4>
                        <div className="font-bold text-slate-700 dark:text-slate-300">
                          {selectedDetail.teacherName || 'Assigned Teacher'}
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Instructions</h4>
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-slate-600 dark:text-slate-400 text-sm leading-relaxed border border-slate-100 dark:border-slate-800 shadow-inner">
                        {selectedDetail.description || 'No additional instructions.'}
                      </div>
                    </div>
                    {selectedDetail.fileUrl && (
                      <div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Material</h4>
                        <a 
                          href={selectedDetail.fileUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg"
                        >
                          <FileText className="w-4 h-4" />
                          Open Attachment
                        </a>
                      </div>
                    )}
                  </>
                )}

                {selectedDetail.type === 'teacher' && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-6">
                      <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center text-white text-3xl font-black shadow-xl">
                        {selectedDetail.displayName?.[0]}
                      </div>
                      <div>
                        <div className="text-2xl font-black text-slate-900 dark:text-white">{selectedDetail.displayName}</div>
                        <div className="text-sm font-bold text-blue-600 uppercase tracking-widest">{selectedDetail.subject || 'Specialist'}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Email</div>
                        <div className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">{selectedDetail.email}</div>
                      </div>
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Status</div>
                        <div className="text-xs font-black text-emerald-500 uppercase">Active</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setActiveTab('messages')}
                      className="w-full py-4 bg-slate-950 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl"
                    >
                      Send Message
                    </button>
                  </div>
                )}

                {selectedDetail.type === 'quran' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Ayat Range</div>
                      <div className="font-black text-slate-900 dark:text-white uppercase">{selectedDetail.ayat}</div>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Teacher Rating</div>
                      <div className="flex text-amber-400 gap-1">
                        {[1,2,3,4,5].map(s => <Star key={s} className={`w-4 h-4 ${s <= selectedDetail.rating ? 'fill-current' : 'opacity-20'}`} />)}
                      </div>
                    </div>
                    {selectedDetail.comment && (
                      <div className="col-span-2">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Teacher's Comment</h4>
                        <div className="p-4 bg-amber-50 dark:bg-amber-900/10 text-amber-900 dark:text-amber-200 rounded-2xl text-sm italic border border-amber-100 dark:border-amber-900/20">
                          "{selectedDetail.comment}"
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selectedDetail.type === 'sports' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Duration</div>
                      <div className="font-black text-slate-900 dark:text-white text-xl">{selectedDetail.duration} min</div>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Intensity</div>
                      <div className="font-black text-slate-900 dark:text-white uppercase">{selectedDetail.intensity || 'Normal'}</div>
                    </div>
                    {selectedDetail.notes && (
                      <div className="col-span-2">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Training Notes</h4>
                        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-900 dark:text-emerald-200 rounded-2xl text-sm border border-emerald-100 dark:border-emerald-900/20">
                          {selectedDetail.notes}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button 
                  onClick={() => setActiveModal(null)}
                  className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl"
                >
                  Close Detail
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {activeModal === 'homework' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => !isSubmitting && setActiveModal(null)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] shadow-2xl p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Submit Homework</h3>
                <button onClick={() => setActiveModal(null)} className="dark:text-white"><X /></button>
              </div>
              <div className="space-y-5">
                <select className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl dark:text-white" value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)}>
                  <option value="">Select Teacher</option>
                  {teacherProfiles.map(t => <option key={t.uid} value={t.uid}>{t.name}</option>)}
                </select>
                <input placeholder="Title" className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl dark:text-white" value={homeworkTitle} onChange={e => setHomeworkTitle(e.target.value)} />
                <textarea placeholder="Description" className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl min-h-[100px] dark:text-white" value={homeworkDescription} onChange={e => setHomeworkDescription(e.target.value)} />
                
                <input type="file" id="h-up" className="hidden" onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
                <label htmlFor="h-up" className={`block p-6 border-2 border-dashed rounded-3xl text-center cursor-pointer ${selectedFile ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10' : 'border-slate-100 dark:border-slate-800'}`}>
                   {selectedFile ? <span className="text-emerald-600 dark:text-emerald-400 font-bold">{selectedFile.name}</span> : <span className="text-slate-400">Upload File (Max 10MB)</span>}
                </label>

                <div className="relative py-2 text-center text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest">OR PROVIDE LINK</div>
                <input type="url" placeholder="Paste link (Google Drive, etc.)" className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl text-sm dark:text-white" value={homeworkExternalLink} onChange={e => setHomeworkExternalLink(e.target.value)} />

                <button onClick={handleHomeworkSubmit} disabled={isSubmitting} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl disabled:opacity-50">
                  {isSubmitting ? 'Submitting...' : 'Submit to Teacher'}
                </button>
                {uploadProgress !== null && <div className="w-full h-1 bg-slate-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-blue-600" style={{ width: `${uploadProgress}%` }} /></div>}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

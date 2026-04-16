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
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

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

export const ChildDashboard: React.FC<{ onStartCall?: (channel: string, receiverId: string, receiverName: string) => void }> = ({ onStartCall }) => {
  const { profile, user } = useAuth();
  const [studentData, setStudentData] = useState<Student | null>(null);
  const [isSOSActive, setIsSOSActive] = useState(false);
  const [activeModal, setActiveModal] = useState<'homework' | 'sos' | null>(null);
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

    return () => {
      unsubAssignments();
      unsubQuran();
      unsubSports();
    };
  }, [studentData?.id]);

  const triggerSOS = async () => {
    if (!user?.uid || !studentData?.parentUid) return;
    setIsSOSActive(true);
    toast.error("SOS Triggered! Notifying parents...");
    setTimeout(() => setIsSOSActive(false), 10000);
  };

  const handleHomeworkSubmit = async () => {
    if (isSubmitting) return;
    if (!homeworkTitle || (!selectedTeacherId && !homeworkExternalLink)) {
      toast.error("Please fill in the title and select a teacher / provide a link.");
      return;
    }

    setIsSubmitting(true);
    const submissionToast = toast.loading("Submitting homework...");

    try {
      let fileUrl = homeworkExternalLink || null;
      let fileName = selectedFile?.name || (homeworkExternalLink ? "External Link" : null);

      if (selectedFile) {
        if (selectedFile.size < 400 * 1024) {
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
            uploadTask.on('state_changed', 
              (snap) => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
              reject,
              async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
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
      setActiveModal(null);
      toast.success("Homework submitted!", { id: submissionToast });
    } catch (error: any) {
      toast.error(error.message, { id: submissionToast });
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
      </header>

      <section className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 shadow-2xl text-center space-y-8">
        <div className="flex flex-col items-center">
          <div className="relative">
            <AnimatePresence>
              {isSOSActive && <motion.div animate={{ scale: 2, opacity: 0 }} transition={{ repeat: Infinity, duration: 1.5 }} className="absolute inset-0 bg-red-500 rounded-full" />}
            </AnimatePresence>
            <motion.button onClick={triggerSOS} className={`w-36 h-36 rounded-full flex items-center justify-center relative z-10 ${isSOSActive ? 'bg-red-600' : 'bg-red-500'}`}>
              <ShieldAlert className="w-16 h-16 text-white" />
            </motion.button>
          </div>
          <h3 className="mt-8 text-2xl font-black tracking-widest uppercase">SOS Emergency</h3>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-black flex items-center gap-3"><BookOpen className="text-blue-400" /> Assignments</h3>
            <button onClick={() => setActiveModal('homework')} className="bg-blue-600 px-6 py-3 rounded-2xl font-black">Submit Work</button>
          </div>
          <div className="space-y-4 max-h-[300px] overflow-y-auto">
            {assignments.map(a => (
              <div key={a.id} className="p-6 bg-white/5 rounded-3xl border border-white/10">
                <div className="font-black">{a.title}</div>
                <p className="text-sm text-slate-400 mt-2">{a.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 shadow-xl space-y-6">
           <h3 className="text-lg font-black flex items-center gap-3"><Calendar className="text-blue-600" /> Quran Progress</h3>
           <div className="space-y-4">
             {quranProgress.map(p => (
               <div key={p.id} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl flex justify-between">
                 <div>
                   <div className="font-black text-sm">Surah {p.surah}</div>
                   <div className="text-[10px] text-slate-500">Ayat: {p.ayat}</div>
                 </div>
                 <div className="flex text-amber-400 gap-0.5">
                   {[1,2,3,4,5].map(s => <Star key={s} className={`w-3 h-3 ${s <= p.rating ? 'fill-current' : 'opacity-20'}`} />)}
                 </div>
               </div>
             ))}
           </div>
        </div>
      </div>

      <AnimatePresence>
        {activeModal === 'homework' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => !isSubmitting && setActiveModal(null)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] shadow-2xl p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black">Submit Homework</h3>
                <button onClick={() => setActiveModal(null)}><X /></button>
              </div>
              <div className="space-y-5">
                <select className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl" value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)}>
                  <option value="">Select Teacher</option>
                  {teacherProfiles.map(t => <option key={t.uid} value={t.uid}>{t.name}</option>)}
                </select>
                <input placeholder="Title" className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl" value={homeworkTitle} onChange={e => setHomeworkTitle(e.target.value)} />
                <textarea placeholder="Description" className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl min-h-[100px]" value={homeworkDescription} onChange={e => setHomeworkDescription(e.target.value)} />
                
                <input type="file" id="h-up" className="hidden" onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
                <label htmlFor="h-up" className={`block p-6 border-2 border-dashed rounded-3xl text-center cursor-pointer ${selectedFile ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100'}`}>
                   {selectedFile ? <span className="text-emerald-600 font-bold">{selectedFile.name}</span> : <span className="text-slate-400">Upload File (Max 10MB)</span>}
                </label>

                <div className="relative py-2 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">OR PROVIDE LINK</div>
                <input type="url" placeholder="Paste link (Google Drive, etc.)" className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-sm" value={homeworkExternalLink} onChange={e => setHomeworkExternalLink(e.target.value)} />

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

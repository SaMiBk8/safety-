import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs, doc, getDoc, updateDoc, orderBy, arrayUnion } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Student, Announcement } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Book, MessageSquare, Calendar, Users, X, CheckCircle2, Star, Clock, BookOpen, Megaphone, Plus } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { Chat } from '../Chat';

export const QuranTeacherDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [activeTab, setActiveTab] = useState<'classes' | 'students' | 'schedule' | 'messenger' | 'submissions'>('classes');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [hifzProgress, setHifzProgress] = useState({ surah: '', ayah: '', rating: 5, notes: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [parents, setParents] = useState<{ uid: string, name: string, studentName: string }[]>([]);
  const [selectedParent, setSelectedParent] = useState<{ uid: string, name: string } | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [viewMode, setViewMode] = useState<'my' | 'all'>('all');
  const [teacherSubject, setTeacherSubject] = useState(profile?.subject || 'Quran');
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [isAddingAssignment, setIsAddingAssignment] = useState(false);
  const [newAssignTitle, setNewAssignTitle] = useState('');
  const [newAssignDesc, setNewAssignDesc] = useState('');
  const [newAssignDueDate, setNewAssignDueDate] = useState('');

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
    const q = query(collection(db, 'announcements'), where('schoolId', '==', profile.schoolId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'announcements', user || undefined);
    });
    return () => unsubscribe();
  }, [profile?.schoolId]);

  useEffect(() => {
    if (!profile?.schoolId) return;
    const q = query(collection(db, 'students'), where('schoolId', '==', profile.schoolId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students', user || undefined);
    });
    return () => unsubscribe();
  }, [profile?.schoolId]);

  useEffect(() => {
    if (!profile?.schoolId || !profile?.uid) return;
    const q = query(
      collection(db, 'homework_submissions'), 
      where('schoolId', '==', profile.schoolId),
      where('teacherId', '==', profile.uid),
      orderBy('submittedAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'homework_submissions', user || undefined);
    });
    return () => unsubscribe();
  }, [profile?.schoolId]);

  useEffect(() => {
    if (!profile?.schoolId) return;
    const q = query(
      collection(db, 'assignments'),
      where('schoolId', '==', profile.schoolId),
      where('teacherId', '==', profile.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAssignments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'assignments', user || undefined);
    });
    return () => unsubscribe();
  }, [profile?.schoolId, profile?.uid]);

  useEffect(() => {
    const fetchParents = async () => {
      if (students.length === 0) return;
      const parentIds = Array.from(new Set(students.map(s => s.parentUid).filter(Boolean))) as string[];
      if (parentIds.length === 0) return;

      try {
        const parentDocs = await Promise.all(parentIds.map(id => getDoc(doc(db, 'users', id))));
        const parentList = parentDocs
          .filter(d => d.exists())
          .map(d => {
            const data = d.data();
            const student = students.find(s => s.parentUid === d.id);
            return {
              uid: d.id,
              name: data?.displayName || 'Parent',
              studentName: student?.name || 'Student'
            };
          });
        setParents(parentList);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'users', user || undefined);
      }
    };
    fetchParents();
  }, [students]);

  const handleProgressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !hifzProgress.surah) return;
    setIsSubmitting(true);

    try {
      await addDoc(collection(db, 'quran_progress'), {
        studentId: selectedStudent.id,
        teacherId: profile?.uid,
        surah: hifzProgress.surah,
        ayat: hifzProgress.ayah, // Map ayah to ayat
        rating: hifzProgress.rating,
        status: hifzProgress.rating >= 4 ? 'memorized' : hifzProgress.rating >= 2 ? 'reviewing' : 'improving',
        notes: hifzProgress.notes,
        createdAt: serverTimestamp(),
      });
      setHifzProgress({ surah: '', ayah: '', rating: 5, notes: '' });
      setSelectedStudent(null);
      alert('Progress updated successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'quran_progress', user || undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.schoolId || !profile?.uid) return;

    try {
      await addDoc(collection(db, 'assignments'), {
        schoolId: profile.schoolId,
        teacherId: profile.uid,
        teacherName: profile.displayName || 'Teacher',
        teacherRole: profile.role,
        title: newAssignTitle,
        description: newAssignDesc,
        dueDate: newAssignDueDate ? new Date(newAssignDueDate) : null,
        createdAt: serverTimestamp()
      });
      setNewAssignTitle('');
      setNewAssignDesc('');
      setNewAssignDueDate('');
      setIsAddingAssignment(false);
      alert('Assignment created successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'assignments', user || undefined);
    }
  };

  const handleAssignToMe = async (studentId: string) => {
    try {
      await updateDoc(doc(db, 'students', studentId), {
        teacherIds: arrayUnion(profile?.uid),
        subject: teacherSubject,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `students/${studentId}`, user || undefined);
    }
  };

  const handleUpdateTeacherSubject = async () => {
    if (!profile?.uid) return;
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        subject: teacherSubject,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${profile.uid}`, user || undefined);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Quran Teacher Dashboard</h2>
          <p className="text-slate-500 dark:text-slate-400">Welcome back, {profile?.displayName}</p>
        </div>
        <div className="bg-emerald-100 dark:bg-emerald-900/30 p-3 rounded-2xl">
          <Book className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
        </div>
      </header>

      {announcements.length > 0 && (
        <div className="bg-emerald-600 text-white p-6 rounded-[2.5rem] shadow-xl shadow-emerald-100 dark:shadow-none mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Megaphone className="w-5 h-5" />
            <span className="text-xs font-black uppercase tracking-widest">School Announcement</span>
          </div>
          <h3 className="text-lg font-black mb-1">{announcements[0].title}</h3>
          <p className="text-emerald-100 text-sm">{announcements[0].content}</p>
        </div>
      )}

      <div className="flex gap-6 border-b border-slate-100 dark:border-slate-800 overflow-x-auto whitespace-nowrap pb-px scrollbar-hide">
        {[
          { id: 'classes', icon: BookOpen, label: 'My Classes' },
          { id: 'students', icon: Users, label: 'Students' },
          { id: 'schedule', icon: Calendar, label: 'Schedule' },
          { id: 'assignments', icon: BookOpen, label: 'Assignments' },
          { id: 'submissions', icon: BookOpen, label: 'Submissions' },
          { id: 'messenger', icon: MessageSquare, label: 'Messenger' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-4 px-2 text-sm font-bold transition-all relative flex items-center gap-2 shrink-0 ${
              activeTab === tab.id ? 'text-emerald-600' : 'text-slate-400'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.id === 'messenger' && unreadTotal > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full animate-bounce">
                {unreadTotal}
              </span>
            )}
            {activeTab === tab.id && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />}
          </button>
        ))}
      </div>

      {activeTab === 'classes' ? (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-600" />
                <span className="font-bold text-slate-900 dark:text-white">My Subject/Group:</span>
                <input 
                  type="text" 
                  value={teacherSubject}
                  onChange={(e) => setTeacherSubject(e.target.value)}
                  placeholder="e.g. Hifz Group A"
                  className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                />
                <button 
                  onClick={handleUpdateTeacherSubject}
                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                  title="Save Subject"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button 
                  onClick={() => setViewMode('my')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'my' ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm' : 'text-slate-500'}`}
                >
                  My Students
                </button>
                <button 
                  onClick={() => setViewMode('all')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'all' ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm' : 'text-slate-500'}`}
                >
                  All Students
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center">
              <Star className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Hifz Group A</h3>
            <p className="text-sm text-slate-500">Advanced memorization group. 12 active students.</p>
            <button 
              onClick={() => setActiveTab('students')}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm"
            >
              Manage Group
            </button>
          </div>
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center">
              <Book className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Tajweed Level 1</h3>
            <p className="text-sm text-slate-500">Foundational rules of recitation. 8 active students.</p>
            <button 
              onClick={() => setActiveTab('students')}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm"
            >
              Manage Group
            </button>
          </div>
          </div>
        </div>
      ) : activeTab === 'students' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {students
              .filter(s => viewMode === 'my' ? s.teacherIds?.includes(profile?.uid || '') : true)
              .map(student => (
              <div key={student.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center text-emerald-600 font-bold">
                      {student.name[0]}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white">{student.name}</h4>
                      <p className="text-xs text-slate-500">Grade: {student.grade}</p>
                      {student.subject && (
                        <p className="text-[10px] text-emerald-600 font-bold uppercase">{student.subject}</p>
                      )}
                    </div>
                  </div>
                  {viewMode === 'all' && !student.teacherIds?.includes(profile?.uid || '') && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleAssignToMe(student.id); }}
                      className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 transition-colors"
                    >
                      Assign to Me
                    </button>
                  )}
                </div>
                <button 
                  onClick={() => setSelectedStudent(student)}
                  className="w-full py-2 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-600 transition-colors"
                >
                  Update Progress
                </button>
              </div>
            ))}
          </div>
          <div className="space-y-6">
            <AnimatePresence>
              {selectedStudent && (
                <motion.form 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  onSubmit={handleProgressSubmit}
                  className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-emerald-100 dark:border-slate-800 shadow-xl space-y-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-slate-900 dark:text-white">Update {selectedStudent.name}</h3>
                    <button type="button" onClick={() => setSelectedStudent(null)}><X className="w-4 h-4 text-slate-400" /></button>
                  </div>
                  <div className="space-y-3">
                    <input 
                      type="text" 
                      placeholder="Surah Name" 
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-sm outline-none dark:text-white"
                      value={hifzProgress.surah}
                      onChange={e => setHifzProgress({...hifzProgress, surah: e.target.value})}
                      required
                    />
                    <input 
                      type="text" 
                      placeholder="Ayah Range (e.g. 1-10)" 
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-sm outline-none dark:text-white"
                      value={hifzProgress.ayah}
                      onChange={e => setHifzProgress({...hifzProgress, ayah: e.target.value})}
                    />
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-400 uppercase">Rating</label>
                      <div className="flex gap-1">
                        {[1,2,3,4,5].map(star => (
                          <button 
                            key={star} 
                            type="button"
                            onClick={() => setHifzProgress({...hifzProgress, rating: star})}
                          >
                            <Star className={`w-4 h-4 ${star <= hifzProgress.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea 
                      placeholder="Notes on recitation..." 
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-sm outline-none dark:text-white min-h-[80px]"
                      value={hifzProgress.notes}
                      onChange={e => setHifzProgress({...hifzProgress, notes: e.target.value})}
                    />
                    <button 
                      type="submit" 
                      disabled={isSubmitting}
                      className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? 'Saving...' : <><CheckCircle2 className="w-4 h-4" /> Save Progress</>}
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>
      ) : activeTab === 'schedule' ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white">Weekly Teaching Schedule</h3>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 rounded-full">Active</span>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {[
              { day: 'Monday', time: '07:00 - 08:30', group: 'Hifz Group A', room: 'Prayer Hall' },
              { day: 'Tuesday', time: '15:00 - 16:30', group: 'Tajweed Level 1', room: 'Classroom 4' },
              { day: 'Wednesday', time: '07:00 - 08:30', group: 'Hifz Group A', room: 'Prayer Hall' },
            ].map((session, i) => (
              <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm">{session.day}</div>
                    <div className="text-xs text-slate-500">{session.time}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-emerald-600 text-sm">{session.group}</div>
                  <div className="text-[10px] text-slate-400 uppercase font-black">{session.room}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === 'submissions' ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-bottom border-slate-100 dark:border-slate-800">
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Student</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Homework</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {submissions.map((sub) => (
                <tr key={sub.id}>
                  <td className="p-4 font-bold text-slate-900 dark:text-white">{sub.studentName}</td>
                  <td className="p-4 text-slate-600 dark:text-slate-400">{sub.title}</td>
                  <td className="p-4 text-xs text-slate-500">{sub.submittedAt?.toDate()?.toLocaleString() || 'Pending...'}</td>
                  <td className="p-4 text-right">
                    {sub.fileUrl && (
                      <a href={sub.fileUrl} target="_blank" rel="noreferrer" className="text-emerald-600 font-bold text-xs hover:underline">View File</a>
                    )}
                  </td>
                </tr>
              ))}
              {submissions.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400 italic text-sm">No submissions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'assignments' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xl">
              <BookOpen className="w-6 h-6 text-emerald-600" />
              Manage Quran Assignments
            </div>
            <button 
              onClick={() => setIsAddingAssignment(true)}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Create Assignment
            </button>
          </div>

          {isAddingAssignment && (
            <motion.form 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleAddAssignment}
              className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-emerald-100 dark:border-slate-800 shadow-sm space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input 
                  type="text" 
                  placeholder="Assignment Title (e.g. Memorize Surah Al-Mulk)" 
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                  value={newAssignTitle}
                  onChange={(e) => setNewAssignTitle(e.target.value)}
                  required
                />
                <input 
                  type="date" 
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                  value={newAssignDueDate}
                  onChange={(e) => setNewAssignDueDate(e.target.value)}
                />
              </div>
              <textarea 
                placeholder="Describe the task for your students..." 
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 min-h-[120px] dark:text-white"
                value={newAssignDesc}
                onChange={(e) => setNewAssignDesc(e.target.value)}
                required
              />
              <div className="flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAddingAssignment(false)}
                  className="px-4 py-2 text-slate-500 dark:text-slate-400 font-semibold"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-semibold"
                >
                  Create Assignment
                </button>
              </div>
            </motion.form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {assignments.map((assign) => (
              <div key={assign.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">{assign.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-4">{assign.description}</p>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-50 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Calendar className="w-3 h-3" />
                    Due: {assign.dueDate ? new Date(assign.dueDate.seconds * 1000).toLocaleDateString() : 'No deadline'}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Created: {assign.createdAt?.toDate().toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
            {assignments.length === 0 && !isAddingAssignment && (
              <div className="col-span-full text-center py-20 text-slate-400 italic">No assignments created yet.</div>
            )}
          </div>
        </div>
      ) : activeTab === 'messenger' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 px-2">Parents</h3>
              <div className="space-y-1">
                {parents.map(p => (
                  <button
                    key={p.uid}
                    onClick={() => setSelectedParent(p)}
                    className={`w-full text-left p-3 rounded-xl text-sm transition-all ${
                      selectedParent?.uid === p.uid 
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 font-bold' 
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {p.name} ({p.studentName})
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden min-h-[500px]">
              {selectedParent ? (
                <div className="flex flex-col h-full">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-emerald-50/50 dark:bg-emerald-900/20">
                    <h4 className="font-bold text-emerald-900 dark:text-emerald-100">{selectedParent.name}</h4>
                    <p className="text-[10px] text-emerald-600 uppercase font-black">Parent</p>
                  </div>
                  <div className="flex-1">
                    <Chat receiverId={selectedParent.uid} receiverName={selectedParent.name} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                  <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                    <MessageSquare className="w-8 h-8 text-slate-300" />
                  </div>
                  <h4 className="font-bold text-slate-900 dark:text-white mb-2">Messenger</h4>
                  <p className="text-sm text-slate-500 max-w-xs">Select a parent from the list to start a conversation.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

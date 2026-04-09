import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, getDoc, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Student, Announcement } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Users, ClipboardCheck, GraduationCap, AlertTriangle, MessageSquare, X, CheckCircle2, AlertCircle, BookOpen, FileText, Clock, Megaphone, Calendar } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { Chat } from '../Chat';
import { ContactList } from '../ContactList';
import { FeedbackModal } from '../FeedbackModal';

export const TeacherDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [note, setNote] = useState('');
  const [activeTab, setActiveTab] = useState<'students' | 'messenger' | 'submissions' | 'feedback'>('students');
  const [selectedContactForFeedback, setSelectedContactForFeedback] = useState<{ uid: string, name: string } | null>(null);
  const [modalType, setModalType] = useState<'attendance' | 'grades' | null>(null);
  const [modalStudent, setModalStudent] = useState<Student | null>(null);
  const [gradeValue, setGradeValue] = useState('');
  const [attendanceStatus, setAttendanceStatus] = useState<'present' | 'absent' | null>(null);
  const [parents, setParents] = useState<{ uid: string, name: string, studentName: string }[]>([]);
  const [selectedParent, setSelectedParent] = useState<{ uid: string, name: string } | null>(null);
  const [selectedContact, setSelectedContact] = useState<{ uid: string, displayName: string } | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

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
    const fetchParents = async () => {
      if (students.length === 0) return;
      
      const parentIds = Array.from(new Set(students.map(s => s.parentUid).filter(Boolean))) as string[];
      if (parentIds.length === 0) return;

      try {
        const parentDocs = await Promise.all(
          parentIds.map(id => getDoc(doc(db, 'users', id)))
        );
        
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
    if (!profile?.schoolId) return;
    const q = query(
      collection(db, 'homework_submissions'), 
      where('schoolId', '==', profile.schoolId),
      orderBy('submittedAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'homework_submissions', user || undefined);
    });
    return () => unsubscribe();
  }, [profile?.schoolId]);

  const handleReportIncident = async () => {
    if (!selectedStudent || !note) return;
    try {
      await addDoc(collection(db, 'incidents'), {
        studentId: selectedStudent.id,
        teacherId: profile?.uid,
        content: note,
        createdAt: serverTimestamp(),
        type: 'behavior'
      });
      setNote('');
      setSelectedStudent(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'incidents', user || undefined);
    }
  };

  const handleAttendance = async () => {
    if (!modalStudent || !attendanceStatus) return;
    try {
      await addDoc(collection(db, 'attendance'), {
        studentId: modalStudent.id,
        teacherId: profile?.uid,
        status: attendanceStatus,
        date: serverTimestamp(),
      });
      setModalType(null);
      setAttendanceStatus(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'attendance', user || undefined);
    }
  };

  const handleGradeSubmit = async () => {
    if (!modalStudent || !gradeValue) return;
    try {
      await addDoc(collection(db, 'grades'), {
        studentId: modalStudent.id,
        teacherId: profile?.uid,
        grade: gradeValue,
        createdAt: serverTimestamp(),
      });
      setModalType(null);
      setGradeValue('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'grades', user || undefined);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Teacher Dashboard</h2>
          <p className="text-slate-500 dark:text-slate-400">Manage your students and academic progress</p>
        </div>
        <div className="bg-emerald-100 dark:bg-emerald-900/30 p-3 rounded-2xl">
          <GraduationCap className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
        </div>
      </header>

      <div className="flex gap-6 border-b border-slate-100 dark:border-slate-800 mb-8 overflow-x-auto whitespace-nowrap pb-px scrollbar-hide">
        <button 
          onClick={() => setActiveTab('students')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative shrink-0 ${
            activeTab === 'students' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Students & Classes
          {activeTab === 'students' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('messenger')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative shrink-0 ${
            activeTab === 'messenger' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Messenger
          {activeTab === 'messenger' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('submissions')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative shrink-0 ${
            activeTab === 'submissions' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Submissions
          {activeTab === 'submissions' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('announcements' as any)}
          className={`pb-4 px-2 text-sm font-bold transition-all relative shrink-0 ${
            activeTab === ('announcements' as any) ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Announcements
          {activeTab === ('announcements' as any) && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
      </div>

      {activeTab === 'students' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {announcements.length > 0 && (
              <div className="bg-blue-600 text-white p-6 rounded-[2rem] shadow-xl shadow-blue-100 dark:shadow-none mb-4">
                <div className="flex items-center gap-2 mb-4">
                  <Megaphone className="w-5 h-5" />
                  <h3 className="font-bold">Latest Announcement</h3>
                </div>
                <h4 className="text-lg font-black mb-2">{announcements[0].title}</h4>
                <p className="text-blue-100 text-sm line-clamp-2">{announcements[0].content}</p>
                <button 
                  onClick={() => setActiveTab('announcements' as any)}
                  className="mt-4 text-xs font-bold underline"
                >
                  View All Announcements
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
              <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              My Students ({students.length})
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {students.map((student) => (
                <motion.div 
                  whileHover={{ y: -4 }}
                  key={student.id} 
                  className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-all cursor-pointer"
                  onClick={() => setSelectedStudent(student)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
                      {student.name[0]}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white">{student.name}</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Grade: {student.grade}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setModalStudent(student); setModalType('attendance'); }}
                      className="flex-1 py-2 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                    >
                      Attendance
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setModalStudent(student); setModalType('grades'); }}
                      className="flex-1 py-2 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                    >
                      Grades
                    </button>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if (student.parentUid) {
                          const parent = parents.find(p => p.uid === student.parentUid);
                          if (parent) {
                            setSelectedParent(parent);
                            setActiveTab('messenger');
                          }
                        }
                      }}
                      className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/30 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                      title="Chat with Parent"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Report Incident
              </div>
              <select 
                className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl mb-3 outline-none dark:text-white"
                onChange={(e) => setSelectedStudent(students.find(s => s.id === e.target.value) || null)}
                value={selectedStudent?.id || ''}
              >
                <option value="">Select Student</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <textarea 
                placeholder="Describe the behavior or incident..."
                className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl min-h-[100px] mb-3 outline-none dark:text-white"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button 
                onClick={handleReportIncident}
                disabled={!selectedStudent || !note}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-all disabled:opacity-50"
              >
                Submit Report
              </button>
            </div>

            <div className="bg-slate-900 dark:bg-slate-950 p-6 rounded-3xl text-white">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Parent Contacts
              </h3>
              <p className="text-xs text-slate-400 mb-4">Quickly reach out to parents regarding student progress.</p>
              <button 
                onClick={() => setActiveTab('messenger')}
                className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-bold transition-all"
              >
                Open Messenger
              </button>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-900 dark:text-white">
                <BookOpen className="w-4 h-4 text-blue-600" />
                Recent Submissions
              </h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                {submissions.map((sub) => (
                  <div key={sub.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">{sub.title}</span>
                      <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                        sub.status === 'pending' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                      }`}>
                        {sub.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {sub.submittedAt?.toDate().toLocaleDateString()}
                      </div>
                      {sub.fileUrl && (
                        <a 
                          href={sub.fileUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold text-blue-600 flex items-center gap-1 hover:underline"
                        >
                          <FileText className="w-3 h-3" /> View File
                        </a>
                      )}
                    </div>
                  </div>
                ))}
                {submissions.length === 0 && (
                  <p className="text-center text-xs text-slate-400 italic py-4">No submissions yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'messenger' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden h-[600px] flex flex-col">
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
                      setActiveTab('feedback');
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
          </div>
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden min-h-[600px] flex flex-col">
              {selectedContact ? (
                <div className="flex flex-col h-full flex-1">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <h4 className="font-bold text-slate-900 dark:text-white">{selectedContact.displayName}</h4>
                    <p className="text-[10px] text-slate-400 uppercase font-black">Active Chat</p>
                  </div>
                  <div className="flex-1">
                    <Chat receiverId={selectedContact.uid} receiverName={selectedContact.displayName} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-12 text-center flex-1">
                  <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                    <MessageSquare className="w-8 h-8 text-slate-300" />
                  </div>
                  <h4 className="font-bold text-slate-900 dark:text-white mb-2">Messenger</h4>
                  <p className="text-sm text-slate-500 max-w-xs">Select a contact from the list to start a conversation.</p>
                </div>
              )}
            </div>
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
                  <td className="p-4 text-xs text-slate-500">{sub.submittedAt?.toDate().toLocaleString()}</td>
                  <td className="p-4 text-right">
                    {sub.fileUrl && (
                      <a href={sub.fileUrl} target="_blank" rel="noreferrer" className="text-blue-600 font-bold text-xs hover:underline">View File</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : activeTab === ('announcements' as any) ? (
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xl">
            <Megaphone className="w-6 h-6 text-blue-600" />
            School Announcements
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {announcements.map((ann) => (
              <div key={ann.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">{ann.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-4">{ann.content}</p>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Calendar className="w-3 h-3" />
                  {ann.createdAt?.toDate().toLocaleDateString()}
                </div>
              </div>
            ))}
            {announcements.length === 0 && (
              <div className="col-span-full text-center py-20 text-slate-400 italic">No announcements from school administration.</div>
            )}
          </div>
        </div>
      ) : null}

      {/* Modals */}
      <AnimatePresence>
        {modalType && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalType(null)}
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
                  <h3 className="text-xl font-black text-slate-900 dark:text-white capitalize">
                    {modalType} - {modalStudent?.name}
                  </h3>
                  <button onClick={() => setModalType(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>

                {modalType === 'attendance' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => setAttendanceStatus('present')}
                        className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 ${attendanceStatus === 'present' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600' : 'border-slate-100 dark:border-slate-800 text-slate-400'}`}
                      >
                        <CheckCircle2 className="w-8 h-8" />
                        <span className="font-bold">Present</span>
                      </button>
                      <button 
                        onClick={() => setAttendanceStatus('absent')}
                        className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 ${attendanceStatus === 'absent' ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-600' : 'border-slate-100 dark:border-slate-800 text-slate-400'}`}
                      >
                        <AlertCircle className="w-8 h-8" />
                        <span className="font-bold">Absent</span>
                      </button>
                    </div>
                    <button 
                      onClick={handleAttendance}
                      disabled={!attendanceStatus}
                      className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                    >
                      Confirm Attendance
                    </button>
                  </div>
                )}

                {modalType === 'grades' && (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-bold text-slate-500 mb-2">Enter Grade (e.g., A, 95%, 18/20)</label>
                      <input 
                        type="text"
                        placeholder="Grade value..."
                        className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none dark:text-white"
                        value={gradeValue}
                        onChange={(e) => setGradeValue(e.target.value)}
                      />
                    </div>
                    <button 
                      onClick={handleGradeSubmit}
                      disabled={!gradeValue}
                      className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50"
                    >
                      Submit Grade
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <FeedbackModal 
        isOpen={activeTab === 'feedback'}
        onClose={() => setActiveTab('messenger')}
        toUid={selectedContactForFeedback?.uid || ''}
        toName={selectedContactForFeedback?.name || ''}
      />
    </div>
  );
};

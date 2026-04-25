import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, getDoc, orderBy, arrayUnion, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Student, Announcement } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Users, ClipboardCheck, GraduationCap, AlertTriangle, MessageSquare, X, CheckCircle2, AlertCircle, BookOpen, FileText, Clock, Megaphone, Calendar, Plus, Info, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { Chat } from '../Chat';
import { ContactList } from '../ContactList';
import { FeedbackModal } from '../FeedbackModal';
import { PrivateMessaging } from '../PrivateMessaging';

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
  const [gradeComment, setGradeComment] = useState('');
  const [gradeBehavior, setGradeBehavior] = useState<'excellent' | 'good' | 'average' | 'poor'>('good');
  const [attendanceStatus, setAttendanceStatus] = useState<'present' | 'absent' | null>(null);
  const [assignUploadProgress, setAssignUploadProgress] = useState<number | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState<any>(null);
  const [parents, setParents] = useState<{ uid: string, name: string, studentName: string }[]>([]);
  const [selectedParent, setSelectedParent] = useState<{ uid: string, name: string } | null>(null);
  const [selectedContact, setSelectedContact] = useState<{ uid: string, displayName: string } | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [sentFeedbacks, setSentFeedbacks] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'my' | 'all'>('all');
  const [teacherSubject, setTeacherSubject] = useState(profile?.subject || '');
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [isAddingAssignment, setIsAddingAssignment] = useState(false);
  const [newAssignTitle, setNewAssignTitle] = useState('');
  const [newAssignDesc, setNewAssignDesc] = useState('');
  const [newAssignDueDate, setNewAssignDueDate] = useState('');
  const [newAssignDeadline, setNewAssignDeadline] = useState('');
  const [assignFile, setAssignFile] = useState<File | null>(null);
  const [isAssignUploading, setIsAssignUploading] = useState(false);

  useEffect(() => {
    if (!profile?.uid) return;
    const q = query(
      collection(db, 'messages'),
      where('receiverId', '==', profile.uid),
      where('isRead', '==', false)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadTotal(snapshot.size);
    });
    return () => unsubscribe();
  }, [profile?.uid]);

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
    // Query all submissions for the school so teachers can see any student's work
    const q = query(
      collection(db, 'homework_submissions'), 
      where('schoolId', '==', profile.schoolId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a: any, b: any) => b.submittedAt?.seconds - a.submittedAt?.seconds));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'homework_submissions', user || undefined);
    });
    return () => unsubscribe();
  }, [profile?.schoolId]);

  const handleUpdateSubmissionStatus = async (id: string, currentStatus: string) => {
    try {
      let newStatus = 'reviewed';
      if (currentStatus === 'reviewed') {
        newStatus = 'submitted';
      }
      
      await updateDoc(doc(db, 'homework_submissions', id), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `homework_submissions/${id}`, user || undefined);
    }
  };

  useEffect(() => {
    if (!profile?.schoolId) return;
    const q = query(
      collection(db, 'assignments'),
      where('schoolId', '==', profile.schoolId),
      where('teacherId', '==', profile.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAssignments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a: any, b: any) => b.createdAt?.seconds - a.createdAt?.seconds));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'assignments', user || undefined);
    });
    return () => unsubscribe();
  }, [profile?.schoolId, profile?.uid]);

  useEffect(() => {
    if (!profile?.uid) return;
    const q = query(
      collection(db, 'feedbacks'),
      where('fromUid', '==', profile.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSentFeedbacks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.warn('Feedback fetch error:', error);
    });
    return () => unsubscribe();
  }, [profile?.uid]);

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
        comment: gradeComment,
        behavior: gradeBehavior,
        createdAt: serverTimestamp(),
      });
      setModalType(null);
      setGradeValue('');
      setGradeComment('');
      setGradeBehavior('good');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'grades', user || undefined);
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
      toast.success('Subject updated successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${profile.uid}`, user || undefined);
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this assignment?')) return;
    try {
      await deleteDoc(doc(db, 'assignments', id));
      toast.success('Assignment deleted successfully.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `assignments/${id}`, user || undefined);
    }
  };

  const handleDeleteSubmission = async (id: string) => {
    if (!window.confirm('Delete this submission?')) return;
    try {
      await deleteDoc(doc(db, 'homework_submissions', id));
      toast.success('Submission deleted.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `homework_submissions/${id}`, user || undefined);
    }
  };

  const handleDeleteIncident = async (id: string) => {
    if (!window.confirm('Delete this incident?')) return;
    try {
      await deleteDoc(doc(db, 'incidents', id));
      toast.success('Incident deleted.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `incidents/${id}`, user || undefined);
    }
  };

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.schoolId || !profile?.uid) return;

    setIsAssignUploading(true);
    setAssignUploadProgress(0);
    const toastId = toast.loading("Creating assignment...");
    try {
      let fileUrl = '';
      let fileName = '';

      if (assignFile) {
        const storageRef = ref(storage, `assignments/${profile.schoolId}/${Date.now()}_${assignFile.name}`);
        const uploadTask = uploadBytesResumable(storageRef, assignFile);
        
        fileUrl = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            uploadTask.cancel();
            reject(new Error("Upload timed out (> 10 mins)."));
          }, 600000);

          uploadTask.on('state_changed', 
            (snap) => setAssignUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
            (error: any) => {
              clearTimeout(timeout);
              reject(error);
            }, 
            async () => {
              clearTimeout(timeout);
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(url);
            }
          );
        });
        fileName = assignFile.name;
      }

      await addDoc(collection(db, 'assignments'), {
        schoolId: profile.schoolId,
        teacherId: profile.uid,
        teacherName: profile.displayName || 'Teacher',
        teacherRole: profile.role,
        title: newAssignTitle,
        description: newAssignDesc,
        dueDate: newAssignDueDate ? new Date(newAssignDueDate) : null,
        deadline: newAssignDeadline ? new Date(newAssignDeadline) : null,
        fileName,
        fileUrl,
        createdAt: serverTimestamp()
      });
      setNewAssignTitle('');
      setNewAssignDesc('');
      setNewAssignDueDate('');
      setNewAssignDeadline('');
      setAssignFile(null);
      setIsAddingAssignment(false);
      toast.success("Assignment created successfully!", { id: toastId });
    } catch (error: any) {
      toast.error(error.message || "Failed to create assignment", { id: toastId });
      handleFirestoreError(error, OperationType.CREATE, 'assignments', user || undefined);
    } finally {
      setIsAssignUploading(false);
      setAssignUploadProgress(null);
    }
  };

  const exportAnnouncements = () => {
    if (announcements.length === 0) return;
    const headers = ['Title', 'Content', 'Author ID', 'Created At', 'File URL'];
    const csvContent = [
      headers.join(','),
      ...announcements.map(ann => [
        `"${ann.title.replace(/"/g, '""')}"`,
        `"${ann.content.replace(/"/g, '""')}"`,
        ann.authorId,
        ann.createdAt?.toDate().toISOString(),
        ann.fileUrl || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `announcements_${profile?.schoolId || 'export'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Teacher Dashboard</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Manage your students and academic progress</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={exportAnnouncements}
            className="hidden sm:flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm border border-slate-100 dark:border-slate-800 active:scale-95"
          >
            <FileText className="w-4 h-4" />
            Export CSV
          </button>
          <div className="bg-emerald-100 dark:bg-emerald-900/30 p-3 rounded-2xl shadow-inner">
            <GraduationCap className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
      </header>

      <div className="flex gap-8 border-b border-slate-100 dark:border-slate-800 mb-8 overflow-x-auto whitespace-nowrap pb-px scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
        {[
          { id: 'students', label: 'Students & Classes' },
          { id: 'messenger', label: 'Messenger', badge: unreadTotal },
          { id: 'submissions', label: 'Submissions' },
          { id: 'announcements', label: 'Announcements' },
          { id: 'assignments', label: 'Assignments' },
          { id: 'feedback', label: 'Sent Feedback' },
        ].map((tab) => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-4 px-1 text-sm font-black transition-all relative shrink-0 flex items-center gap-2 ${
              activeTab === tab.id ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full animate-bounce shadow-lg">
                {tab.badge}
              </span>
            )}
            {activeTab === tab.id && (
              <motion.div 
                layoutId="tab-teacher" 
                className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-full" 
              />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'students' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold mb-4">
              <Megaphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              School Announcements
            </div>

            {announcements.length > 0 && (
              <div className="bg-blue-600 text-white p-6 rounded-[2rem] shadow-xl shadow-blue-100 dark:shadow-none mb-4">
                <div className="flex items-center gap-2 mb-4">
                  <Megaphone className="w-5 h-5" />
                  <h3 className="font-bold">Latest Announcement</h3>
                </div>
                <h4 className="text-lg font-black mb-2">{announcements[0].title}</h4>
                <p className="text-blue-100 text-sm line-clamp-2">{announcements[0].content}</p>
                {announcements[0].fileUrl && (
                  <div className="mt-3">
                    <a 
                      href={announcements[0].fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 p-2 bg-white/10 text-white rounded-xl text-[10px] font-bold hover:bg-white/20"
                    >
                      <FileText className="w-3 h-3" />
                      {announcements[0].fileName || 'View Attachment'}
                    </a>
                  </div>
                )}
                <button 
                  onClick={() => setActiveTab('announcements' as any)}
                  className="mt-4 text-xs font-bold underline"
                >
                  View All Announcements
                </button>
              </div>
            )}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm mb-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                  <span className="font-bold text-slate-900 dark:text-white">My Subject:</span>
                  <input 
                    type="text" 
                    value={teacherSubject}
                    onChange={(e) => setTeacherSubject(e.target.value)}
                    placeholder="e.g. Mathematics"
                    className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                  <button 
                    onClick={handleUpdateTeacherSubject}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                    title="Save Subject"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <button 
                    onClick={() => setViewMode('my')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'my' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-500'}`}
                  >
                    My Students
                  </button>
                  <button 
                    onClick={() => setViewMode('all')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'all' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-500'}`}
                  >
                    All Students
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold mb-4">
              <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              {viewMode === 'my' ? 'My Students' : 'All School Students'} ({
                students.filter(s => viewMode === 'my' ? s.teacherIds?.includes(profile?.uid || '') : true).length
              })
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {students
                .filter(s => viewMode === 'my' ? s.teacherIds?.includes(profile?.uid || '') : true)
                .map((student) => (
                <motion.div 
                  whileHover={{ y: -4 }}
                  key={student.id} 
                  className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-all cursor-pointer"
                  onClick={() => setSelectedStudent(student)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
                        {student.name[0]}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white">{student.name}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Grade: {student.grade}</p>
                        {student.subject && (
                          <p className="text-[10px] text-blue-600 font-bold uppercase">{student.subject}</p>
                        )}
                      </div>
                    </div>
                    {viewMode === 'all' && !student.teacherIds?.includes(profile?.uid || '') && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleAssignToMe(student.id); }}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700 transition-colors"
                      >
                        Assign to Me
                      </button>
                    )}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setSelectedUserDetail(student);
                        setIsDetailModalOpen(true);
                      }}
                      className="flex-1 py-2 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-xl text-[10px] uppercase font-black tracking-widest hover:bg-blue-600 hover:text-white transition-all"
                    >
                      Details
                    </button>
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
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setSelectedContactForFeedback({ uid: student.childUid, name: student.name }); 
                      }}
                      className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                      title="Send Feedback"
                    >
                      <Star className="w-4 h-4" />
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
                {submissions
                  .filter(s => viewMode === 'all' || s.teacherId === profile?.uid)
                  .slice(0, 10)
                  .map((sub) => (
                    <div key={sub.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">{sub.title}</span>
                      <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                        sub.status === 'submitted' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
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
                          referrerPolicy="no-referrer"
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
        <PrivateMessaging />
      ) : activeTab === 'submissions' ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-x-auto scrollbar-hide">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-bottom border-slate-100 dark:border-slate-800">
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Student</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Homework</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {submissions
                .filter(s => viewMode === 'all' || s.teacherId === profile?.uid)
                .map((sub) => (
                  <tr key={sub.id}>
                  <td className="p-4 font-bold text-slate-900 dark:text-white">{sub.studentName}</td>
                  <td className="p-4">
                    <div className="text-slate-900 dark:text-white font-medium">{sub.title}</div>
                    {sub.description && <div className="text-xs text-slate-500 line-clamp-1">{sub.description}</div>}
                  </td>
                  <td className="p-4 text-xs text-slate-500">{sub.submittedAt?.toDate()?.toLocaleString() || 'Pending...'}</td>
                  <td className="p-4">
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${
                      sub.status === 'submitted' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {sub.status}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button 
                      onClick={() => setSelectedSubmission(sub)}
                      className="inline-flex items-center gap-1 text-slate-500 font-bold text-xs hover:text-blue-600 transition-colors"
                    >
                      <Info className="w-3 h-3" /> Details
                    </button>
                    {sub.fileUrl && (
                      <a 
                        href={sub.fileUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        referrerPolicy="no-referrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-black text-[10px] uppercase rounded-lg hover:bg-blue-100 transition-all border border-blue-100 dark:border-blue-800"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        View File
                      </a>
                    )}
                    <button 
                      onClick={() => handleUpdateSubmissionStatus(sub.id, sub.status)}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                        sub.status === 'submitted' ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                    >
                      {sub.status === 'submitted' ? 'Mark Reviewed' : 'Undo'}
                    </button>
                    <button 
                      onClick={() => handleDeleteSubmission(sub.id)}
                      className="p-2.5 text-red-600 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-red-300 dark:hover:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-2xl transition-all active:scale-95 shadow-sm flex items-center justify-center translate-z-0"
                      title="Delete Submission"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : activeTab === ('announcements' as any) ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xl">
              <Megaphone className="w-6 h-6 text-blue-600" />
              School Announcements
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {announcements.map((ann) => (
              <div key={ann.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">{ann.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-4">{ann.content}</p>
                {ann.fileUrl && (
                  <div className="mb-4">
                    <a 
                      href={ann.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2.5 px-4 py-2 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-black uppercase tracking-tight hover:bg-blue-100 transition-all border border-blue-100 dark:border-blue-800"
                    >
                      <FileText className="w-4 h-4" />
                      {ann.fileName || 'View Attachment'}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Calendar className="w-3 h-3" />
                  {ann.createdAt?.toDate().toLocaleDateString()}
                </div>
              </div>
            ))}
            {announcements.length === 0 && (
              <div className="col-span-full text-center py-20 text-slate-400 italic bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-slate-800">
                No announcements from school administration.
              </div>
            )}
          </div>
        </div>
      ) : activeTab === ('assignments' as any) ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xl">
              <BookOpen className="w-6 h-6 text-blue-600" />
              Manage Assignments
            </div>
            <button 
              onClick={() => setIsAddingAssignment(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Create Assignment
            </button>
          </div>

          {isAddingAssignment && (
            <motion.form 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleAddAssignment}
              className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-blue-100 dark:border-slate-800 shadow-xl space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Title</label>
                  <input 
                    type="text" 
                    placeholder="Assignment Title" 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                    value={newAssignTitle}
                    onChange={(e) => setNewAssignTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Class Date</label>
                  <input 
                    type="date" 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                    value={newAssignDueDate}
                    onChange={(e) => setNewAssignDueDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Auto-Delete Deadline</label>
                  <input 
                    type="datetime-local" 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                    value={newAssignDeadline}
                    onChange={(e) => setNewAssignDeadline(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Attachment</label>
                  <label className={`flex items-center gap-3 w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-dashed rounded-xl cursor-pointer transition-all ${assignFile ? 'border-blue-600' : 'border-slate-100 dark:border-slate-800'}`}>
                    <FileText className={`w-5 h-5 ${assignFile ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span className="text-xs font-bold text-slate-500 truncate">
                      {assignFile ? assignFile.name : 'Upload material...'}
                    </span>
                    <input 
                      type="file" 
                      onChange={(e) => setAssignFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Instructions</label>
                <textarea 
                  placeholder="Describe the task for your students..." 
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px] dark:text-white"
                  value={newAssignDesc}
                  onChange={(e) => setNewAssignDesc(e.target.value)}
                  required
                />
              </div>

              {assignUploadProgress !== null && (
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 transition-all duration-300" 
                    style={{ width: `${assignUploadProgress}%` }}
                  />
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAddingAssignment(false)}
                  className="px-6 py-3 text-slate-500 dark:text-slate-400 font-black text-xs uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isAssignUploading}
                  className="px-10 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-200 dark:shadow-none hover:bg-blue-700 disabled:opacity-50 transition-all"
                >
                  {isAssignUploading ? 'Uploading...' : 'Publish'}
                </button>
              </div>
            </motion.form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {assignments.map((assign) => (
              <div key={assign.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm relative">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-900 dark:text-white leading-tight">{assign.title}</h3>
                  <button 
                    onClick={() => handleDeleteAssignment(assign.id)}
                    className="p-2.5 text-red-600 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-red-300 dark:hover:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-2xl transition-all active:scale-95 shadow-sm flex items-center justify-center shrink-0"
                    title="Delete Assignment"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
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
      ) : activeTab === 'feedback' ? (
        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">Feedback History</h3>
              <p className="text-sm text-slate-500 font-medium">Ratings and comments you've sent to students</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                  <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest">Student</th>
                  <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest">Rating</th>
                  <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest">Comment</th>
                  <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {sentFeedbacks.map((fb) => (
                  <tr key={fb.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all group">
                    <td className="p-6">
                      <div className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors">{fb.toName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{fb.toUid.slice(0, 8)}...</div>
                    </td>
                    <td className="p-6">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star key={star} className={`w-4 h-4 ${star <= fb.rating ? 'text-amber-400 fill-amber-400 shadow-sm' : 'text-slate-100 dark:text-slate-700'}`} />
                        ))}
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-md">{fb.comment}</div>
                    </td>
                    <td className="p-6">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                        {fb.createdAt?.toDate().toLocaleString()}
                      </div>
                    </td>
                  </tr>
                ))}
                {sentFeedbacks.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-20 text-center text-slate-400 italic font-medium bg-slate-50/30">
                      You haven't sent any feedback yet. You can send feedback from the "Students" tab.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
                    <div>
                      <label className="block text-sm font-bold text-slate-500 mb-2">Behavior</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['excellent', 'good', 'average', 'poor'] as const).map((b) => (
                          <button
                            key={b}
                            onClick={() => setGradeBehavior(b)}
                            className={`py-2 px-4 rounded-xl text-xs font-bold border-2 transition-all capitalize ${
                              gradeBehavior === b 
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600' 
                                : 'border-slate-100 dark:border-slate-800 text-slate-400'
                            }`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-500 mb-2">Comment (Optional)</label>
                      <textarea 
                        placeholder="Add a comment about the student's progress..."
                        className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none dark:text-white min-h-[100px]"
                        value={gradeComment}
                        onChange={(e) => setGradeComment(e.target.value)}
                      />
                    </div>
                    <button 
                      onClick={handleGradeSubmit}
                      disabled={!gradeValue}
                      className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50"
                    >
                      Submit Evaluation
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {selectedSubmission && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setSelectedSubmission(null)} />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              className="relative bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="h-24 bg-blue-600 flex items-center justify-between px-8 text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <BookOpen />
                  </div>
                  <h3 className="text-xl font-black uppercase tracking-tight">Submission Details</h3>
                </div>
                <button onClick={() => setSelectedSubmission(null)} className="p-2 hover:bg-white/20 rounded-xl transition-all"><X /></button>
              </div>

              <div className="p-8 space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Student</h4>
                    <div className="text-xl font-black text-slate-900 dark:text-white">{selectedSubmission.studentName}</div>
                  </div>
                  <div className="text-right">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Status</h4>
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${
                      selectedSubmission.status === 'submitted' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {selectedSubmission.status}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Homework Title</h4>
                  <div className="text-lg font-bold text-slate-700 dark:text-slate-300">{selectedSubmission.title}</div>
                </div>

                {selectedSubmission.description && (
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Student Notes</h4>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-slate-600 dark:text-slate-400 text-sm leading-relaxed border border-slate-100 dark:border-slate-800">
                      {selectedSubmission.description}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Submitted On</div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm">
                      {selectedSubmission.submittedAt?.toDate().toLocaleString()}
                    </div>
                  </div>
                  {selectedSubmission.fileUrl && (
                    <a 
                      href={selectedSubmission.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800 flex flex-col justify-center gap-1 group animate-pulse"
                    >
                      <div className="text-[10px] font-black uppercase text-blue-400">Attached File (Action Required)</div>
                      <div className="font-bold text-blue-600 flex items-center gap-2 group-hover:underline">
                        <FileText className="w-4 h-4" /> View Student File
                      </div>
                    </a>
                  )}
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      handleUpdateSubmissionStatus(selectedSubmission.id, selectedSubmission.status);
                      setSelectedSubmission(null);
                    }}
                    className={`flex-1 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl transition-all active:scale-95 ${
                      selectedSubmission.status === 'submitted' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {selectedSubmission.status === 'submitted' ? 'Mark as Reviewed' : 'Re-mark as Submitted'}
                  </button>
                  <button 
                    onClick={() => setSelectedSubmission(null)}
                    className="px-6 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isDetailModalOpen && selectedUserDetail && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDetailModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white">Student Details</h3>
                  <button onClick={() => setIsDetailModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>
                
                <div className="space-y-6">
                  <div className="flex items-center gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                    <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white text-3xl font-black">
                      {selectedUserDetail.name?.[0] || 'S'}
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-slate-900 dark:text-white">{selectedUserDetail.name}</h4>
                      <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Student ID: {selectedUserDetail.id.slice(0,8)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Current Grade</p>
                      <p className="font-bold text-slate-900 dark:text-white">{selectedUserDetail.grade || 'N/A'}</p>
                    </div>
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Status</p>
                      <p className="font-bold text-emerald-600">Enrolled</p>
                    </div>
                  </div>

                  {selectedUserDetail.subject && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Specialization</p>
                      <p className="font-bold text-blue-600">{selectedUserDetail.subject}</p>
                    </div>
                  )}

                  <div className="pt-4 flex gap-3">
                    <button 
                      onClick={() => {
                        if (selectedUserDetail.parentUid) {
                          const parent = parents.find(p => p.uid === selectedUserDetail.parentUid);
                          if (parent) {
                            setSelectedParent(parent);
                            setActiveTab('messenger');
                          }
                        }
                        setIsDetailModalOpen(false);
                      }}
                      className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 dark:shadow-none"
                    >
                      Contact Parent
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedContactForFeedback({ uid: selectedUserDetail.childUid, name: selectedUserDetail.name });
                        setIsDetailModalOpen(false);
                      }}
                      className="flex-1 py-4 bg-amber-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-amber-600 transition-all shadow-lg"
                    >
                      Give Feedback
                    </button>
                    <button 
                      onClick={() => setIsDetailModalOpen(false)}
                      className="px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <FeedbackModal 
        isOpen={!!selectedContactForFeedback}
        onClose={() => setSelectedContactForFeedback(null)}
        toUid={selectedContactForFeedback?.uid || ''}
        toName={selectedContactForFeedback?.name || ''}
      />
    </div>
  );
};

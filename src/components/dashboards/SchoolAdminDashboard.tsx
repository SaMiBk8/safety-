import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, doc, updateDoc, orderBy, getDocs, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Announcement, UserProfile } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Megaphone, Users, Calendar, CheckCircle2, X, Clock, FileText, MessageSquare, GraduationCap, Trash2 } from 'lucide-react';
import { Chat } from '../Chat';
import { ContactList } from '../ContactList';
import { FeedbackModal } from '../FeedbackModal';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { deleteDoc } from 'firebase/firestore';

interface VisitorMessage {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  requestedRole: string;
  message: string;
  fileName?: string;
  fileUrl?: string;
  createdAt: any;
  status: 'unread' | 'read';
  schoolId?: string;
}

export const SchoolAdminDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'announcements' | 'staff' | 'students' | 'requests' | 'messenger' | 'feedback' | 'submissions'>('announcements');
  const [selectedContactForFeedback, setSelectedContactForFeedback] = useState<{ uid: string, name: string } | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [parents, setParents] = useState<UserProfile[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [requests, setRequests] = useState<VisitorMessage[]>([]);
  const [selectedContact, setSelectedContact] = useState<UserProfile | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingTeacher, setIsAddingTeacher] = useState(false);
  const [teacherEmail, setTeacherEmail] = useState('');
  const [addTeacherStatus, setAddTeacherStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

  useEffect(() => {
    if (!profile?.schoolId) return;

    const annQ = query(
      collection(db, 'announcements'), 
      where('schoolId', '==', profile.schoolId)
    );
    const unsubscribeAnn = onSnapshot(annQ, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement));
      setAnnouncements(list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'announcements', user || undefined);
    });

    const staffQ = query(
      collection(db, 'users'),
      where('schoolId', '==', profile.schoolId),
      where('role', 'in', ['teacher', 'quran_teacher', 'sports_coach'])
    );
    const unsubscribeStaff = onSnapshot(staffQ, (snapshot) => {
      setStaff(snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users', user || undefined);
    });

    const requestsQ = query(
      collection(db, 'visitor_messages'),
      where('schoolId', '==', profile.schoolId),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeRequests = onSnapshot(requestsQ, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VisitorMessage)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'visitor_messages', user || undefined);
    });

    const parentsQ = query(
      collection(db, 'users'),
      where('schoolId', '==', profile.schoolId),
      where('role', '==', 'parent')
    );
    const unsubscribeParents = onSnapshot(parentsQ, (snapshot) => {
      setParents(snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users', user || undefined);
    });

    const studentsQ = query(
      collection(db, 'students'),
      where('schoolId', '==', profile.schoolId)
    );
    const unsubscribeStudents = onSnapshot(studentsQ, (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students', user || undefined);
    });

    const subQ = query(
      collection(db, 'homework_submissions'),
      where('schoolId', '==', profile.schoolId),
      orderBy('submittedAt', 'desc')
    );
    const unsubscribeSub = onSnapshot(subQ, (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'homework_submissions', user || undefined);
    });

    return () => {
      unsubscribeAnn();
      unsubscribeStaff();
      unsubscribeRequests();
      unsubscribeParents();
      unsubscribeStudents();
      unsubscribeSub();
    };
  }, [profile?.schoolId]);

  const deleteUser = async (uid: string) => {
    if (uid === user?.uid) {
      alert('You cannot delete your own account.');
      return;
    }
    if (!window.confirm('Are you sure you want to permanently delete this account? This action cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'users', uid));
      alert('Account successfully deleted.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}`, user || undefined);
    }
  };

  const deleteStudent = async (studentId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this student record? This action cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'students', studentId));
      alert('Student record successfully deleted.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `students/${studentId}`, user || undefined);
    }
  };

  const handleApproveRequest = async (request: VisitorMessage) => {
    if (!profile?.schoolId) return;
    try {
      await updateDoc(doc(db, 'users', request.uid), {
        role: request.requestedRole,
        schoolId: profile.schoolId,
        status: 'active',
        updatedAt: serverTimestamp()
      });

      // If it's a child, create a student record if it doesn't exist
      if (request.requestedRole === 'child') {
        const studentsRef = collection(db, 'students');
        const q = query(studentsRef, where('childUid', '==', request.uid));
        const snap = await getDocs(q);
        
        if (snap.empty) {
          await addDoc(collection(db, 'students'), {
            childUid: request.uid,
            schoolId: profile.schoolId,
            name: request.displayName || 'Student',
            grade: 'Not Assigned',
            parentUid: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      }

      await updateDoc(doc(db, 'visitor_messages', request.id), {
        status: 'read'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${request.uid}`, user || undefined);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await updateDoc(doc(db, 'visitor_messages', requestId), {
        status: 'read'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `visitor_messages/${requestId}`, user || undefined);
    }
  };

  const handleAssignTeacher = async (studentId: string, teacherId: string) => {
    try {
      await updateDoc(doc(db, 'students', studentId), {
        teacherIds: arrayUnion(teacherId),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `students/${studentId}`, user || undefined);
    }
  };

  const handleUpdateGrade = async (studentId: string, grade: string) => {
    try {
      await updateDoc(doc(db, 'students', studentId), {
        grade: grade,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `students/${studentId}`, user || undefined);
    }
  };

  const handleAddAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.schoolId) return;

    setUploading(true);
    try {
      let fileUrl = '';
      let fileName = '';

      if (selectedFile) {
        const storageRef = ref(storage, `announcements/${profile.schoolId}/${Date.now()}_${selectedFile.name}`);
        await uploadBytes(storageRef, selectedFile);
        fileUrl = await getDownloadURL(storageRef);
        fileName = selectedFile.name;
      }

      await addDoc(collection(db, 'announcements'), {
        schoolId: profile.schoolId,
        title: newTitle,
        content: newContent,
        fileName,
        fileUrl,
        authorId: profile.uid,
        createdAt: serverTimestamp()
      });
      setNewTitle('');
      setNewContent('');
      setSelectedFile(null);
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'announcements', user || undefined);
    } finally {
      setUploading(false);
    }
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.schoolId) return;
    setAddTeacherStatus(null);

    const roleSelect = document.getElementById('staffRole') as HTMLSelectElement;
    const selectedRole = roleSelect?.value || 'teacher';

    try {
      // Find user by email
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', teacherEmail.toLowerCase()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setAddTeacherStatus({ type: 'error', message: 'User not found. Please ensure they have registered first.' });
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data() as UserProfile;

      if (userData.role === 'system_admin') {
        setAddTeacherStatus({ type: 'error', message: 'Cannot assign System Admin as a staff member.' });
        return;
      }

      await updateDoc(doc(db, 'users', userDoc.id), {
        role: selectedRole,
        schoolId: profile.schoolId,
        status: 'active',
        updatedAt: serverTimestamp()
      });

      setAddTeacherStatus({ type: 'success', message: `Successfully added ${userData.displayName || teacherEmail} as a ${selectedRole.replace('_', ' ')}.` });
      setTeacherEmail('');
      setIsAddingTeacher(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users', user || undefined);
      setAddTeacherStatus({ type: 'error', message: 'Failed to add staff member. Please try again.' });
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
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">School Management</h2>
          <p className="text-slate-500 dark:text-slate-400">Manage teachers, announcements, and permissions</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={exportAnnouncements}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-semibold hover:bg-slate-200 transition-all"
          >
            <FileText className="w-4 h-4" />
            Export CSV
          </button>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 dark:shadow-none"
          >
            <Plus className="w-4 h-4" />
            New Announcement
          </button>
        </div>
      </header>

      <div className="flex gap-6 border-b border-slate-100 dark:border-slate-800 mb-8 overflow-x-auto whitespace-nowrap pb-px scrollbar-hide">
        <button 
          onClick={() => setActiveTab('announcements')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative shrink-0 ${
            activeTab === 'announcements' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Announcements
          {activeTab === 'announcements' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('staff')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative shrink-0 ${
            activeTab === 'staff' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Directory
          {activeTab === 'staff' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('students')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative shrink-0 ${
            activeTab === 'students' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Students
          {activeTab === 'students' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
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
          onClick={() => setActiveTab('requests')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative flex items-center gap-2 shrink-0 ${
            activeTab === 'requests' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Access Requests
          {requests.filter(r => r.status === 'unread').length > 0 && (
            <span className="w-2 h-2 bg-red-500 rounded-full" />
          )}
          {activeTab === 'requests' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('messenger')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative shrink-0 flex items-center gap-2 ${
            activeTab === 'messenger' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Messenger
          {unreadTotal > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full animate-bounce">
              {unreadTotal}
            </span>
          )}
          {activeTab === 'messenger' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
      </div>

      {activeTab === 'announcements' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
            <Megaphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Recent Announcements
          </div>

          {isAdding && (
            <motion.form 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleAddAnnouncement}
              className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-blue-100 dark:border-slate-800 shadow-sm space-y-4"
            >
              <input 
                type="text" 
                placeholder="Announcement Title" 
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
              />
              <textarea 
                placeholder="Write your announcement here..." 
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px] dark:text-white"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                required
              />
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase px-1">Attach File (Optional)</label>
                <input 
                  type="file" 
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 text-slate-500 dark:text-slate-400 font-semibold"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={uploading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center gap-2"
                >
                  {uploading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {uploading ? 'Posting...' : 'Post Announcement'}
                </button>
              </div>
            </motion.form>
          )}

          <div className="space-y-4">
            {announcements.map((ann) => (
              <div key={ann.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">{ann.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-4">{ann.content}</p>
                {ann.fileUrl && (
                  <div className="mb-4">
                    <a 
                      href={ann.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold hover:underline"
                    >
                      <FileText className="w-4 h-4" />
                      {ann.fileName || 'View Attachment'}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                  <Calendar className="w-3 h-3" />
                  {ann.createdAt?.toDate().toLocaleDateString()}
                </div>
              </div>
            ))}
            {announcements.length === 0 && !isAdding && (
              <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500">
                No announcements yet.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 dark:bg-slate-950 text-white p-6 rounded-3xl shadow-xl">
            <h3 className="font-bold mb-4">School Statistics</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Active Staff</span>
                <span className="font-bold">{staff.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Total Announcements</span>
                <span className="font-bold">{announcements.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Pending Requests</span>
                <span className="font-bold text-amber-400">{requests.filter(r => r.status === 'unread').length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      ) : activeTab === 'staff' ? (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xl">
              <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              School Directory
            </div>
            <button 
              onClick={() => setIsAddingTeacher(true)}
              className="px-4 py-2 bg-slate-900 dark:bg-slate-800 text-white rounded-xl text-sm font-bold flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Staff Member
            </button>
          </div>

          <AnimatePresence>
            {isAddingTeacher && (
              <motion.form 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleAddTeacher}
                className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-blue-100 dark:border-slate-800 shadow-sm space-y-4 overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase px-1">Email Address</label>
                    <input 
                      type="email" 
                      placeholder="staff@school.com" 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      value={teacherEmail}
                      onChange={(e) => setTeacherEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase px-1">Role</label>
                    <select 
                      id="staffRole"
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      defaultValue="teacher"
                    >
                      <option value="teacher">General Teacher</option>
                      <option value="quran_teacher">Quran Teacher</option>
                      <option value="sports_coach">Sports Coach</option>
                    </select>
                  </div>
                </div>
                {addTeacherStatus && (
                  <div className={`p-3 rounded-xl text-xs font-bold ${addTeacherStatus.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                    {addTeacherStatus.message}
                  </div>
                )}
                <div className="flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => { setIsAddingTeacher(false); setAddTeacherStatus(null); }}
                    className="px-4 py-2 text-slate-500 dark:text-slate-400 font-semibold"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-6 py-2 bg-blue-600 text-white rounded-xl font-semibold"
                  >
                    Add Staff Member
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="space-y-6">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest px-2">Staff Members</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {staff.map((member) => (
                <div key={member.uid} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-600 font-black text-xl">
                      {member.displayName?.[0] || 'S'}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white">{member.displayName || 'Unnamed Staff'}</h4>
                      <p className="text-xs text-slate-500">{member.email}</p>
                      <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full mt-1 inline-block">
                        {member.role?.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-slate-50 dark:border-slate-800">
                    <span className={`text-xs font-bold uppercase ${member.status === 'active' ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {member.status}
                    </span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => deleteUser(member.uid)}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                        title="Delete Staff Member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button className="text-xs font-bold text-blue-600 hover:underline">View Profile</button>
                    </div>
                  </div>
                </div>
              ))}
              {staff.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-400 italic">No staff members registered yet.</div>
              )}
            </div>

            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest px-2 pt-4">Parents & Children</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {parents.map((parent) => (
                <div key={parent.uid} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-purple-50 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center text-purple-600 font-black text-xl">
                        {parent.displayName?.[0] || 'P'}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-slate-900 dark:text-white">{parent.displayName || 'Parent'}</h4>
                        <p className="text-xs text-slate-500">{parent.email}</p>
                      </div>
                      <button 
                        onClick={() => deleteUser(parent.uid)}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                        title="Delete Parent"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  <div className="space-y-2 pt-4 border-t border-slate-50 dark:border-slate-800">
                    <div className="text-[10px] font-black text-slate-400 uppercase">Linked Children</div>
                    <div className="flex flex-wrap gap-2">
                      {parent.childIds && parent.childIds.length > 0 ? (
                        parent.childIds.map((childId, idx) => (
                          <span key={idx} className="px-2 py-1 bg-slate-50 dark:bg-slate-800 rounded-lg text-[10px] text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-700">
                            ID: {childId.slice(-6)}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">No children linked yet</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {parents.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-400 italic">No parents registered yet.</div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'students' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xl">
              <GraduationCap className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              Student Management
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50">
                  <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest">Student Name</th>
                  <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest">Class / Grade</th>
                  <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest">Assigned Teacher</th>
                  <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-slate-900 dark:text-white">{student.name}</div>
                      <div className="text-[10px] text-slate-400">ID: {student.id.slice(-6)}</div>
                    </td>
                    <td className="p-4">
                      <select 
                        className="bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:text-white w-full max-w-[150px]"
                        value={student.grade || ''}
                        onChange={(e) => handleUpdateGrade(student.id, e.target.value)}
                      >
                        <option value="">No Class</option>
                        <optgroup label="Primary">
                          <option value="1st Grade">1st Grade</option>
                          <option value="2nd Grade">2nd Grade</option>
                          <option value="3rd Grade">3rd Grade</option>
                          <option value="4th Grade">4th Grade</option>
                          <option value="5th Grade">5th Grade</option>
                          <option value="6th Grade">6th Grade</option>
                        </optgroup>
                        <optgroup label="Middle School">
                          <option value="7th Grade">7th Grade</option>
                          <option value="8th Grade">8th Grade</option>
                          <option value="9th Grade">9th Grade</option>
                        </optgroup>
                        <optgroup label="High School">
                          <option value="10th Grade">10th Grade</option>
                          <option value="11th Grade">11th Grade</option>
                          <option value="12th Grade">12th Grade</option>
                        </optgroup>
                      </select>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {student.teacherIds?.map((tid: string) => {
                          const teacher = staff.find(s => s.uid === tid);
                          return (
                            <span key={tid} className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-bold">
                              {teacher?.displayName || tid.slice(-6)}
                            </span>
                          );
                        })}
                      </div>
                      <select 
                        className="bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:text-white w-full max-w-[200px]"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) handleAssignTeacher(student.id, e.target.value);
                        }}
                      >
                        <option value="">Add Teacher...</option>
                        {staff.filter(s => s.role === 'teacher').map(teacher => (
                          <option key={teacher.uid} value={teacher.uid}>
                            {teacher.displayName || teacher.email}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => deleteStudent(student.id)}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                          title="Delete Student"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button className="text-xs font-bold text-blue-600 hover:underline">View Details</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400 italic">
                      No students found in this school.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'submissions' ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-bottom border-slate-100 dark:border-slate-800">
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Student</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Teacher</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Homework</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {submissions.map((sub) => {
                const teacher = staff.find(s => s.uid === sub.teacherId);
                return (
                  <tr key={sub.id}>
                    <td className="p-4 font-bold text-slate-900 dark:text-white">{sub.studentName}</td>
                    <td className="p-4 text-xs text-slate-600 dark:text-slate-400">
                      {teacher?.displayName || 'Not Assigned'}
                    </td>
                    <td className="p-4 text-slate-600 dark:text-slate-400">{sub.title}</td>
                    <td className="p-4 text-xs text-slate-500">{sub.submittedAt?.toDate()?.toLocaleString() || 'Pending...'}</td>
                    <td className="p-4 text-right">
                      {sub.fileUrl && (
                        <a href={sub.fileUrl} target="_blank" rel="noreferrer" className="text-blue-600 font-bold text-xs hover:underline">View File</a>
                      )}
                    </td>
                  </tr>
                );
              })}
              {submissions.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400 italic text-sm">No submissions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'messenger' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden h-[600px] flex flex-col">
              <div className="flex-1 overflow-hidden">
                <ContactList 
                  onSelect={(c) => setSelectedContact({ uid: c.uid, displayName: c.displayName } as any)} 
                  selectedId={selectedContact?.uid} 
                />
              </div>
              <div className="p-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => {
                    if (selectedContact) {
                      setSelectedContactForFeedback({ uid: selectedContact.uid, name: selectedContact.displayName || '' });
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
                    <p className="text-[10px] text-slate-400 uppercase font-black">{selectedContact.role}</p>
                  </div>
                  <div className="flex-1">
                    <Chat receiverId={selectedContact.uid} receiverName={selectedContact.displayName || 'User'} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-12 text-center flex-1">
                  <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                    <MessageSquare className="w-8 h-8 text-slate-300" />
                  </div>
                  <h4 className="font-bold text-slate-900 dark:text-white mb-2">Your Messages</h4>
                  <p className="text-sm text-slate-500 max-w-xs">Select a teacher or parent from the list to start a conversation.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'requests' ? (
        <div className="space-y-4">
          {requests.map((req) => (
            <div key={req.id} className={`bg-white dark:bg-slate-900 p-6 rounded-3xl border shadow-sm transition-all ${req.status === 'unread' ? 'border-blue-200 dark:border-blue-900' : 'border-slate-100 dark:border-slate-800 opacity-75'}`}>
              <div className="flex justify-between items-start">
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-600 dark:text-slate-400 font-bold">
                    {req.displayName?.[0] || 'V'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 dark:text-white">{req.displayName}</h4>
                      <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 text-[10px] font-black uppercase rounded-full">
                        {req.requestedRole}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">{req.email}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl italic">
                      "{req.message}"
                    </p>
                    {req.fileUrl && (
                      <a 
                        href={req.fileUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="mt-2 flex items-center gap-2 text-xs text-blue-600 font-bold hover:underline"
                      >
                        <FileText className="w-3 h-3" />
                        View Verification File
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-2 justify-end">
                    <Clock className="w-3 h-3" />
                    {req.createdAt?.toDate().toLocaleString()}
                  </div>
                  {req.status === 'unread' ? (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleRejectRequest(req.id)}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleApproveRequest(req)}
                        className="p-2 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-400 uppercase text-right">Processed</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {requests.length === 0 && (
            <div className="text-center py-20 text-slate-400 italic">No access requests for this school.</div>
          )}
        </div>
      ) : null}
      <FeedbackModal 
        isOpen={activeTab === 'feedback'}
        onClose={() => setActiveTab('messenger')}
        toUid={selectedContactForFeedback?.uid || ''}
        toName={selectedContactForFeedback?.name || ''}
      />
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, doc, updateDoc, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Announcement, UserProfile } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Megaphone, Users, Calendar, CheckCircle2, X, Clock, FileText, MessageSquare } from 'lucide-react';
import { Chat } from '../Chat';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';

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
  const [activeTab, setActiveTab] = useState<'announcements' | 'staff' | 'requests' | 'messenger'>('announcements');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [parents, setParents] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<VisitorMessage[]>([]);
  const [selectedContact, setSelectedContact] = useState<UserProfile | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingTeacher, setIsAddingTeacher] = useState(false);
  const [teacherEmail, setTeacherEmail] = useState('');
  const [addTeacherStatus, setAddTeacherStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

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
      setStaff(snapshot.docs.map(doc => doc.data() as UserProfile));
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
      setParents(snapshot.docs.map(doc => doc.data() as UserProfile));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users', user || undefined);
    });

    return () => {
      unsubscribeAnn();
      unsubscribeStaff();
      unsubscribeRequests();
      unsubscribeParents();
    };
  }, [profile?.schoolId]);

  const handleApproveRequest = async (request: VisitorMessage) => {
    if (!profile?.schoolId) return;
    try {
      await updateDoc(doc(db, 'users', request.uid), {
        role: request.requestedRole,
        schoolId: profile.schoolId,
        status: 'active',
        updatedAt: serverTimestamp()
      });
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

  const handleAddAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.schoolId) return;

    try {
      await addDoc(collection(db, 'announcements'), {
        schoolId: profile.schoolId,
        title: newTitle,
        content: newContent,
        createdAt: serverTimestamp()
      });
      setNewTitle('');
      setNewContent('');
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'announcements', user || undefined);
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

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">School Management</h2>
          <p className="text-slate-500 dark:text-slate-400">Manage teachers, announcements, and permissions</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 dark:shadow-none"
          >
            <Plus className="w-4 h-4" />
            New Announcement
          </button>
        </div>
      </header>

      <div className="flex gap-6 border-b border-slate-100 dark:border-slate-800 mb-8">
        <button 
          onClick={() => setActiveTab('announcements')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative ${
            activeTab === 'announcements' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Announcements
          {activeTab === 'announcements' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('staff')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative ${
            activeTab === 'staff' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Staff Management
          {activeTab === 'staff' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('requests')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative flex items-center gap-2 ${
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
          className={`pb-4 px-2 text-sm font-bold transition-all relative ${
            activeTab === 'messenger' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Messenger
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
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl font-semibold"
                >
                  Post Announcement
                </button>
              </div>
            </motion.form>
          )}

          <div className="space-y-4">
            {announcements.map((ann) => (
              <div key={ann.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">{ann.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-4">{ann.content}</p>
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
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              School Staff
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
                  <div className="flex gap-2">
                    {member.status === 'pending' && (
                      <button 
                        onClick={() => handleApproveRequest({ uid: member.uid, id: '', email: member.email, displayName: member.displayName || '', requestedRole: member.role || 'teacher', message: '', createdAt: null, status: 'unread' })}
                        className="text-xs font-bold text-emerald-600 hover:underline"
                      >
                        Activate
                      </button>
                    )}
                    <button className="text-xs font-bold text-blue-600 hover:underline">View Profile</button>
                  </div>
                </div>
              </div>
            ))}
            {staff.length === 0 && !isAddingTeacher && (
              <div className="col-span-full text-center py-20 text-slate-400 italic">No staff members registered yet.</div>
            )}
          </div>
        </div>
      ) : activeTab === 'messenger' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 px-2">Staff</h3>
              <div className="space-y-1">
                {staff.map(t => (
                  <button
                    key={t.uid}
                    onClick={() => setSelectedContact(t)}
                    className={`w-full text-left p-3 rounded-xl text-sm transition-all ${
                      selectedContact?.uid === t.uid 
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 font-bold' 
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {t.displayName || t.email}
                  </button>
                ))}
              </div>

              <h3 className="text-xs font-bold text-slate-400 uppercase mt-6 mb-4 px-2">Parents</h3>
              <div className="space-y-1">
                {parents.map(p => (
                  <button
                    key={p.uid}
                    onClick={() => setSelectedContact(p)}
                    className={`w-full text-left p-3 rounded-xl text-sm transition-all ${
                      selectedContact?.uid === p.uid 
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 font-bold' 
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {p.displayName || p.email}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden min-h-[500px]">
              {selectedContact ? (
                <div className="flex flex-col h-full">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <h4 className="font-bold text-slate-900 dark:text-white">{selectedContact.displayName}</h4>
                    <p className="text-[10px] text-slate-400 uppercase font-black">{selectedContact.role}</p>
                  </div>
                  <div className="flex-1">
                    <Chat receiverId={selectedContact.uid} receiverName={selectedContact.displayName || 'User'} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-12 text-center">
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
    </div>
  );
};

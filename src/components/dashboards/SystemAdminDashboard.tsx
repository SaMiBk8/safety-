import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, query, orderBy, deleteDoc, setDoc, arrayUnion, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { UserProfile, School } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, UserX, UserCheck, Search, MessageSquare, Clock, CheckCircle2, X, FileText, Trash2, Users, Plus, AlertCircle, Info } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';

interface VisitorMessage {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  requestedRole: string;
  message: string;
  fileName?: string | null;
  createdAt: any;
  status: 'unread' | 'read';
}

import { Chat } from '../Chat';
import { PrivateMessaging } from '../PrivateMessaging';

export const SystemAdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [messages, setMessages] = useState<VisitorMessage[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'pending' | 'messages' | 'schools' | 'relationships' | 'feedbacks' | 'private_chat'>('users');
  const [schools, setSchools] = useState<School[]>([]);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [isAddingSchool, setIsAddingSchool] = useState(false);
  const [newSchool, setNewSchool] = useState({ name: '', address: '', adminEmail: '' });
  const [isCreatingSchool, setIsCreatingSchool] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [chatUser, setChatUser] = useState<{ uid: string, name: string } | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isCleaningMessages, setIsCleaningMessages] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [showCleanupMessagesConfirm, setShowCleanupMessagesConfirm] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<any | null>(null);
  const [selectedUserForDetails, setSelectedUserForDetails] = useState<any | null>(null);
  const [unreadPrivateCount, setUnreadPrivateCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'messages'),
      where('receiverId', '==', user.uid),
      where('isRead', '==', false)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadPrivateCount(snapshot.size);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userList = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile));
      setUsers(userList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users', user || undefined);
    });

    const messagesQ = query(collection(db, 'visitor_messages'), orderBy('createdAt', 'desc'));
    const unsubscribeMessages = onSnapshot(messagesQ, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VisitorMessage)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'visitor_messages', user || undefined);
    });

    const schoolsQ = query(collection(db, 'schools'));
    const unsubscribeSchools = onSnapshot(schoolsQ, (snapshot) => {
      setSchools(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as School)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'schools', user || undefined);
    });

    const feedbacksQ = query(collection(db, 'feedbacks'), orderBy('createdAt', 'desc'));
    const unsubscribeFeedbacks = onSnapshot(feedbacksQ, (snapshot) => {
      setFeedbacks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'feedbacks', user || undefined);
    });

    return () => {
      unsubscribe();
      unsubscribeMessages();
      unsubscribeSchools();
      unsubscribeFeedbacks();
    };
  }, []);

  const markMessageRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'visitor_messages', id), { status: 'read' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `visitor_messages/${id}`, user || undefined);
    }
  };

  const toggleUserStatus = async (uid: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'blocked' : 'active';
    try {
      await updateDoc(doc(db, 'users', uid), { status: newStatus });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`, user || undefined);
    }
  };

  const ensureStudentRecord = async (childUid: string, name: string, schoolId: string, parentUid?: string) => {
    try {
      const q = query(collection(db, 'students'), where('childUid', '==', childUid));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        const studentRef = doc(collection(db, 'students'));
        await setDoc(studentRef, {
          id: studentRef.id,
          childUid,
          name,
          schoolId: schoolId || '',
          parentUid: parentUid || '',
          grade: 'Not Assigned',
          teacherIds: [],
          createdAt: serverTimestamp()
        });
        console.log('Created new student record for:', childUid);
      } else if (parentUid || schoolId) {
        const updates: any = {};
        if (parentUid) updates.parentUid = parentUid;
        if (schoolId) updates.schoolId = schoolId;
        
        await updateDoc(doc(db, 'students', snap.docs[0].id), updates);
        console.log('Updated student record for:', childUid);
      }
    } catch (error) {
      console.error('Error ensuring student record:', error);
    }
  };

  const approveUser = async (uid: string) => {
    try {
      const userToApprove = users.find(u => u.uid === uid);
      const updates: any = { status: 'active' };
      if (userToApprove?.requestedRole) {
        updates.role = userToApprove.requestedRole;
      }
      await updateDoc(doc(db, 'users', uid), updates);
      
      const updatedRole = userToApprove?.requestedRole || userToApprove?.role;
      if (updatedRole === 'child') {
        await ensureStudentRecord(uid, userToApprove?.displayName || userToApprove?.email || 'Student', userToApprove?.schoolId || '');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`, user || undefined);
    }
  };

  const updateUserRole = async (uid: string, newRole: string) => {
    try {
      const userToUpdate = users.find(u => u.uid === uid);
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      
      if (newRole === 'child') {
        await ensureStudentRecord(uid, userToUpdate?.displayName || userToUpdate?.email || 'Student', userToUpdate?.schoolId || '');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`, user || undefined);
    }
  };

  const cleanupAccounts = async () => {
    setIsCleaning(true);
    try {
      const nonAdmins = users.filter(u => u.role !== 'system_admin');
      const deletePromises = nonAdmins.flatMap(u => [
        deleteDoc(doc(db, 'users', u.uid)),
        // We can't easily query all collections here without multiple calls, 
        // but let's at least clear their visitor messages
      ]);
      await Promise.all(deletePromises);

      // Clear visitor messages for all deleted users
      const msgSnap = await getDocs(collection(db, 'visitor_messages'));
      const msgDeletes = msgSnap.docs.map(d => deleteDoc(d.ref));
      await Promise.all(msgDeletes);

      setShowCleanupConfirm(false);
      setSelectedUserIds([]);
      alert('All non-admin accounts and visitor requests have been cleared.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'users', user || undefined);
    } finally {
      setIsCleaning(false);
    }
  };

  const cleanupMessages = async () => {
    setIsCleaningMessages(true);
    try {
      const messagesSnap = await getDocs(collection(db, 'messages'));
      const deletePromises = messagesSnap.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);
      setShowCleanupMessagesConfirm(false);
      alert('All chat messages have been deleted.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'messages', user || undefined);
    } finally {
      setIsCleaningMessages(false);
    }
  };

  const deleteSelectedUsers = async () => {
    if (selectedUserIds.length === 0) return;
    
    const idsToDelete = selectedUserIds.filter(id => id !== user?.uid);
    if (idsToDelete.length === 0) {
      alert('You cannot delete your own account.');
      return;
    }

    console.log('Attempting to delete selected users:', idsToDelete);
    if (!window.confirm(`Are you sure you want to permanently delete ${idsToDelete.length} accounts? This action cannot be undone.`)) return;
    
    setIsDeletingSelected(true);
    try {
      for (const uid of idsToDelete) {
        await deleteDoc(doc(db, 'users', uid));
        
        // Delete their visitor messages
        const msgQuery = query(collection(db, 'visitor_messages'), where('uid', '==', uid));
        const msgSnap = await getDocs(msgQuery);
        const msgDeletes = msgSnap.docs.map(d => deleteDoc(d.ref));
        await Promise.all(msgDeletes);
      }
      
      console.log('Successfully deleted selected users and their data');
      setSelectedUserIds([]);
      alert(`Successfully deleted ${idsToDelete.length} accounts and their related data.`);
    } catch (error) {
      console.error('Delete selected users failed:', error);
      handleFirestoreError(error, OperationType.DELETE, 'users', user || undefined);
    } finally {
      setIsDeletingSelected(false);
    }
  };

  const deleteUser = async (uid: string) => {
    if (uid === user?.uid) {
      alert('You cannot delete your own account.');
      return;
    }
    
    console.log('Attempting to delete user:', uid);
    if (!uid) {
      console.error('No UID provided for deletion');
      return;
    }
    if (!window.confirm('Are you sure you want to permanently delete this account? This action cannot be undone.')) return;
    try {
      // Delete user document
      await deleteDoc(doc(db, 'users', uid));
      
      // Delete their visitor messages
      const msgQuery = query(collection(db, 'visitor_messages'), where('uid', '==', uid));
      const msgSnap = await getDocs(msgQuery);
      const msgDeletes = msgSnap.docs.map(d => deleteDoc(d.ref));
      await Promise.all(msgDeletes);

      console.log('Successfully deleted user and related data:', uid);
      alert('Account and related data successfully deleted.');
    } catch (error) {
      console.error('Delete user failed:', error);
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}`, user || undefined);
    }
  };

  const toggleSelectUser = (uid: string) => {
    setSelectedUserIds(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const toggleSelectAll = () => {
    if (selectedUserIds.length === filteredUsers.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(filteredUsers.map(u => u.uid));
    }
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingSchool(true);
    try {
      // Find admin user by email
      const adminUser = users.find(u => u.email.toLowerCase() === newSchool.adminEmail.toLowerCase());
      if (!adminUser) {
        alert('User with this email not found. They must sign up first.');
        return;
      }

      const schoolRef = doc(collection(db, 'schools'));
      await setDoc(schoolRef, {
        id: schoolRef.id,
        name: newSchool.name,
        address: newSchool.address,
        adminId: adminUser.uid
      });

      // Update admin user role and schoolId
      await updateDoc(doc(db, 'users', adminUser.uid), {
        role: 'school_admin',
        schoolId: schoolRef.id
      });

      setNewSchool({ name: '', address: '', adminEmail: '' });
      setIsAddingSchool(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'schools', user || undefined);
    } finally {
      setIsCreatingSchool(false);
    }
  };

  const deleteSchool = async (id: string) => {
    if (!confirm('Are you sure you want to delete this school?')) return;
    try {
      await deleteDoc(doc(db, 'schools', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `schools/${id}`, user || undefined);
    }
  };

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">System Administration</h2>
          <p className="text-slate-500 dark:text-slate-400">Manage platform accounts and security</p>
        </div>
        <div className="flex items-center gap-4">
          {selectedUserIds.length > 0 && (
            <button 
              onClick={deleteSelectedUsers}
              disabled={isDeletingSelected}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {isDeletingSelected ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <UserX className="w-4 h-4" />
              )}
              Delete Selected ({selectedUserIds.length})
            </button>
          )}
          <button 
            onClick={() => setShowCleanupConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors"
          >
            <UserX className="w-4 h-4" />
            Delete All Non-Admins
          </button>
          <button 
            onClick={() => setShowCleanupMessagesConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl text-sm font-bold hover:bg-amber-100 transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            Delete All Messages
          </button>
          <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-2xl">
            <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      </header>

      <div className="flex gap-4 border-b border-slate-100 dark:border-slate-800 overflow-x-auto whitespace-nowrap pb-px scrollbar-hide">
        <button 
          onClick={() => setActiveTab('users')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative shrink-0 ${
            activeTab === 'users' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          User Management
          {activeTab === 'users' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('pending')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative flex items-center gap-2 shrink-0 ${
            activeTab === 'pending' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Inscription Requests
          {users.filter(u => u.status === 'pending').length > 0 && (
            <span className="px-1.5 py-0.5 bg-amber-500 text-white text-[10px] rounded-full">
              {users.filter(u => u.status === 'pending').length}
            </span>
          )}
          {activeTab === 'pending' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('messages')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative flex items-center gap-2 shrink-0 ${
            activeTab === 'messages' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Visitor Requests
          {(messages.filter(m => m.status === 'unread').length > 0 || unreadPrivateCount > 0) && (
            <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full animate-bounce">
              {messages.filter(m => m.status === 'unread').length + unreadPrivateCount}
            </span>
          )}
          {activeTab === 'messages' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('schools')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative flex items-center gap-2 shrink-0 ${
            activeTab === 'schools' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          School Management
          {activeTab === 'schools' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('relationships')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative flex items-center gap-2 shrink-0 ${
            activeTab === 'relationships' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Relationships
          {activeTab === 'relationships' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('feedbacks')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative flex items-center gap-2 shrink-0 ${
            activeTab === 'feedbacks' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          User Feedback
          {activeTab === 'feedbacks' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('private_chat')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative flex items-center gap-2 shrink-0 ${
            activeTab === 'private_chat' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Private Chat
          {unreadPrivateCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full animate-bounce">
              {unreadPrivateCount}
            </span>
          )}
          {activeTab === 'private_chat' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
      </div>

      {activeTab === 'private_chat' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6"
        >
          <PrivateMessaging />
        </motion.div>
      )}

      {activeTab === 'users' ? (
        <>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search accounts by email or name..." 
              className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-bottom border-slate-100 dark:border-slate-800">
                  <th className="p-4 w-10">
                    <input 
                      type="checkbox" 
                      checked={selectedUserIds.length === filteredUsers.length && filteredUsers.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">User</th>
                  <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Requested Role</th>
                  <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Current Role</th>
                  <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {filteredUsers.filter(u => u.status !== 'pending').map((user) => (
                  <motion.tr 
                    layout
                    key={user.uid} 
                    className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors ${
                      selectedUserIds.includes(user.uid) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                    }`}
                  >
                    <td className="p-4">
                      <input 
                        type="checkbox" 
                        checked={selectedUserIds.includes(user.uid)}
                        onChange={() => toggleSelectUser(user.uid)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-400 font-bold">
                          {user.displayName?.[0] || user.email[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">{user.displayName || 'No Name'}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      {user.requestedRole ? (
                        <span className="px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg text-[10px] font-black uppercase tracking-wider">
                          {user.requestedRole}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700 text-[10px] uppercase font-bold">None</span>
                      )}
                    </td>
                    <td className="p-4">
                      <select 
                        value={user.role || ''} 
                        onChange={(e) => updateUserRole(user.uid, e.target.value)}
                        className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-full text-xs font-bold capitalize outline-none border-none cursor-pointer"
                      >
                        <option value="visitor">Visitor</option>
                        <option value="system_admin">System Admin</option>
                        <option value="school_admin">School Staff</option>
                        <option value="teacher">Teacher</option>
                        <option value="quran_teacher">Quran Teacher</option>
                        <option value="sports_coach">Sports Coach</option>
                        <option value="parent">Parent</option>
                        <option value="child">Child</option>
                        <option value="authorized_person">Authorized Person</option>
                      </select>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                        user.status === 'active' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {user.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => toggleUserStatus(user.uid, user.status)}
                          className={`p-2 rounded-lg transition-colors ${
                            user.status === 'active' ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                          }`}
                          title={user.status === 'active' ? 'Block User' : 'Unblock User'}
                        >
                          {user.status === 'active' ? <UserX className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
                        </button>
                        <button 
                          onClick={() => deleteUser(user.uid)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Delete Account"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : activeTab === 'pending' ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-bottom border-slate-100 dark:border-slate-800">
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">User</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Requested Role</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Message</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {users.filter(u => u.status === 'pending').map((user) => (
                <tr key={user.uid} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-400 font-bold">
                        {user.displayName?.[0] || user.email[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{user.displayName || 'No Name'}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg text-[10px] font-black uppercase tracking-wider">
                      {user.requestedRole || 'visitor'}
                    </span>
                  </td>
                  <td className="p-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate">{user.requestMessage || 'No message'}</p>
                    {user.fileUrl && (
                      <div className="mt-1">
                        <a 
                          href={user.fileUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline"
                        >
                          <FileText className="w-3 h-3" /> {user.fileName || 'View Verification'}
                        </a>
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-right flex items-center justify-end gap-2">
                    <button 
                      onClick={() => setSelectedUserForDetails(user)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="View Details"
                    >
                      <Info className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => approveUser(user.uid)}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors"
                    >
                      Approve
                    </button>
                    <button 
                      onClick={() => toggleUserStatus(user.uid, 'active')}
                      className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors"
                    >
                      Block
                    </button>
                  </td>
                </tr>
              ))}
              {users.filter(u => u.status === 'pending').length === 0 && (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-slate-400 italic">No pending inscription requests.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'relationships' ? (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-6 uppercase tracking-tight">Link Parent to Child</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase px-1">Parent Email</label>
                <input 
                  type="email" 
                  id="parentEmail"
                  placeholder="parent@email.com" 
                  className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase px-1">Child Email</label>
                <input 
                  type="email" 
                  id="childEmail"
                  placeholder="child@email.com" 
                  className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
              </div>
            </div>
            <button 
              onClick={async () => {
                const pEmail = (document.getElementById('parentEmail') as HTMLInputElement).value.toLowerCase();
                const cEmail = (document.getElementById('childEmail') as HTMLInputElement).value.toLowerCase();
                if (!pEmail || !cEmail) return;

                try {
                  const pUser = users.find(u => u.email.toLowerCase() === pEmail && u.role === 'parent');
                  const cUser = users.find(u => u.email.toLowerCase() === cEmail && u.role === 'child');

                  if (!pUser || !cUser) {
                    alert('Parent or Child not found with these emails and roles.');
                    return;
                  }

                  await updateDoc(doc(db, 'users', pUser.uid), {
                    childIds: arrayUnion(cUser.uid),
                    updatedAt: serverTimestamp()
                  });

                  await updateDoc(doc(db, 'users', cUser.uid), {
                    parentId: pUser.uid,
                    updatedAt: serverTimestamp()
                  });

                  await ensureStudentRecord(cUser.uid, cUser.displayName || cUser.email, cUser.schoolId || '', pUser.uid);

                  alert('Successfully linked parent and child.');
                  (document.getElementById('parentEmail') as HTMLInputElement).value = '';
                  (document.getElementById('childEmail') as HTMLInputElement).value = '';
                } catch (error) {
                  console.error(error);
                  alert('Failed to link accounts.');
                }
              }}
              className="mt-6 px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 dark:shadow-none hover:bg-blue-700 transition-all"
            >
              Link Accounts
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-bottom border-slate-100 dark:border-slate-800">
                  <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Parent</th>
                  <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Children</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {users.filter(u => u.role === 'parent').map(parent => (
                  <tr key={parent.uid}>
                    <td className="p-4">
                      <div className="font-bold text-slate-900 dark:text-white">{parent.displayName || parent.email}</div>
                      <div className="text-xs text-slate-500">{parent.email}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        {parent.childIds?.map(childId => {
                          const child = users.find(u => u.uid === childId);
                          return (
                            <span key={childId} className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-bold">
                              {child?.displayName || child?.email || childId}
                            </span>
                          );
                        })}
                        {(!parent.childIds || parent.childIds.length === 0) && (
                          <span className="text-slate-300 italic text-xs">No children linked</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'messages' ? (
        <div className="space-y-4">
          {messages.map((msg) => (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              key={msg.id}
              className={`bg-white dark:bg-slate-900 p-6 rounded-3xl border shadow-sm flex gap-6 ${
                msg.status === 'unread' ? 'border-blue-200 dark:border-blue-900' : 'border-slate-100 dark:border-slate-800'
              }`}
            >
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center shrink-0">
                <MessageSquare className="w-6 h-6 text-slate-400" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white">{msg.displayName}</h4>
                    <p className="text-xs text-slate-500">{msg.email}</p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-black uppercase tracking-wider">
                      Requested: {msg.requestedRole}
                    </span>
                    <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1 mt-1">
                      <Clock className="w-3 h-3" />
                      {msg.createdAt?.toDate().toLocaleString()}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 italic">"{msg.message}"</p>
                {msg.fileName && (
                  <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 w-fit">
                    <FileText className="w-4 h-4 text-slate-400" />
                    {msg.fileUrl ? (
                      <a 
                        href={msg.fileUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[10px] font-bold text-blue-600 hover:underline"
                      >
                        {msg.fileName}
                      </a>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-500">{msg.fileName}</span>
                    )}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button 
                    onClick={() => setSelectedUserForDetails({ ...msg, registrationMessage: msg.message })}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors border border-slate-100 dark:border-slate-800"
                    title="View Details"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setChatUser({ uid: msg.uid, name: msg.displayName })}
                    className="flex items-center gap-1 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-bold hover:bg-blue-100 transition-colors"
                  >
                    <MessageSquare className="w-3 h-3" /> Chat with Visitor
                  </button>
                  {msg.status === 'unread' && (
                    <>
                      <button 
                        onClick={() => {
                          updateUserRole(msg.uid, msg.requestedRole);
                          markMessageRead(msg.id);
                        }}
                        className="flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 transition-colors"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Approve Role
                      </button>
                      <button 
                        onClick={() => markMessageRead(msg.id)}
                        className="flex items-center gap-1 px-3 py-1 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg text-[10px] font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                      >
                        Mark Read
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
          {messages.length === 0 && (
            <div className="text-center py-20 text-slate-400 italic">No visitor requests yet.</div>
          )}
        </div>
      ) : activeTab === 'feedbacks' ? (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-bottom border-slate-100 dark:border-slate-800">
                  <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">From</th>
                  <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">To</th>
                  <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rating</th>
                  <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Comment</th>
                  <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {feedbacks.map((fb) => (
                  <tr 
                    key={fb.id} 
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedFeedback(fb)}
                  >
                    <td className="p-4">
                      <div className="font-bold text-slate-900 dark:text-white text-sm">{fb.fromName}</div>
                      <div className="text-[10px] text-slate-400">{fb.fromUid}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-slate-900 dark:text-white text-sm">{fb.toName}</div>
                      <div className="text-[10px] text-slate-400">{fb.toUid}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Shield 
                            key={star}
                            className={`w-3 h-3 ${star <= fb.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200 dark:text-slate-700'}`} 
                          />
                        ))}
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xs">{fb.comment}</p>
                    </td>
                    <td className="p-4">
                      <div className="text-[10px] text-slate-400">
                        {fb.createdAt?.toDate().toLocaleString()}
                      </div>
                    </td>
                  </tr>
                ))}
                {feedbacks.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-slate-400 italic">No feedback submitted yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-900 dark:text-white">Registered Schools ({schools.length})</h3>
            <button 
              onClick={() => setIsAddingSchool(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
            >
              Add New School
            </button>
          </div>

          {isAddingSchool && (
            <motion.form 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleCreateSchool}
              className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-blue-100 dark:border-slate-800 shadow-sm space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input 
                  type="text" 
                  placeholder="School Name" 
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  value={newSchool.name}
                  onChange={(e) => setNewSchool({...newSchool, name: e.target.value})}
                  required
                />
                <input 
                  type="email" 
                  placeholder="Admin Email (User must exist)" 
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  value={newSchool.adminEmail}
                  onChange={(e) => setNewSchool({...newSchool, adminEmail: e.target.value})}
                  required
                />
              </div>
              <input 
                type="text" 
                placeholder="School Address" 
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                value={newSchool.address}
                onChange={(e) => setNewSchool({...newSchool, address: e.target.value})}
                required
              />
              <div className="flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAddingSchool(false)}
                  className="px-4 py-2 text-slate-500 dark:text-slate-400 font-semibold"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isCreatingSchool}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl font-semibold disabled:opacity-50"
                >
                  {isCreatingSchool ? 'Creating...' : 'Create School'}
                </button>
              </div>
            </motion.form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {schools.map((school) => {
              const admin = users.find(u => u.uid === school.adminId);
              return (
                <div key={school.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white">{school.name}</h4>
                    <p className="text-xs text-slate-500 mb-2">{school.address}</p>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-[10px] font-bold text-blue-600">
                        {admin?.displayName?.[0] || 'A'}
                      </div>
                      <span className="text-xs text-slate-600 dark:text-slate-400">Admin: {admin?.displayName || admin?.email || 'Unknown'}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => deleteSchool(school.id)}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Cleanup Confirmation Modal */}
      <AnimatePresence>
        {showCleanupConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isCleaning && setShowCleanupConfirm(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden p-8"
            >
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
                  <UserX className="w-8 h-8 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Dangerous Action</h3>
                <p className="text-slate-500 dark:text-slate-400">
                  This will permanently delete all accounts that are not System Administrators. This action cannot be undone.
                </p>
                <div className="flex gap-3 pt-4">
                  <button 
                    disabled={isCleaning}
                    onClick={() => setShowCleanupConfirm(false)}
                    className="flex-1 px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-bold hover:bg-slate-200 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={isCleaning}
                    onClick={cleanupAccounts}
                    className="flex-1 px-6 py-3 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isCleaning ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      'Delete All'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cleanup Messages Confirmation Modal */}
      <AnimatePresence>
        {showCleanupMessagesConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isCleaningMessages && setShowCleanupMessagesConfirm(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden p-8"
            >
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto">
                  <MessageSquare className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Delete All Messages?</h3>
                <p className="text-slate-500 dark:text-slate-400">
                  This will permanently delete all chat history across the entire platform. This action cannot be undone.
                </p>
                <div className="flex gap-3 pt-4">
                  <button 
                    disabled={isCleaningMessages}
                    onClick={() => setShowCleanupMessagesConfirm(false)}
                    className="flex-1 px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-bold hover:bg-slate-200 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={isCleaningMessages}
                    onClick={cleanupMessages}
                    className="flex-1 px-6 py-3 bg-amber-600 text-white rounded-2xl font-bold hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isCleaningMessages ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      'Delete All'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Feedback Detail Modal */}
      <AnimatePresence>
        {selectedFeedback && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedFeedback(null)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden p-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Feedback Details</h3>
                <button onClick={() => setSelectedFeedback(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>
              
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                    <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">From</span>
                    <div className="font-bold text-slate-900 dark:text-white">{selectedFeedback.fromName}</div>
                    <div className="text-[10px] text-slate-500 truncate">{selectedFeedback.fromUid}</div>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                    <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">To</span>
                    <div className="font-bold text-slate-900 dark:text-white">{selectedFeedback.toName}</div>
                    <div className="text-[10px] text-slate-500 truncate">{selectedFeedback.toUid}</div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                  <span className="text-[10px] font-black text-slate-400 uppercase block mb-2">Rating</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Shield 
                        key={star}
                        className={`w-5 h-5 ${star <= selectedFeedback.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200 dark:text-slate-700'}`} 
                      />
                    ))}
                  </div>
                </div>

                <div className="p-6 bg-blue-50 dark:bg-blue-900/10 rounded-3xl border border-blue-100 dark:border-blue-900/30">
                  <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase block mb-2">Comment</span>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed italic">
                    "{selectedFeedback.comment}"
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400 justify-end">
                  <Clock className="w-4 h-4" />
                  {selectedFeedback.createdAt?.toDate().toLocaleString()}
                </div>

                <button 
                  onClick={() => setSelectedFeedback(null)}
                  className="w-full py-4 bg-slate-900 dark:bg-slate-800 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all"
                >
                  Close Detail
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Chat Modal */}
      <AnimatePresence>
        {chatUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setChatUser(null)}
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
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">Chat with {chatUser.name}</h3>
                  <button onClick={() => setChatUser(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>
                <div className="h-[400px] bg-slate-50 dark:bg-slate-800 rounded-3xl overflow-hidden">
                  <Chat receiverId={chatUser.uid} receiverName={chatUser.name} />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedUserForDetails && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setSelectedUserForDetails(null)} />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              className="relative bg-white dark:bg-slate-900 w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center p-8 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-600">
                    {selectedUserForDetails.displayName?.[0] || 'U'}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">{selectedUserForDetails.displayName || 'User Details'}</h3>
                    <p className="text-sm text-slate-500">{selectedUserForDetails.email}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedUserForDetails(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X /></button>
              </div>
              <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                    <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Requested Role</div>
                    <div className="font-bold text-slate-900 dark:text-white capitalize">{selectedUserForDetails.requestedRole || 'None'}</div>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                    <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Status</div>
                    <div className="font-bold text-slate-900 dark:text-white capitalize">{selectedUserForDetails.status}</div>
                  </div>
                </div>
                {selectedUserForDetails.registrationMessage && (
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Registration Message</h4>
                    <div className="p-6 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-[2rem] text-slate-600 dark:text-slate-300 leading-relaxed italic">
                      "{selectedUserForDetails.registrationMessage}"
                    </div>
                  </div>
                )}
                {selectedUserForDetails.fileUrl && (
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Attached Document</h4>
                    <a 
                      href={selectedUserForDetails.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-100 dark:border-blue-900/20 hover:bg-blue-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white dark:bg-slate-900 rounded-xl flex items-center justify-center">
                          <FileText className="w-5 h-5" />
                        </div>
                        <span className="font-bold">View Document</span>
                      </div>
                      <FileText className="w-4 h-4" />
                    </a>
                  </div>
                )}
              </div>
              <div className="p-8 bg-slate-50 dark:bg-slate-800/50 flex gap-4">
                <button 
                  onClick={() => {
                    approveUser(selectedUserForDetails.uid);
                    setSelectedUserForDetails(null);
                  }}
                  className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-200 dark:shadow-none"
                >
                  Approve User
                </button>
                <button 
                  onClick={() => setSelectedUserForDetails(null)}
                  className="px-8 py-4 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-sm uppercase tracking-widest border border-slate-100 dark:border-slate-700"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

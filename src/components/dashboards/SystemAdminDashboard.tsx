import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, query, orderBy, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { UserProfile, School } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, UserX, UserCheck, Search, MessageSquare, Clock, CheckCircle2, X, FileText } from 'lucide-react';
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

export const SystemAdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [messages, setMessages] = useState<VisitorMessage[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'messages' | 'schools'>('users');
  const [schools, setSchools] = useState<School[]>([]);
  const [isAddingSchool, setIsAddingSchool] = useState(false);
  const [newSchool, setNewSchool] = useState({ name: '', address: '', adminEmail: '' });
  const [isCreatingSchool, setIsCreatingSchool] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [chatUser, setChatUser] = useState<{ uid: string, name: string } | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userList = snapshot.docs.map(doc => doc.data() as UserProfile);
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

    return () => {
      unsubscribe();
      unsubscribeMessages();
      unsubscribeSchools();
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

  const updateUserRole = async (uid: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`, user || undefined);
    }
  };

  const cleanupAccounts = async () => {
    setIsCleaning(true);
    try {
      const nonAdmins = users.filter(u => u.role !== 'system_admin');
      const deletePromises = nonAdmins.map(u => deleteDoc(doc(db, 'users', u.uid)));
      await Promise.all(deletePromises);
      setShowCleanupConfirm(false);
      setSelectedUserIds([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'users', user || undefined);
    } finally {
      setIsCleaning(false);
    }
  };

  const deleteSelectedUsers = async () => {
    if (selectedUserIds.length === 0) return;
    setIsDeletingSelected(true);
    try {
      const deletePromises = selectedUserIds.map(uid => deleteDoc(doc(db, 'users', uid)));
      await Promise.all(deletePromises);
      setSelectedUserIds([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'users', user || undefined);
    } finally {
      setIsDeletingSelected(false);
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
            Cleanup All Non-Admins
          </button>
          <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-2xl">
            <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      </header>

      <div className="flex gap-4 border-b border-slate-100 dark:border-slate-800">
        <button 
          onClick={() => setActiveTab('users')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative ${
            activeTab === 'users' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          User Management
          {activeTab === 'users' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('messages')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative flex items-center gap-2 ${
            activeTab === 'messages' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Visitor Requests
          {messages.filter(m => m.status === 'unread').length > 0 && (
            <span className="w-2 h-2 bg-red-500 rounded-full" />
          )}
          {activeTab === 'messages' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('schools')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative flex items-center gap-2 ${
            activeTab === 'schools' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          School Management
          {activeTab === 'schools' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
      </div>

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
                {filteredUsers.map((user) => (
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
                        <option value="school_admin">School Admin</option>
                        <option value="teacher">Teacher</option>
                        <option value="parent">Parent</option>
                        <option value="child">Child</option>
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
                      <button 
                        onClick={() => toggleUserStatus(user.uid, user.status)}
                        className={`p-2 rounded-lg transition-colors ${
                          user.status === 'active' ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                        }`}
                        title={user.status === 'active' ? 'Block User' : 'Unblock User'}
                      >
                        {user.status === 'active' ? <UserX className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
                        Cleaning...
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
    </div>
  );
};

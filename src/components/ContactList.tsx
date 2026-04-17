import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, getDocs, orderBy, getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { UserProfile, Student } from '../types';
import { Search, User, MessageSquare } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

interface Contact {
  uid: string;
  displayName: string;
  role: string;
  email: string;
  studentName?: string;
  unreadCount?: number;
}

interface ContactListProps {
  onSelect: (contact: Contact) => void;
  selectedId?: string;
}

export const ContactList: React.FC<ContactListProps> = ({ onSelect, selectedId }) => {
  const { profile, user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!profile?.uid) return;

    const q = query(
      collection(db, 'messages'),
      where('receiverId', '==', profile.uid),
      where('isRead', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        counts[data.senderId] = (counts[data.senderId] || 0) + 1;
      });
      setUnreadCounts(counts);
    });

    return () => unsubscribe();
  }, [profile?.uid]);

  useEffect(() => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }

    const fetchContacts = async () => {
      try {
        let contactList: Contact[] = [];
        
        // Fetch recent chat participants
        const messagesQ = query(
          collection(db, 'messages'),
          where('participants', 'array-contains', profile.uid),
          orderBy('createdAt', 'desc')
        );
        const messagesSnap = await getDocs(messagesQ);
        const recentParticipantIds = Array.from(new Set(
          messagesSnap.docs.flatMap(doc => doc.data().participants).filter(id => id !== profile.uid)
        )) as string[];

        const recentParticipantsSnap = await Promise.all(
          recentParticipantIds.map(id => getDoc(doc(db, 'users', id)))
        );
        
        const recentContacts: Contact[] = recentParticipantsSnap
          .filter(d => d.exists())
          .map(d => {
            const data = d.data();
            return {
              uid: d.id,
              displayName: data?.displayName || data?.email || 'User',
              role: data?.role || 'user',
              email: data?.email || ''
            };
          });

        if ((profile.role === 'school_admin' || profile.role === 'system_admin') && profile.schoolId) {
          // Admins see everyone in the school
          const q = query(collection(db, 'users'), where('schoolId', '==', profile.schoolId));
          const snap = await getDocs(q);
          const allUsers = snap.docs
            .map(doc => ({ uid: doc.id, ...doc.data() } as any))
            .filter(u => u.uid !== profile.uid)
            .map(u => ({
              uid: u.uid,
              displayName: u.displayName || u.email,
              role: u.role,
              email: u.email
            }));
          contactList = allUsers;
        } else if ((profile.role === 'teacher' || profile.role === 'quran_teacher' || profile.role === 'sports_coach') && profile.schoolId) {
          // Teachers see parents of their students and other staff
          const studentsQ = query(collection(db, 'students'), where('schoolId', '==', profile.schoolId));
          const studentsSnap = await getDocs(studentsQ);
          const studentData = studentsSnap.docs.map(d => d.data() as Student);
          
          const parentIds = Array.from(new Set(studentData.map(s => s.parentUid).filter(Boolean))) as string[];
          
          const staffQ = query(
            collection(db, 'users'), 
            where('schoolId', '==', profile.schoolId),
            where('role', 'in', ['teacher', 'quran_teacher', 'sports_coach', 'school_admin'])
          );
          const staffSnap = await getDocs(staffQ);
          
          const staffList = staffSnap.docs
            .map(doc => ({ uid: doc.id, ...doc.data() } as any))
            .filter(u => u.uid !== profile.uid)
            .map(u => ({
              uid: u.uid,
              displayName: u.displayName || u.email,
              role: u.role,
              email: u.email
            }));

          const parentsSnap = await Promise.all(parentIds.map(id => getDoc(doc(db, 'users', id))));
          const parentsList = parentsSnap
            .filter(d => d.exists())
            .map(doc => {
              const data = doc.data();
              const student = studentData.find(s => s.parentUid === doc.id);
              return {
                uid: doc.id,
                displayName: data?.displayName || data?.email || 'Parent',
                role: 'parent',
                email: data?.email || '',
                studentName: student?.name
              };
            });

          const childrenList = studentData
            .filter(s => s.childUid)
            .map(s => ({
              uid: s.childUid!,
              displayName: s.name,
              role: 'child',
              email: ''
            }));

          contactList = [...staffList, ...parentsList, ...childrenList];
        } else if (profile.role === 'parent') {
          // Parents see teachers of their children, school admin, and their own children
          const studentsQ = query(collection(db, 'students'), where('parentUid', '==', profile.uid));
          const studentsSnap = await getDocs(studentsQ);
          const studentData = studentsSnap.docs.map(d => d.data() as Student);
          
          const teacherIds = Array.from(new Set(studentData.flatMap(s => s.teacherIds || []).filter(Boolean))) as string[];
          
          const teachersSnap = await Promise.all(teacherIds.map(id => getDoc(doc(db, 'users', id))));
          const teachersList = teachersSnap
            .filter(d => d.exists())
            .map(doc => {
              const data = doc.data();
              return {
                uid: doc.id,
                displayName: data?.displayName || data?.email || 'Teacher',
                role: data?.role || 'teacher',
                email: data?.email || ''
              };
            });

          let adminList: Contact[] = [];
          if (profile.schoolId) {
            const adminQ = query(collection(db, 'users'), where('schoolId', '==', profile.schoolId), where('role', '==', 'school_admin'));
            const adminSnap = await getDocs(adminQ);
            adminList = adminSnap.docs.map(doc => {
              const data = doc.data();
              return {
                uid: doc.id,
                displayName: data.displayName || data.email,
                role: 'school_admin',
                email: data.email
              };
            });
          }

          const childrenList = studentData
            .filter(s => s.childUid)
            .map(s => ({
              uid: s.childUid!,
              displayName: s.name,
              role: 'child',
              email: ''
            }));

          contactList = [...teachersList, ...adminList, ...childrenList];
        } else if (profile.role === 'child') {
          // Children see their teacher and their parent
          const studentsQ = query(collection(db, 'students'), where('childUid', '==', profile.uid));
          const studentsSnap = await getDocs(studentsQ);
          if (!studentsSnap.empty) {
            const student = studentsSnap.docs[0].data() as Student;
            let teacherList: Contact[] = [];
            let parentList: Contact[] = [];

            if (student.teacherIds && student.teacherIds.length > 0) {
              const teacherDocs = await Promise.all(student.teacherIds.map(id => getDoc(doc(db, 'users', id))));
              teacherList = teacherDocs
                .filter(d => d.exists())
                .map(d => {
                  const data = d.data()!;
                  return {
                    uid: d.id,
                    displayName: data.displayName || data.email,
                    role: data.role,
                    email: data.email
                  };
                });
            }

            if (student.parentUid) {
              const parentDoc = await getDoc(doc(db, 'users', student.parentUid));
              if (parentDoc.exists()) {
                const data = parentDoc.data();
                parentList = [{
                  uid: parentDoc.id,
                  displayName: data.displayName || data.email,
                  role: 'parent',
                  email: data.email
                }];
              }
            }
            contactList = [...parentList];
          }
        }

        // Merge and deduplicate
        const merged = [...recentContacts, ...contactList];
        const unique = Array.from(new Map(merged.map(c => [c.uid, c])).values());
        setContacts(unique);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'users', user || undefined);
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();
  }, [profile?.schoolId, profile?.role, profile?.uid]);

  const filteredContacts = contacts.filter(c => 
    c.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.studentName && c.studentName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) return <div className="p-8 text-center text-slate-400 animate-pulse">Loading contacts...</div>;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search contacts..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredContacts.map(contact => (
          <button
            key={contact.uid}
            onClick={() => onSelect(contact)}
            className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${
              selectedId === contact.uid 
                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-800' 
                : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-transparent'
            } border`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
              contact.role === 'school_admin' ? 'bg-amber-100 text-amber-600' :
              contact.role === 'parent' ? 'bg-purple-100 text-purple-600' :
              'bg-blue-100 text-blue-600'
            }`}>
              {contact.displayName[0].toUpperCase()}
            </div>
            <div className="text-left flex-1 min-w-0">
              <div className="font-bold text-slate-900 dark:text-white truncate text-sm flex items-center gap-2">
                {contact.displayName}
                {unreadCounts[contact.uid] > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full animate-bounce">
                    {unreadCounts[contact.uid]}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-slate-400 truncate">
                  {contact.role.replace('_', ' ')}
                </span>
                {contact.studentName && (
                  <span className="text-[10px] text-blue-500 font-bold truncate">
                    • {contact.studentName}'s Parent
                  </span>
                )}
              </div>
            </div>
            <MessageSquare className={`w-4 h-4 ${selectedId === contact.uid ? 'text-blue-600' : 'text-slate-300'}`} />
          </button>
        ))}
        {filteredContacts.length === 0 && (
          <div className="py-12 text-center">
            <User className="w-12 h-12 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400 italic">No contacts found</p>
          </div>
        )}
      </div>
    </div>
  );
};

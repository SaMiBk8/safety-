import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, doc, updateDoc, orderBy, getDocs, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Announcement, UserProfile } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Megaphone, Users, Calendar, CheckCircle2, X, Clock, FileText, MessageSquare, GraduationCap, Trash2, Info, Star, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Chat } from '../Chat';
import { ContactList } from '../ContactList';
import { PrivateMessaging } from '../PrivateMessaging';
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
  const [activeTab, setActiveTab] = useState<'announcements' | 'staff' | 'students' | 'requests' | 'messenger' | 'submissions' | 'schedules' | 'activity' | 'meetings' | 'inscriptions'>('announcements');
  const [selectedContactForFeedback, setSelectedContactForFeedback] = useState<{ uid: string, name: string } | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [globalAnnouncements, setGlobalAnnouncements] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [parents, setParents] = useState<UserProfile[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [requests, setRequests] = useState<VisitorMessage[]>([]);
  const [inscriptionRequests, setInscriptionRequests] = useState<any[]>([]);
  const [activityPermissions, setActivityPermissions] = useState<any[]>([]);
  const [meetingRequests, setMeetingRequests] = useState<any[]>([]);
  const [isAddingActivity, setIsAddingActivity] = useState(false);
  const [newActivity, setNewActivity] = useState({ type: '', description: '', startDate: '', endDate: '' });
  const [selectedContact, setSelectedContact] = useState<UserProfile | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingTeacher, setIsAddingTeacher] = useState(false);
  const [isAddingSchedule, setIsAddingSchedule] = useState(false);
  const [newScheduleDay, setNewScheduleDay] = useState('Monday');
  const [newScheduleStart, setNewScheduleStart] = useState('');
  const [newScheduleEnd, setNewScheduleEnd] = useState('');
  const [newScheduleSubject, setNewScheduleSubject] = useState('');
  const [newScheduleTeacher, setNewScheduleTeacher] = useState('');
  const [newScheduleTeacherUid, setNewScheduleTeacherUid] = useState('');
  const [newScheduleGrade, setNewScheduleGrade] = useState('');
  const [annUploadProgress, setAnnUploadProgress] = useState<number | null>(null);

  const [selectedUserDetail, setSelectedUserDetail] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
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

    const globalQ = query(collection(db, 'global_announcements'), orderBy('createdAt', 'desc'));
    const unsubscribeGlobal = onSnapshot(globalQ, (snapshot) => {
      setGlobalAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isGlobal: true })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'global_announcements', user || undefined);
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

    const schQ = query(
      collection(db, 'schedules'),
      where('schoolId', '==', profile.schoolId)
    );
    const unsubscribeSch = onSnapshot(schQ, (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'schedules', user || undefined);
    });

    const inscQ = query(
      collection(db, 'inscription_requests'),
      where('schoolId', '==', profile.schoolId),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeInsc = onSnapshot(inscQ, (snapshot) => {
      setInscriptionRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inscription_requests', user || undefined);
    });

    const actQ = query(
      collection(db, 'activity_permissions'),
      where('schoolId', '==', profile.schoolId),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeAct = onSnapshot(actQ, (snapshot) => {
      setActivityPermissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'activity_permissions', user || undefined);
    });

    const meetQ = query(
      collection(db, 'meeting_requests'),
      where('schoolId', '==', profile.schoolId),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeMeet = onSnapshot(meetQ, (snapshot) => {
      setMeetingRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'meeting_requests', user || undefined);
    });

    return () => {
      unsubscribeAnn();
      unsubscribeGlobal();
      unsubscribeStaff();
      unsubscribeRequests();
      unsubscribeParents();
      unsubscribeStudents();
      unsubscribeSub();
      unsubscribeSch();
      unsubscribeInsc();
      unsubscribeAct();
      unsubscribeMeet();
    };
  }, [profile?.schoolId]);

  // Self-Cleaning Logic for Expired Content
  useEffect(() => {
    if (!profile?.schoolId) return;
    
    const cleanupExpired = async () => {
      const now = new Date();
      
      // Clean up announcements
      announcements.forEach(async (ann) => {
        if (ann.deadline) {
          const deadlineDate = (ann.deadline as any).toDate ? (ann.deadline as any).toDate() : new Date(ann.deadline);
          if (deadlineDate < now) {
            try {
              await deleteDoc(doc(db, 'announcements', ann.id));
              console.log(`Deleted expired announcement: ${ann.id}`);
            } catch (e) {
              console.error(`Error deleting expired announcement ${ann.id}:`, e);
            }
          }
        }
      });

      // Clean up assignments
      // We need to fetch assignments first as they aren't in state yet for admin
      try {
        const assignQ = query(
          collection(db, 'assignments'),
          where('schoolId', '==', profile.schoolId)
        );
        const assignSnap = await getDocs(assignQ);
        assignSnap.docs.forEach(async (d) => {
          const data = d.data();
          if (data.deadline) {
            const deadlineDate = data.deadline.toDate ? data.deadline.toDate() : new Date(data.deadline);
            if (deadlineDate < now) {
              await deleteDoc(d.ref);
              console.log(`Deleted expired assignment: ${d.id}`);
            }
          }
        });
      } catch (e) {
        console.error("Error cleaning up assignments:", e);
      }
    };

    // Run cleanup periodically or on mount
    cleanupExpired();
  }, [announcements.length, profile?.schoolId]);

  const performCascadingDelete = async (uid: string) => {
    const collectionsToCleanup = [
      { name: 'visitor_messages', field: 'uid' },
      { name: 'students', field: 'childUid' },
      { name: 'students', field: 'parentUid' },
      { name: 'sos_alerts', field: 'childUid' },
      { name: 'sos_alerts', field: 'parentUid' },
      { name: 'assignments', field: 'teacherId' },
      { name: 'homework_submissions', field: 'studentId' },
      { name: 'homework_submissions', field: 'childUid' },
      { name: 'homework_submissions', field: 'teacherId' },
      { name: 'attendance', field: 'studentId' },
      { name: 'attendance', field: 'teacherId' },
      { name: 'grades', field: 'studentId' },
      { name: 'grades', field: 'teacherId' },
      { name: 'quran_progress', field: 'studentId' },
      { name: 'quran_progress', field: 'teacherId' },
      { name: 'sports_training', field: 'studentId' },
      { name: 'sports_training', field: 'teacherId' },
      { name: 'incidents', field: 'studentId' },
      { name: 'incidents', field: 'teacherId' },
      { name: 'messages', field: 'senderId' },
      { name: 'messages', field: 'receiverId' },
      { name: 'calls', field: 'callerId' },
      { name: 'calls', field: 'receiverId' },
      { name: 'schedules', field: 'teacherUid' },
      { name: 'schedules', field: 'teacherId' }
    ];

    const deletePromises = collectionsToCleanup.map(async (cfg) => {
      try {
        const q = query(collection(db, cfg.name), where(cfg.field, '==', uid));
        const snap = await getDocs(q);
        const docsToDelete = snap.docs.map(d => deleteDoc(d.ref));
        await Promise.all(docsToDelete);
      } catch (e) {
        console.warn(`Could not cleanup collection ${cfg.name}:`, e);
      }
    });

    await Promise.all(deletePromises);

    // Cleanup references in other users
    try {
      // 1. If this was a parent, clear parentId for all children
      const childrenQuery = query(collection(db, 'users'), where('parentId', '==', uid));
      const childrenSnap = await getDocs(childrenQuery);
      const childUpdates = childrenSnap.docs.map(d => updateDoc(d.ref, { parentId: null }));
      await Promise.all(childUpdates);

      // 2. If this was a child, remove from parent's childIds
      const parentsQuery = query(collection(db, 'users'), where('childIds', 'array-contains', uid));
      const parentsSnap = await getDocs(parentsQuery);
      const parentUpdates = parentsSnap.docs.map(d => {
        const data = d.data();
        const newChildIds = (data.childIds || []).filter((id: string) => id !== uid);
        return updateDoc(d.ref, { childIds: newChildIds });
      });
      await Promise.all(parentUpdates);
    } catch (e) {
      console.warn("Could not cleanup user references:", e);
    }
    
    await deleteDoc(doc(db, 'users', uid));
  };

  const deleteUser = async (uid: string) => {
    if (uid === user?.uid) {
      toast.error('You cannot delete your own account.');
      return;
    }
    if (!window.confirm('Are you sure you want to permanently delete this account and ALL its associated information (messages, assignments, homework, etc)? This action cannot be undone.')) return;
    
    const toastId = toast.loading('Deleting account and purging all related data...');
    try {
      await performCascadingDelete(uid);
      toast.success('Account and all related data deleted successfully.', { id: toastId });
    } catch (error) {
      console.error('Delete user failed:', error);
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}`, user || undefined);
      toast.error('Deletion failed', { id: toastId });
    }
  };

  const deleteStudent = async (studentId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this student record? This action cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'students', studentId));
      toast.success('Student record successfully deleted.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `students/${studentId}`, user || undefined);
    }
  };

  const deleteSubmission = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this submission record?')) return;
    try {
      await deleteDoc(doc(db, 'homework_submissions', id));
      toast.success('Submission record deleted.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `homework_submissions/${id}`, user || undefined);
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

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.schoolId) return;
    try {
      const teacher = staff.find(s => s.uid === newScheduleTeacherUid);
      await addDoc(collection(db, 'schedules'), {
        schoolId: profile.schoolId,
        day: newScheduleDay,
        startTime: newScheduleStart,
        endTime: newScheduleEnd,
        subject: newScheduleSubject,
        teacherName: teacher?.displayName || newScheduleTeacher,
        teacherUid: newScheduleTeacherUid || null,
        grade: newScheduleGrade,
        updatedAt: serverTimestamp()
      });
      setNewScheduleStart('');
      setNewScheduleEnd('');
      setNewScheduleSubject('');
      setNewScheduleTeacher('');
      setNewScheduleTeacherUid('');
      setNewScheduleGrade('');
      setIsAddingSchedule(false);
      toast.success("Schedule entry added!");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'schedules', user || undefined);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!window.confirm('Delete this schedule entry?')) return;
    try {
      await deleteDoc(doc(db, 'schedules', id));
      toast.success("Schedule entry removed.");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `schedules/${id}`, user || undefined);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await deleteDoc(doc(db, 'announcements', id));
      toast.success("Announcement deleted.");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `announcements/${id}`, user || undefined);
    }
  };

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.schoolId) return;
    try {
      // For each student in the school, create a permission request
      const studentsInSchool = students.filter(s => s.schoolId === profile.schoolId);
      const promises = studentsInSchool.map(student => 
        addDoc(collection(db, 'activity_permissions'), {
          schoolId: profile.schoolId,
          childId: student.childUid,
          studentId: student.id,
          ...newActivity,
          status: 'pending',
          createdAt: serverTimestamp()
        })
      );
      await Promise.all(promises);
      setNewActivity({ type: '', description: '', startDate: '', endDate: '' });
      setIsAddingActivity(false);
      toast.success("Activity permission requests sent to parents!");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'activity_permissions', user || undefined);
    }
  };

  const handleMeetingAction = async (id: string, status: 'scheduled' | 'cancelled' | 'completed', date?: string) => {
    try {
      const updateData: any = { status, updatedAt: serverTimestamp() };
      if (date) updateData.date = new Date(date);
      await updateDoc(doc(db, 'meeting_requests', id), updateData);
      toast.success(`Meeting ${status}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `meeting_requests/${id}`, user || undefined);
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

  const handleUpdateInscriptionStatus = async (id: string, status: 'verified' | 'validated' | 'refused') => {
    try {
      await updateDoc(doc(db, 'inscription_requests', id), {
        status,
        updatedAt: serverTimestamp()
      });
      toast.success(`Request marked as ${status}`);
    } catch (error) {
       console.error("Transcription error:", error);
    }
  };

  const handleAddAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.schoolId) return;

    setUploading(true);
    setAnnUploadProgress(0);
    const toastId = toast.loading("Posting announcement...");
    try {
      let fileUrl = '';
      let fileName = '';

      if (selectedFile) {
        const storageRef = ref(storage, `announcements/${profile.schoolId}/${Date.now()}_${selectedFile.name}`);
        const uploadTask = uploadBytesResumable(storageRef, selectedFile);
        
        fileUrl = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            uploadTask.cancel();
            reject(new Error("Upload timed out after 10 minutes."));
          }, 600000);

          uploadTask.on('state_changed', 
            (snap) => setAnnUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
            (error: any) => {
              clearTimeout(timeout);
              if (error.code === 'storage/retry-limit-exceeded') {
                reject(new Error("Connection lost multiple times. Please check your internet."));
              } else {
                reject(error);
              }
            }, 
            async () => {
              clearTimeout(timeout);
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(url);
            }
          );
        });
        fileName = selectedFile.name;
      }

      await addDoc(collection(db, 'announcements'), {
        schoolId: profile.schoolId,
        title: newTitle,
        content: newContent,
        fileName,
        fileUrl,
        authorId: profile.uid,
        createdAt: serverTimestamp(),
        deadline: newDeadline ? new Date(newDeadline) : null
      });
      setNewTitle('');
      setNewContent('');
      setNewDeadline('');
      setSelectedFile(null);
      setIsAdding(false);
      toast.success("Announcement posted successfully!", { id: toastId });
    } catch (error: any) {
      toast.error(error.message || "Failed to post announcement", { id: toastId });
      handleFirestoreError(error, OperationType.CREATE, 'announcements', user || undefined);
    } finally {
      setUploading(false);
      setAnnUploadProgress(null);
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

  const allAnnouncements = [...globalAnnouncements, ...announcements].sort((a,b) => {
    const timeA = a.createdAt?.seconds || 0;
    const timeB = b.createdAt?.seconds || 0;
    return timeB - timeA;
  });

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

      <div className="flex gap-6 border-b border-slate-100 dark:border-slate-800 mb-8 overflow-x-auto whitespace-nowrap pb-px scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
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
        <button 
          onClick={() => setActiveTab('schedules')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative shrink-0 ${
            activeTab === 'schedules' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Schedules
          {activeTab === 'schedules' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('activity')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative shrink-0 ${
            activeTab === 'activity' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Activity Permissions
          {activeTab === 'activity' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('meetings')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative shrink-0 ${
            activeTab === 'meetings' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Meetings
          {meetingRequests.filter(r => r.status === 'pending').length > 0 && (
            <span className="w-2 h-2 bg-amber-500 rounded-full ml-1 inline-block" />
          )}
          {activeTab === 'meetings' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('inscriptions')}
          className={`pb-4 px-2 text-sm font-bold transition-all relative shrink-0 ${
            activeTab === 'inscriptions' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          Inscriptions
          {inscriptionRequests.filter(r => r.status === 'pending').length > 0 && (
            <span className="w-2 h-2 bg-blue-500 rounded-full ml-1 inline-block" />
          )}
          {activeTab === 'inscriptions' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase px-1">Attach File (Optional)</label>
                  <input 
                    type="file" 
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase px-1">Auto-Delete Deadline</label>
                  <input 
                    type="datetime-local" 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                    value={newDeadline}
                    onChange={(e) => setNewDeadline(e.target.value)}
                  />
                </div>
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
            {allAnnouncements.map((ann) => (
              <div key={ann.id} className={`p-8 rounded-[2.5rem] border shadow-sm space-y-4 transition-all ${
                ann.isGlobal 
                  ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700' 
                  : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800'
              }`}>
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                       <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                         ann.isGlobal ? 'bg-white/20 text-white' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                       }`}>
                         {ann.isGlobal ? 'Global Alert' : 'School News'}
                       </span>
                    </div>
                    <h3 className={`font-black text-xl leading-tight ${ann.isGlobal ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{ann.title}</h3>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-2 text-[10px] uppercase font-black ${ann.isGlobal ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'}`}>
                      <Clock className="w-3 h-3" />
                      {ann.createdAt?.toDate().toLocaleDateString()}
                    </div>
                    {!ann.isGlobal && (
                      <button 
                        onClick={() => handleDeleteAnnouncement(ann.id)}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                        title="Delete Announcement"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
                
                <p className={`text-sm leading-relaxed ${ann.isGlobal ? 'text-blue-50/80' : 'text-slate-600 dark:text-slate-400'}`}>{ann.content}</p>
                
                {ann.deadline && (
                  <div className={`flex items-center gap-2 p-3 rounded-2xl border text-[10px] font-black uppercase ${
                    ann.isGlobal 
                      ? 'bg-white/10 border-white/20 text-white' 
                      : 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/20 text-red-600 dark:text-red-400'
                  }`}>
                    <Clock className="w-4 h-4" />
                    Auto-Deletes At: {ann.deadline.toDate().toLocaleString()}
                  </div>
                )}

                {ann.fileUrl && (
                  <div className="pt-2">
                    <a 
                      href={ann.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-3 p-4 rounded-2xl text-xs font-black uppercase transition-all border shadow-sm ${
                        ann.isGlobal
                          ? 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                          : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800 hover:bg-blue-100'
                      }`}
                    >
                      <div className={`p-2 rounded-lg shadow-sm ${ann.isGlobal ? 'bg-white/10' : 'bg-white dark:bg-slate-900'}`}>
                        <FileText className="w-5 h-5" />
                      </div>
                      {ann.fileName || 'View Attachment'}
                    </a>
                  </div>
                )}
              </div>
            ))}
            {allAnnouncements.length === 0 && !isAdding && (
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
                    <div className="flex items-center gap-3">
                      <button 
                        type="button"
                        onClick={() => deleteUser(member.uid)}
                        className="p-3 text-red-600 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-red-300 dark:hover:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-2xl transition-all active:scale-95 shadow-sm flex items-center justify-center"
                        title="Delete Staff Member"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      <button 
                        type="button"
                        onClick={() => {
                          setSelectedUserDetail(member);
                          setIsDetailModalOpen(true);
                        }}
                        className="text-xs font-bold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        View Profile
                      </button>
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
                      <div className="flex items-center gap-2">
                        <button 
                          type="button"
                          onClick={() => {
                            setSelectedUserDetail(parent);
                            setIsDetailModalOpen(true);
                          }}
                          className="p-2.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-2xl transition-all border border-slate-100 hover:border-blue-200 dark:border-slate-800"
                          title="View Profile"
                        >
                          <Info className="w-5 h-5" />
                        </button>
                        <button 
                          type="button"
                          onClick={() => deleteUser(parent.uid)}
                          className="p-3 text-red-600 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-red-300 dark:hover:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-2xl transition-all active:scale-95 shadow-sm flex items-center justify-center"
                          title="Delete Parent"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
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

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-x-auto scrollbar-hide">
            <table className="w-full text-left border-collapse min-w-[700px]">
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
                      <div className="flex items-center gap-3">
                        <button 
                          type="button"
                          onClick={() => deleteStudent(student.id)}
                          className="p-3 text-red-600 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-red-300 dark:hover:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-2xl transition-all active:scale-95 shadow-sm flex items-center justify-center"
                          title="Delete Student Record"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        <button 
                          type="button"
                          onClick={() => {
                            setSelectedUserDetail(student);
                            setIsDetailModalOpen(true);
                          }}
                          className="text-xs font-bold text-blue-600 hover:underline"
                        >
                          View Details
                        </button>
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
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-x-auto scrollbar-hide">
          <table className="w-full text-left border-collapse min-w-[700px]">
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
                      <div className="flex items-center justify-end gap-2">
                        {sub.fileUrl && (
                          <a 
                            href={sub.fileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            referrerPolicy="no-referrer"
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-black text-[10px] uppercase rounded-lg hover:bg-blue-100 transition-all border border-blue-100 dark:border-blue-800"
                          >
                            <FileText className="w-3 h-3" />
                            View File
                          </a>
                        )}
                        <button 
                          onClick={() => deleteSubmission(sub.id)}
                          className="p-2.5 text-red-600 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-red-300 dark:hover:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-2xl transition-all active:scale-95 shadow-sm flex items-center justify-center"
                          title="Delete Submission"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
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
        <PrivateMessaging />
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
                        referrerPolicy="no-referrer"
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
      ) : activeTab === 'schedules' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xl">
              <Calendar className="w-6 h-6 text-blue-600" />
              Manage School Schedules
            </div>
            <button 
              onClick={() => setIsAddingSchedule(!isAddingSchedule)}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-100"
            >
              {isAddingSchedule ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {isAddingSchedule ? 'Close Form' : 'Add New Schedule Entry'}
            </button>
          </div>

          <AnimatePresence>
            {isAddingSchedule && (
              <motion.form 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleAddSchedule}
                className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-blue-100 dark:border-slate-800 shadow-lg space-y-4 overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Day</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      value={newScheduleDay}
                      onChange={(e) => setNewScheduleDay(e.target.value)}
                    >
                      {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Start Time</label>
                    <input 
                      type="time" 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      value={newScheduleStart}
                      onChange={(e) => setNewScheduleStart(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">End Time</label>
                    <input 
                      type="time" 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      value={newScheduleEnd}
                      onChange={(e) => setNewScheduleEnd(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Subject</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Mathematics"
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      value={newScheduleSubject}
                      onChange={(e) => setNewScheduleSubject(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Teacher</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      value={newScheduleTeacherUid}
                      onChange={(e) => setNewScheduleTeacherUid(e.target.value)}
                    >
                      <option value="">Select Teacher...</option>
                      {staff.map(s => (
                        <option key={s.uid} value={s.uid}>{s.displayName || s.email}</option>
                      ))}
                      <option value="custom">Custom Name...</option>
                    </select>
                    {newScheduleTeacherUid === 'custom' && (
                      <input 
                        type="text" 
                        placeholder="Custom Teacher's Name"
                        className="w-full mt-2 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                        value={newScheduleTeacher}
                        onChange={(e) => setNewScheduleTeacher(e.target.value)}
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Grade/Level</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 5th Grade"
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      value={newScheduleGrade}
                      onChange={(e) => setNewScheduleGrade(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button 
                    type="submit"
                    className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200"
                  >
                    Save Schedule Entry
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
              const daySchedules = schedules.filter(s => s.day === day).sort((a,b) => a.startTime.localeCompare(b.startTime));
              if (daySchedules.length === 0) return null;
              return (
                <div key={day} className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 mb-4 border-b border-slate-50 dark:border-slate-800 pb-3">
                    <div className="w-2 h-6 bg-blue-600 rounded-full" />
                    <h3 className="font-black text-lg text-slate-900 dark:text-white uppercase tracking-tighter">{day}</h3>
                  </div>
                  <div className="space-y-4">
                    {daySchedules.map((sch) => (
                      <div key={sch.id} className="group relative bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-transparent hover:border-blue-200 transition-all">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-black text-blue-600 bg-blue-50 dark:bg-blue-900/40 px-2 py-0.5 rounded-lg">
                            {sch.startTime} - {sch.endTime}
                          </span>
                          <button 
                            type="button"
                            onClick={() => handleDeleteSchedule(sch.id)}
                            className="p-3 text-red-600 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-red-300 dark:hover:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-2xl transition-all active:scale-95 shadow-sm flex items-center justify-center"
                            title="Delete Schedule Entry"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                        <h4 className="font-bold text-slate-900 dark:text-white">{sch.subject}</h4>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" /> {sch.teacherName || 'TBD'}
                          </span>
                          <span className="flex items-center gap-1">
                            <GraduationCap className="w-3 h-3" /> {sch.grade || 'All'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {schedules.length === 0 && (
              <div className="col-span-full py-20 text-center text-slate-400 italic bg-slate-50 dark:bg-slate-800/30 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-slate-800">
                No schedules configured yet. Use the button above to start adding timetable entries.
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'inscriptions' ? (
        <div className="space-y-6">
           <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
             <ClipboardCheck className="w-6 h-6 text-blue-600" />
             Detailed Inscription Requests
           </h3>
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {inscriptionRequests.map(req => (
                <div key={req.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
                   <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-400 font-bold">
                            {req.firstName?.[0]}
                         </div>
                         <div>
                            <div className="font-bold text-slate-900 dark:text-white">{req.firstName} {req.lastName}</div>
                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-tight">{req.role} Application</div>
                         </div>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                        req.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                        req.status === 'validated' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                      }`}>
                        {req.status}
                      </span>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                      <div>
                         <label className="text-[10px] font-black text-slate-400 uppercase">Birthdate</label>
                         <p className="font-bold text-slate-700 dark:text-slate-300">{req.birthday || 'N/A'}</p>
                      </div>
                      <div>
                         <label className="text-[10px] font-black text-slate-400 uppercase">Email</label>
                         <p className="font-bold text-slate-700 dark:text-slate-300">{req.email}</p>
                      </div>
                   </div>

                   {req.experience && (
                     <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase">Experience/Note</label>
                        <p className="text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                          {req.experience}
                        </p>
                     </div>
                   )}

                   {req.attachments && req.attachments.length > 0 && (
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Documents</label>
                        <div className="flex flex-wrap gap-2">
                           {req.attachments.map((att: any, idx: number) => (
                             <a key={idx} href={att.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase rounded-lg hover:underline">
                               <FileText className="w-3 h-3" />
                               {att.title || 'Doc'}
                             </a>
                           ))}
                        </div>
                     </div>
                   )}

                   {req.status === 'pending' && (
                     <div className="flex gap-2 pt-2">
                        <button 
                          onClick={() => handleUpdateInscriptionStatus(req.id, 'validated')}
                          className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold"
                        >
                          Validate
                        </button>
                        <button 
                          onClick={() => handleUpdateInscriptionStatus(req.id, 'refused')}
                          className="flex-1 py-1.5 bg-red-50 text-red-600 rounded-xl text-xs font-bold"
                        >
                          Refuse
                        </button>
                     </div>
                   )}
                </div>
              ))}
              {inscriptionRequests.length === 0 && (
                <div className="col-span-full text-center py-20 text-slate-400 italic">No detailed inscription requests.</div>
              )}
           </div>
        </div>
      ) : activeTab === 'activity' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
             <h3 className="text-xl font-bold text-slate-900 dark:text-white">Activity Permissions</h3>
             <button 
               onClick={() => setIsAddingActivity(!isAddingActivity)}
               className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold"
             >
               {isAddingActivity ? 'Cancel' : 'New Activity Request'}
             </button>
          </div>

          <AnimatePresence>
             {isAddingActivity && (
               <motion.form 
                 initial={{ opacity: 0, height: 0 }}
                 animate={{ opacity: 1, height: 'auto' }}
                 exit={{ opacity: 0, height: 0 }}
                 onSubmit={handleAddActivity}
                 className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-blue-100 dark:border-slate-800 shadow-lg space-y-4 overflow-hidden"
               >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input 
                      type="text" 
                      placeholder="Activity Title (e.g. Field Trip to Zoo)" 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      value={newActivity.type}
                      onChange={e => setNewActivity({...newActivity, type: e.target.value})}
                      required
                    />
                    <div className="flex gap-2">
                       <input 
                        type="date" 
                        className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                        value={newActivity.startDate}
                        onChange={e => setNewActivity({...newActivity, startDate: e.target.value})}
                        required
                      />
                       <input 
                        type="date" 
                        className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                        value={newActivity.endDate}
                        onChange={e => setNewActivity({...newActivity, endDate: e.target.value})}
                      />
                    </div>
                  </div>
                  <textarea 
                    placeholder="Full description of the activity and requirements..." 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px] dark:text-white"
                    value={newActivity.description}
                    onChange={e => setNewActivity({...newActivity, description: e.target.value})}
                    required
                  />
                  <div className="flex justify-end pt-2">
                     <button type="submit" className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg">Send to All Parents</button>
                  </div>
               </motion.form>
             )}
          </AnimatePresence>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {activityPermissions.map(per => {
               const child = students.find(s => s.childUid === per.childId);
               return (
                 <div key={per.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                       <h4 className="font-bold text-slate-900 dark:text-white">{per.type}</h4>
                       <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                         per.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                         per.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                       }`}>
                         {per.status}
                       </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-4">{per.description}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 border-t border-slate-50 dark:border-slate-800 pt-3">
                       <Users className="w-3 h-3" />
                       For: {child?.name || 'Unknown Student'}
                    </div>
                 </div>
               );
             })}
             {activityPermissions.length === 0 && <p className="col-span-full text-center py-20 text-slate-400 italic">No activity permission requests created yet.</p>}
          </div>
        </div>
      ) : activeTab === 'meetings' ? (
        <div className="space-y-6">
           <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
             <Users className="w-6 h-6 text-blue-600" />
             Meeting Requests
           </h3>
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {meetingRequests.map(req => {
                const parent = parents.find(p => p.uid === req.parentId);
                return (
                  <div key={req.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
                     <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 font-bold">
                              {parent?.displayName?.[0] || 'P'}
                           </div>
                           <div>
                              <div className="font-bold text-slate-900 dark:text-white">{parent?.displayName || 'Parent'}</div>
                              <div className="text-[10px] text-slate-500">{parent?.email}</div>
                           </div>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                          req.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                          req.status === 'scheduled' ? 'bg-blue-50 text-blue-600' :
                          req.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'
                        }`}>
                          {req.status}
                        </span>
                     </div>
                     <p className="text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl italic">
                       "{req.reason}"
                     </p>
                     
                     {req.status === 'pending' && (
                       <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase">Schedule Time</label>
                          <div className="flex gap-2">
                             <input 
                              type="datetime-local" 
                              id={`meet_${req.id}`}
                              className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                             />
                             <button 
                               onClick={() => {
                                 const val = (document.getElementById(`meet_${req.id}`) as HTMLInputElement)?.value;
                                 if (val) handleMeetingAction(req.id, 'scheduled', val);
                                 else toast.error("Please select a date and time");
                               }}
                               className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
                             >
                               Schedule
                             </button>
                          </div>
                       </div>
                     )}

                     {req.status === 'scheduled' && (
                       <div className="flex items-center justify-between">
                          <div className="text-xs font-bold text-blue-600 flex items-center gap-2">
                             <Clock className="w-4 h-4" />
                             {req.date?.toDate().toLocaleString()}
                          </div>
                          <button 
                            onClick={() => handleMeetingAction(req.id, 'completed')}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold"
                          >
                            Mark Completed
                          </button>
                       </div>
                     )}
                  </div>
                );
              })}
              {meetingRequests.length === 0 && <p className="col-span-full text-center py-20 text-slate-400 italic">No meeting requests from parents.</p>}
           </div>
        </div>
      ) : null}
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
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white capitalize">User Profile Details</h3>
                  <button onClick={() => setIsDetailModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>
                
                <div className="space-y-6">
                  <div className="flex items-center gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                    <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white text-3xl font-black">
                      {selectedUserDetail.name?.[0] || selectedUserDetail.displayName?.[0] || 'U'}
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-slate-900 dark:text-white">
                        {selectedUserDetail.name || selectedUserDetail.displayName || 'Unknown User'}
                      </h4>
                      <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">
                        {selectedUserDetail.role?.replace('_', ' ') || 'Student'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Email</p>
                      <p className="font-bold text-slate-900 dark:text-white truncate">{selectedUserDetail.email || 'N/A'}</p>
                    </div>
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Status</p>
                      <p className="font-bold text-emerald-600 dark:text-emerald-400 capitalize">{selectedUserDetail.status || 'Active'}</p>
                    </div>
                  </div>

                  {selectedUserDetail.grade && (
                    <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Grade / Level</p>
                      <p className="font-bold text-purple-600">{selectedUserDetail.grade}</p>
                    </div>
                  )}

                  {selectedUserDetail.subject && (
                    <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Specialization / Subject</p>
                      <p className="font-bold text-orange-600">{selectedUserDetail.subject}</p>
                    </div>
                  )}

                  <div className="pt-4 flex gap-3">
                    <button 
                      onClick={() => {
                        setSelectedContact(selectedUserDetail.uid ? selectedUserDetail : { ...selectedUserDetail, uid: selectedUserDetail.id });
                        setActiveTab('messenger');
                        setIsDetailModalOpen(false);
                      }}
                      className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg"
                    >
                      Send Message
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
    </div>
  );
};

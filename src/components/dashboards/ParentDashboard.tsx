import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, getDocs, arrayUnion, serverTimestamp, addDoc, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Student, Announcement, SOSAlert, UserProfile } from '../../types';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Bell, Phone, ShieldAlert, BookOpen, Calendar, X, MessageSquare, Plus, Info, FileText, Clock, UserCheck, ShieldCheck, Users, AlertTriangle, GraduationCap, ClipboardCheck } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';

const mapContainerStyle = { width: '100%', height: '300px' };

import { Chat } from '../Chat';
import { ContactList } from '../ContactList';
import { PrivateMessaging } from '../PrivateMessaging';
import { FeedbackModal } from '../FeedbackModal';

import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'sonner';

export const ParentDashboard: React.FC<{ onStartCall?: (channel: string, receiverId: string, receiverName: string) => void }> = ({ onStartCall }) => {
  const { user, profile } = useAuth();
  const [children, setChildren] = useState<Student[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [globalAnnouncements, setGlobalAnnouncements] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<SOSAlert[]>([]);
  const [activeModal, setActiveModal] = useState<'messenger' | 'feedback' | 'link-child' | null>(null);
  const [selectedChildForFeedback, setSelectedChildForFeedback] = useState<{ uid: string, name: string } | null>(null);
  const [mapCenters, setMapCenters] = useState<Record<string, { lat: number, lng: number }>>({});
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [childEmail, setChildEmail] = useState('');
  const [addChildStatus, setAddChildStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [selectedContact, setSelectedContact] = useState<{ uid: string, displayName: string } | null>(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [lastKnownLocations, setLastKnownLocations] = useState<Record<string, { lat: number, lng: number }>>({});
  const [authorizedPersons, setAuthorizedPersons] = useState<any[]>([]);
  const [meetingRequests, setMeetingRequests] = useState<any[]>([]);
  const [activityPermissions, setActivityPermissions] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [quranProgress, setQuranProgress] = useState<any[]>([]);
  const [sportsTraining, setSportsTraining] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [isAddingAuthPerson, setIsAddingAuthPerson] = useState(false);
  const [newAuthPerson, setNewAuthPerson] = useState({ name: '', phone: '', relationship: '' });

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
    children.forEach(child => {
      if (child.location) {
        setLastKnownLocations(prev => ({ ...prev, [child.id]: child.location }));
        if (!mapCenters[child.id]) {
          setMapCenters(prev => ({ ...prev, [child.id]: child.location }));
        }
      }
    });
  }, [children]);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ""
  });

  // Listen for children
  useEffect(() => {
    if (!profile?.uid) return;

    const q = query(collection(db, 'students'), where('parentUid', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setChildren(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students', user || undefined);
    });
    return () => unsubscribe();
  }, [profile?.uid]);

  // Parent GPS Tracking - Only if children are linked
  useEffect(() => {
    if (!profile?.uid || children.length === 0) return;

    let watchId: number;
    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          updateDoc(doc(db, 'users', profile.uid), {
            location: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              lastUpdated: serverTimestamp()
            }
          }).catch(err => console.error("Parent GPS Update Error:", err));
        },
        (error) => console.error("Parent GPS Error:", error),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [profile?.uid, children.length]);

  // Listen for SOS Alerts
  useEffect(() => {
    if (!profile?.uid) return;

    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const q = query(
      collection(db, 'sos_alerts'), 
      where('parentUid', '==', profile.uid),
      where('status', '==', 'active')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const alerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SOSAlert));
      setActiveAlerts(alerts);
      
      if (alerts.length > 0) {
        toast.error(`SOS ALERT: ${alerts.length} active emergency!`, {
          duration: 10000,
          position: 'top-center',
        });

        // Browser notification
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("EMERGENCY: SOS Alert Active!", {
            body: "Your child has triggered an SOS alert. Please check their location immediately.",
            icon: "/pwa-192x192.png",
            tag: "sos-alert",
            requireInteraction: true
          });
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sos_alerts', user || undefined);
    });
    return () => unsubscribe();
  }, [profile?.uid]);

  // Listen for global announcements
  useEffect(() => {
    const q = query(collection(db, 'global_announcements'), orderBy('createdAt', 'desc'));
    const unsubscribeGlobal = onSnapshot(q, (snapshot) => {
      setGlobalAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isGlobal: true })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'global_announcements', user || undefined);
    });
    return () => unsubscribeGlobal();
  }, [user]);

  const [files, setFiles] = useState<any[]>([]);

  useEffect(() => {
    if (!profile?.uid || children.length === 0) return;
    const schoolIds = Array.from(new Set(children.map(c => c.schoolId)));
    
    // Listen for announcements and their files
    const annQ = query(collection(db, 'announcements'), where('schoolId', 'in', schoolIds));
    const unsubscribeAnn = onSnapshot(annQ, (snapshot) => {
      const annList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement));
      setAnnouncements(annList);
      
      const annIds = annList.map(a => a.id);
      if (annIds.length > 0) {
        const filesQ = query(collection(db, 'files'), where('announcementId', 'in', annIds));
        onSnapshot(filesQ, (fSnap) => {
           setFiles(fSnap.docs.map(fd => ({ id: fd.id, ...fd.data() })));
        });
      }
    });

    const schQ = query(collection(db, 'schedules'), where('schoolId', 'in', schoolIds));
    const unsubscribeSch = onSnapshot(schQ, (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeAnn();
      unsubscribeSch();
    };
  }, [children]);

  useEffect(() => {
    if (!profile?.uid) return;

    const authQ = query(collection(db, 'authorized_persons'), where('parentId', '==', profile.uid));
    const unsubscribeAuth = onSnapshot(authQ, (snapshot) => {
      setAuthorizedPersons(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const meetQ = query(collection(db, 'meeting_requests'), where('parentId', '==', profile.uid));
    const unsubscribeMeet = onSnapshot(meetQ, (snapshot) => {
      setMeetingRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const childIds = children.map(c => c.childUid);
    const studentIds = children.map(c => c.id);
    if (childIds.length > 0) {
      const actQ = query(collection(db, 'activity_permissions'), where('childId', 'in', childIds));
      const unsubscribeAct = onSnapshot(actQ, (snapshot) => {
        setActivityPermissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      const incQ = query(collection(db, 'incidents'), where('studentId', 'in', studentIds));
      const unsubscribeInc = onSnapshot(incQ, (snapshot) => {
        setIncidents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      const quranQ = query(collection(db, 'quran_progress'), where('studentId', 'in', studentIds));
      const unsubscribeQuran = onSnapshot(quranQ, (snapshot) => {
        setQuranProgress(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      const sportsQ = query(collection(db, 'sports_training'), where('studentId', 'in', studentIds));
      const unsubscribeSports = onSnapshot(sportsQ, (snapshot) => {
        setSportsTraining(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      const attendQ = query(collection(db, 'attendance'), where('studentId', 'in', studentIds));
      const unsubscribeAttend = onSnapshot(attendQ, (snapshot) => {
        setAttendance(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      const gradesQ = query(collection(db, 'grades'), where('studentId', 'in', studentIds), orderBy('createdAt', 'desc'));
      const unsubscribeGrades = onSnapshot(gradesQ, (snapshot) => {
        setGrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      return () => {
        unsubscribeAuth();
        unsubscribeMeet();
        unsubscribeAct();
        unsubscribeInc();
        unsubscribeQuran();
        unsubscribeSports();
        unsubscribeAttend();
        unsubscribeGrades();
      };
    }

    return () => {
      unsubscribeAuth();
      unsubscribeMeet();
    };
  }, [profile?.uid, children]);

  const handleAddAuthPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid || children.length === 0) return;
    try {
      await addDoc(collection(db, 'authorized_persons'), {
        parentId: profile.uid,
        childId: children[0].childUid, // For simplicity links to first child, or could be all
        ...newAuthPerson,
        createdAt: serverTimestamp()
      });
      setNewAuthPerson({ name: '', phone: '', relationship: '' });
      setIsAddingAuthPerson(false);
      toast.success("Authorized person added successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'authorized_persons', user || undefined);
    }
  };

  const handlePermissionAction = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'activity_permissions', id), {
        status,
        updatedAt: serverTimestamp()
      });
      toast.success(`Permission ${status}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `activity_permissions/${id}`, user || undefined);
    }
  };

  const handleRequestMeeting = async () => {
    if (!profile?.uid || children.length === 0) return;
    const reason = prompt("Enter the reason for the meeting request:");
    if (!reason) return;

    try {
      await addDoc(collection(db, 'meeting_requests'), {
        parentId: profile.uid,
        schoolId: children[0].schoolId,
        reason,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      toast.success("Meeting request sent successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'meeting_requests', user || undefined);
    }
  };

  const resolveAlert = async (alertId: string) => {
    try {
      await updateDoc(doc(db, 'sos_alerts', alertId), { status: 'resolved' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `sos_alerts/${alertId}`, user || undefined);
    }
  };

  const handleAddChild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid) return;
    setAddChildStatus(null);

    try {
      // Find child by email
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', childEmail.toLowerCase()), where('role', '==', 'child'));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setAddChildStatus({ type: 'error', message: 'Child not found. Please ensure they have registered as a student first.' });
        return;
      }

      const childDoc = querySnapshot.docs[0];
      const childData = childDoc.data() as UserProfile;

      // Check if already linked
      const studentsRef = collection(db, 'students');
      const studentQ = query(studentsRef, where('childUid', '==', childDoc.id));
      const studentSnapshot = await getDocs(studentQ);

      if (studentSnapshot.empty) {
        // Create student record if it doesn't exist
        await addDoc(collection(db, 'students'), {
          childUid: childDoc.id,
          parentUid: profile.uid,
          schoolId: childData.schoolId || '',
          name: childData.displayName || 'Student',
          grade: 'Not Assigned',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        // Update existing student record
        const studentDoc = studentSnapshot.docs[0];
        await updateDoc(doc(db, 'students', studentDoc.id), {
          parentUid: profile.uid,
          updatedAt: serverTimestamp()
        });
      }

      // Update parent profile
      await updateDoc(doc(db, 'users', profile.uid), {
        childIds: arrayUnion(childDoc.id),
        updatedAt: serverTimestamp()
      });

      // Update child profile
      await updateDoc(doc(db, 'users', childDoc.id), {
        parentId: profile.uid,
        updatedAt: serverTimestamp()
      });

      setAddChildStatus({ type: 'success', message: `Successfully linked ${childData.displayName || childEmail} as your child.` });
      setChildEmail('');
      setIsAddingChild(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users/profile or users/child', user || undefined);
      setAddChildStatus({ type: 'error', message: 'Failed to link child. Please try again.' });
    }
  };

  const allAnnouncements = [...globalAnnouncements, ...announcements].sort((a,b) => {
    const timeA = a.createdAt?.toMillis() || 0;
    const timeB = b.createdAt?.toMillis() || 0;
    return timeB - timeA;
  });

  return (
    <div className="space-y-8">
      {/* SOS Alert Banner */}
      <AnimatePresence>
        {activeAlerts.map(alert => (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            key={alert.id}
            className="bg-red-600 text-white p-6 rounded-3xl shadow-2xl flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center animate-pulse">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-black text-lg uppercase tracking-tight">Emergency SOS Active!</h3>
                <p className="text-red-100 text-sm">Your child has triggered an emergency alert. Check location immediately.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => onStartCall?.(`sos_${alert.childUid}`, alert.childUid, alert.childName || 'Child')}
                className="px-6 py-2 bg-white text-red-600 rounded-xl font-bold text-sm shadow-lg"
              >
                Track Now
              </button>
              <button 
                onClick={() => resolveAlert(alert.id)}
                className="p-2 bg-red-700 hover:bg-red-800 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Parent Portal</h2>
          <p className="text-slate-500 dark:text-slate-400">Monitor your children's safety and education</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsAddingChild(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 dark:shadow-none"
          >
            <Plus className="w-4 h-4" />
            Link Child
          </button>
          <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl">
            <Bell className="w-6 h-6" />
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isAddingChild && (
          <motion.form 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleAddChild}
            className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-emerald-100 dark:border-slate-800 shadow-sm space-y-4 overflow-hidden"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center text-emerald-600">
                <Plus className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-tight">Link Your Child</h3>
                <p className="text-xs text-slate-500">Enter your child's registered student email to start tracking.</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <input 
                type="email" 
                placeholder="child@school.com" 
                className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white font-medium"
                value={childEmail}
                onChange={(e) => setChildEmail(e.target.value)}
                required
              />
            </div>
            {addChildStatus && (
              <div className={`p-4 rounded-2xl text-sm font-bold ${addChildStatus.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {addChildStatus.message}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button 
                type="button"
                onClick={() => { setIsAddingChild(false); setAddChildStatus(null); }}
                className="px-6 py-3 text-slate-500 dark:text-slate-400 font-bold"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-8 py-3 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-100 dark:shadow-none"
              >
                Link Student
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Real-time Tracking */}
          {children.length > 0 ? (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  Live Location Tracking
                </div>
                <button 
                  onClick={() => setActiveModal('link-child')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 dark:shadow-none"
                >
                  <Plus className="w-4 h-4" /> Link Child
                </button>
              </div>
              <div className="grid grid-cols-1 gap-6">
                {children.map(child => (
                  <div key={child.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center">
                      <span className="font-bold text-slate-900 dark:text-white">{child.name}</span>
                      <span className="text-xs text-emerald-500 font-bold flex items-center gap-1">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        Live Now
                      </span>
                    </div>
                    <div className="bg-slate-100 dark:bg-slate-800">
                      {isLoaded ? (
                        <GoogleMap
                          mapContainerStyle={mapContainerStyle}
                          center={child.location || lastKnownLocations[child.id] || mapCenters[child.id] || { lat: 34.0522, lng: -118.2437 }}
                          zoom={15}
                          options={{
                            disableDefaultUI: true,
                            zoomControl: true,
                          }}
                        >
                          {(child.location || lastKnownLocations[child.id]) && (
                            <Marker position={child.location || lastKnownLocations[child.id]} />
                          )}
                        </GoogleMap>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-slate-400 italic text-sm">
                          Loading Google Maps...
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex gap-2">
                      <button 
                        onClick={() => onStartCall?.(`call_${child.childUid}`, child.childUid, child.name)}
                        className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                      >
                        <Phone className="w-4 h-4" /> Call Child
                      </button>
              <button 
                onClick={() => {
                  setSelectedContact({ uid: child.childUid, displayName: child.name });
                  setActiveModal('messenger');
                }}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 relative"
              >
                <MessageSquare className="w-4 h-4" /> Message
              </button>
                      <button 
                        onClick={() => {
                          setSelectedChildForFeedback({ uid: child.childUid, name: child.name });
                          setActiveModal('feedback');
                        }}
                        className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-200 transition-all"
                        title="Give Feedback"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-12 rounded-[2.5rem] text-center space-y-6">
              <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto">
                <MapPin className="w-10 h-10 text-blue-600" />
              </div>
              <div className="max-w-xs mx-auto">
                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Setup Tracking</h3>
                <p className="text-sm text-slate-500">You haven't linked any children yet. Link your child's account to start live location tracking and safety monitoring.</p>
              </div>
              <button 
                onClick={() => setIsAddingChild(true)}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 dark:shadow-none hover:bg-blue-700 transition-all"
              >
                Link Child Now
              </button>
            </div>
          )}
        </div>

        <div className="space-y-8">
          {/* Notifications & Announcements */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
              <Bell className="w-5 h-5 text-amber-500" />
              Latest Updates
            </div>
            <div className="space-y-3">
              {allAnnouncements.map(ann => (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={ann.id} 
                  className={`p-4 rounded-2xl border shadow-sm cursor-pointer transition-all group ${
                    ann.isGlobal 
                      ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700' 
                      : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                  onClick={() => setSelectedAnnouncement(ann)}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2">
                      {ann.isGlobal && <span className="px-1.5 py-0.5 bg-white/20 text-[8px] font-black uppercase rounded">Global</span>}
                      <h4 className={`font-bold text-sm ${ann.isGlobal ? 'text-white' : 'text-slate-900 dark:text-white group-hover:text-blue-600'}`}>{ann.title}</h4>
                    </div>
                    <Info className={`w-4 h-4 ${ann.isGlobal ? 'text-white/40' : 'text-slate-300 group-hover:text-blue-600'} shrink-0`} />
                  </div>
                  <p className={`text-xs line-clamp-2 mt-1 ${ann.isGlobal ? 'text-blue-50/80' : 'text-slate-500 dark:text-slate-400'}`}>{ann.content}</p>
                  <div className={`mt-2 text-[10px] flex items-center gap-1 ${ann.isGlobal ? 'text-white/60' : 'text-slate-400 dark:text-slate-500'}`}>
                    <Clock className="w-3 h-3" />
                    {ann.createdAt?.toDate().toLocaleDateString()}
                  </div>
                </motion.div>
              ))}
              {allAnnouncements.length === 0 && <p className="text-center py-10 text-slate-400 italic text-xs">No updates yet.</p>}
            </div>
          </section>

          {/* Student Schedules */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
              <Calendar className="w-5 h-5 text-indigo-500" />
              Class Timetables
            </div>
            <div className="space-y-4 text-xs">
              {children.map(child => {
                const childSchedules = schedules.filter(s => s.schoolId === child.schoolId && (s.grade === child.grade || !s.grade));
                if (childSchedules.length === 0) return null;
                return (
                  <div key={child.id} className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                    <h4 className="font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                      {child.name}'s Schedule
                      <span className="text-[10px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 px-2 py-0.5 rounded-full">Grade {child.grade}</span>
                    </h4>
                    <div className="space-y-3">
                       {childSchedules.slice(0, 4).sort((a,b) => a.startTime.localeCompare(b.startTime)).map(sch => (
                         <div key={sch.id} className="flex justify-between items-center p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors">
                           <div>
                             <div className="font-bold text-slate-800 dark:text-slate-200">{sch.subject}</div>
                             <div className="text-[10px] text-slate-500">{sch.teacherName || 'Teacher'}</div>
                           </div>
                           <span className="font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-lg">
                             {sch.startTime}
                           </span>
                         </div>
                       ))}
                       {childSchedules.length === 0 && <p className="italic text-slate-400">No schedule available.</p>}
                    </div>
                  </div>
                );
              })}
              {children.every(c => schedules.filter(s => s.schoolId === c.schoolId).length === 0) && (
                 <div className="p-8 text-center text-slate-400 italic">No schedules posted by the school yet.</div>
              )}
            </div>
          </section>

          {/* Quick Contacts */}
          <section className="bg-blue-600 p-6 rounded-3xl text-white shadow-xl shadow-blue-100 dark:shadow-none relative">
            {unreadTotal > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-black px-2 py-1 rounded-full animate-bounce shadow-lg">
                {unreadTotal} NEW
              </span>
            )}
            <h3 className="font-bold mb-4">Messaging</h3>
            <p className="text-xs text-blue-100 mb-4">Direct messaging with teachers and school staff.</p>
            
            <button 
              onClick={() => setActiveModal('messenger')}
              className="w-full py-3 bg-white text-blue-600 rounded-xl font-bold text-sm transition-all hover:bg-blue-50"
            >
              Start Message
            </button>
          </section>

          {/* Child Status */}
          {children.length > 0 && (
            <section className="bg-emerald-50 dark:bg-emerald-900/10 p-8 rounded-[2.5rem] border border-emerald-100 dark:border-emerald-900/20">
              <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-100 mb-4">Child Status</h3>
              <div className="space-y-4">
                {children.map(child => (
                  <div key={child.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{child.name}</span>
                    </div>
                    <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase">At School</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Activity Permissions */}
          {activityPermissions.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <ShieldCheck className="w-5 h-5 text-purple-500" />
                Activity Consent
              </div>
              <div className="space-y-3">
                {activityPermissions.map(per => (
                  <div key={per.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                       <h4 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-tight">{per.type}</h4>
                       <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                         per.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                         per.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                       }`}>
                         {per.status}
                       </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">{per.description}</p>
                    {per.status === 'pending' && (
                      <div className="flex gap-2 text-xs">
                        <button 
                          onClick={() => handlePermissionAction(per.id, 'approved')}
                          className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold shadow-sm"
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => handlePermissionAction(per.id, 'rejected')}
                          className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg font-bold"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Authorized Persons */}
          <section className="space-y-4">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <UserCheck className="w-5 h-5 text-emerald-500" />
                  Authorized Pickup
                </div>
                <button 
                  onClick={() => setIsAddingAuthPerson(true)}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-emerald-600"
                >
                  <Plus className="w-5 h-5" />
                </button>
             </div>

             <AnimatePresence>
               {isAddingAuthPerson && (
                 <motion.form 
                   initial={{ opacity: 0, height: 0 }}
                   animate={{ opacity: 1, height: 'auto' }}
                   exit={{ opacity: 0, height: 0 }}
                   onSubmit={handleAddAuthPerson}
                   className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl space-y-3"
                 >
                    <input 
                      type="text" 
                      placeholder="Full Name" 
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white"
                      value={newAuthPerson.name}
                      onChange={e => setNewAuthPerson({...newAuthPerson, name: e.target.value})}
                      required
                    />
                    <div className="flex gap-2">
                       <input 
                        type="text" 
                        placeholder="Phone" 
                        className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white"
                        value={newAuthPerson.phone}
                        onChange={e => setNewAuthPerson({...newAuthPerson, phone: e.target.value})}
                        required
                      />
                       <input 
                        type="text" 
                        placeholder="Relationship" 
                        className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white"
                        value={newAuthPerson.relationship}
                        onChange={e => setNewAuthPerson({...newAuthPerson, relationship: e.target.value})}
                        required
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                       <button type="button" onClick={() => setIsAddingAuthPerson(false)} className="px-3 py-1.5 text-xs font-bold text-slate-500">Cancel</button>
                       <button type="submit" className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm">Save</button>
                    </div>
                 </motion.form>
               )}
             </AnimatePresence>

             <div className="space-y-3">
                {authorizedPersons.map(person => (
                  <div key={person.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                       <div className="font-bold text-sm text-slate-900 dark:text-white">{person.name}</div>
                       <div className="text-[10px] text-slate-500">{person.relationship} • {person.phone}</div>
                    </div>
                  </div>
                ))}
                {authorizedPersons.length === 0 && <p className="text-[10px] text-slate-400 italic text-center">No authorized pickup persons added.</p>}
             </div>
          </section>

          {/* Specialized Progress */}
          {(quranProgress.length > 0 || sportsTraining.length > 0) && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <BookOpen className="w-5 h-5 text-emerald-500" />
                Specialized Hifz & Training
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {quranProgress.map(log => (
                  <div key={log.id} className="bg-emerald-50 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/50">
                    <div className="flex justify-between items-start mb-1">
                       <span className="text-[10px] font-black text-emerald-600 uppercase">Quran Progress</span>
                       <span className="text-[10px] text-emerald-400">{log.createdAt?.toDate().toLocaleDateString()}</span>
                    </div>
                    <div className="font-bold text-sm text-slate-900 dark:text-white">Surah {log.surah}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">Verse {log.verse} • {log.status}</div>
                  </div>
                ))}
                {sportsTraining.map(log => (
                  <div key={log.id} className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/50">
                    <div className="flex justify-between items-start mb-1">
                       <span className="text-[10px] font-black text-blue-600 uppercase">Sports Drill</span>
                       <span className="text-[10px] text-blue-400">{log.createdAt?.toDate().toLocaleDateString()}</span>
                    </div>
                    <div className="font-bold text-sm text-slate-900 dark:text-white">{log.activity}</div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 italic">"{log.performance}"</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Academic Grades */}
          {grades.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <GraduationCap className="w-5 h-5 text-emerald-600" />
                Grades & Academic Reports
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {grades.map(g => {
                   const student = children.find(c => c.id === g.studentId);
                   return (
                    <div key={g.id} className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{student?.name || 'Student'} Grade</span>
                        <span className="text-[10px] text-slate-400">{g.createdAt?.toDate().toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-3xl font-black text-slate-900 dark:text-white">{g.grade}</div>
                        <div className="flex-1">
                           <div className="text-[10px] font-black uppercase text-slate-400">Behavior</div>
                           <div className={`text-xs font-bold uppercase transition-colors ${
                              g.behavior === 'excellent' ? 'text-emerald-500' :
                              g.behavior === 'good' ? 'text-blue-500' : 'text-amber-500'
                           }`}>{g.behavior}</div>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-slate-500 italic">"{g.comment}"</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Attendance Monitoring */}
          {attendance.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <ClipboardCheck className="w-5 h-5 text-purple-600" />
                Attendance & Absences
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-4 grid grid-cols-1 divide-y divide-slate-50 dark:divide-slate-800">
                  {attendance.sort((a,b) => b.date?.seconds - a.date?.seconds).slice(0, 10).map(at => {
                    const student = children.find(c => c.id === at.studentId);
                    return (
                      <div key={at.id} className="py-3 flex justify-between items-center">
                        <div>
                          <div className="font-bold text-sm text-slate-900 dark:text-white">{student?.name || 'Student'}</div>
                          <div className="text-[10px] text-slate-400">{at.date?.toDate().toLocaleString()}</div>
                        </div>
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${at.status === 'present' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                          {at.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Incident Reports */}
          {incidents.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Behavioral & Safety Reports
              </div>
              <div className="space-y-3">
                {incidents.map(inc => (
                  <div key={inc.id} className="bg-red-50 dark:bg-red-950/20 p-4 rounded-2xl border border-red-100 dark:border-red-900/30">
                    <div className="flex justify-between items-center mb-2">
                       <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                         inc.type === 'safety' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                       }`}>
                         {inc.type}
                       </span>
                       <div className="text-[10px] text-slate-400 font-bold">{inc.createdAt?.toDate().toLocaleDateString()}</div>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">"{inc.content}"</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Files & Documents */}
          {files.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <FileText className="w-5 h-5 text-blue-500" />
                Shared Documents
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {files.map(f => (
                  <a 
                    key={f.id}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-3 hover:border-blue-200 transition-all group"
                  >
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl group-hover:bg-blue-100 transition-colors">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-slate-900 dark:text-white truncate uppercase tracking-tight">{f.title || 'Untitled Document'}</div>
                      <div className="text-[10px] text-slate-400 font-medium">Click to view/download</div>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Meeting Requests */}
          <section className="space-y-4">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <Users className="w-5 h-5 text-blue-500" />
                  Staff Meetings
                </div>
                <button 
                  onClick={handleRequestMeeting}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-sm"
                >
                  Request
                </button>
             </div>
             <div className="space-y-3">
                {meetingRequests.map(req => (
                  <div key={req.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                     <div className="flex justify-between items-center mb-2">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                          req.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                          req.status === 'scheduled' ? 'bg-blue-50 text-blue-600' :
                          req.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'
                        }`}>
                          {req.status}
                        </span>
                        <div className="text-[10px] text-slate-400 uppercase font-black tracking-widest">{req.createdAt?.toDate().toLocaleDateString()}</div>
                     </div>
                     <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">{req.reason}</p>
                     {req.date && (
                       <div className="mt-2 flex items-center gap-2 text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 p-2 rounded-xl">
                          <Clock className="w-3 h-3" />
                          Scheduled: {req.date.toDate().toLocaleString()}
                       </div>
                     )}
                  </div>
                ))}
                {meetingRequests.length === 0 && <p className="text-[10px] text-slate-400 italic text-center">No meeting requests yet.</p>}
             </div>
          </section>
        </div>
      </div>

      <AnimatePresence>
        {selectedAnnouncement && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setSelectedAnnouncement(null)} />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="relative bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="bg-blue-600 p-8 text-white flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Bell className="w-6 h-6" />
                  <h3 className="text-xl font-black uppercase tracking-tight">Announcement</h3>
                </div>
                <button onClick={() => setSelectedAnnouncement(null)} className="p-2 hover:bg-white/20 rounded-xl transition-all"><X /></button>
              </div>
              <div className="p-8 space-y-6">
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Title</h4>
                  <div className="text-lg font-black text-slate-900 dark:text-white uppercase">{selectedAnnouncement.title}</div>
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Content</h4>
                  <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                    {selectedAnnouncement.content}
                  </div>
                </div>
                {files.filter(f => f.announcementId === selectedAnnouncement.id).length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Attachments</h4>
                    <div className="space-y-2">
                       {files.filter(f => f.announcementId === selectedAnnouncement.id).map(f => (
                         <a 
                          key={f.id}
                          href={f.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-2xl text-blue-600 text-xs font-bold"
                         >
                           <FileText className="w-4 h-4" />
                           {f.title}
                         </a>
                       ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <Calendar className="w-3 h-3" />
                  Posted on {selectedAnnouncement.createdAt?.toDate().toLocaleString()}
                </div>
                <button 
                  onClick={() => setSelectedAnnouncement(null)}
                  className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black uppercase tracking-widest shadow-xl"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {activeModal === 'messenger' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveModal(null)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white dark:bg-slate-900 w-full max-w-5xl h-[80vh] rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <button 
                onClick={() => setActiveModal(null)} 
                className="absolute top-6 right-6 z-[120] p-2 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-all"
              >
                <X className="w-6 h-6" />
              </button>
              <PrivateMessaging />
            </motion.div>
          </div>
        )}
        {activeModal === 'link-child' && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 dark:border-slate-800"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Link New Child</h3>
                  <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>

                <div className="space-y-6 text-center">
                  <div className="bg-slate-50 dark:bg-slate-950 p-8 rounded-3xl flex flex-col items-center gap-4">
                    <div className="bg-white p-4 rounded-2xl shadow-sm">
                      <QRCodeCanvas 
                        value={JSON.stringify({ type: 'link-parent', parentId: profile?.uid })} 
                        size={180}
                        level="H"
                        includeMargin
                      />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Ask your child to scan this QR code from their dashboard to link accounts.
                    </p>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-100 dark:border-slate-800"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white dark:bg-slate-900 px-4 text-slate-400 font-black tracking-widest">OR USE CODE</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl font-mono text-2xl font-bold tracking-widest text-blue-600 dark:text-blue-400">
                    {profile?.uid?.slice(-6).toUpperCase()}
                  </div>

                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                    Your unique parent ID
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <FeedbackModal 
        isOpen={activeModal === 'feedback'}
        onClose={() => setActiveModal(null)}
        toUid={selectedChildForFeedback?.uid || ''}
        toName={selectedChildForFeedback?.name || ''}
      />
    </div>
  );
};

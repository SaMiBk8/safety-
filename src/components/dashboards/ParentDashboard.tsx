import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, getDocs, arrayUnion, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Student, Announcement, SOSAlert, UserProfile } from '../../types';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Bell, Phone, ShieldAlert, BookOpen, Calendar, X, MessageSquare, Plus } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';

const mapContainerStyle = { width: '100%', height: '300px' };

import { Chat } from '../Chat';
import { ContactList } from '../ContactList';
import { FeedbackModal } from '../FeedbackModal';

export const ParentDashboard: React.FC<{ onStartCall?: (channel: string, receiverId: string, receiverName: string) => void }> = ({ onStartCall }) => {
  const { user, profile } = useAuth();
  const [children, setChildren] = useState<Student[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<SOSAlert[]>([]);
  const [activeModal, setActiveModal] = useState<'messenger' | 'feedback' | null>(null);
  const [selectedChildForFeedback, setSelectedChildForFeedback] = useState<{ uid: string, name: string } | null>(null);
  const [mapCenters, setMapCenters] = useState<Record<string, { lat: number, lng: number }>>({});
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [childEmail, setChildEmail] = useState('');
  const [addChildStatus, setAddChildStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [selectedContact, setSelectedContact] = useState<{ uid: string, displayName: string } | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [lastKnownLocations, setLastKnownLocations] = useState<Record<string, { lat: number, lng: number }>>({});

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

    // Parent GPS Tracking
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

    const q = query(collection(db, 'students'), where('parentUid', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setChildren(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students', user || undefined);
    });
    return () => {
      unsubscribe();
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [profile?.uid]);

  // Listen for SOS Alerts
  useEffect(() => {
    if (!profile?.uid) return;
    const q = query(
      collection(db, 'sos_alerts'), 
      where('parentUid', '==', profile.uid),
      where('status', '==', 'active')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setActiveAlerts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SOSAlert)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sos_alerts', user || undefined);
    });
    return () => unsubscribe();
  }, [profile?.uid]);

  // Listen for announcements
  useEffect(() => {
    if (children.length === 0) return;
    const schoolIds = Array.from(new Set(children.map(c => c.schoolId)));
    const q = query(collection(db, 'announcements'), where('schoolId', 'in', schoolIds));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'announcements', user || undefined);
    });
    return () => unsubscribe();
  }, [children]);

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
                onClick={() => onStartCall?.(`sos_${alert.childUid}`)}
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
          <section className="space-y-4">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
              <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Live Location Tracking
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
        </div>

        <div className="space-y-8">
          {/* Notifications & Announcements */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
              <Bell className="w-5 h-5 text-amber-500" />
              School Updates
            </div>
            <div className="space-y-3">
              {announcements.map(ann => (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={ann.id} 
                  className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm"
                >
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">{ann.title}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">{ann.content}</p>
                  <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {ann.createdAt?.toDate().toLocaleDateString()}
                  </div>
                </motion.div>
              ))}
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
        </div>
      </div>

      {/* Messenger Modal */}
      <AnimatePresence>
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
              className="relative bg-white dark:bg-slate-900 w-full max-w-4xl h-[80vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row"
            >
              <div className="w-full md:w-80 border-r border-slate-100 dark:border-slate-800 flex flex-col">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">Contacts</h3>
                  <button onClick={() => setActiveModal(null)} className="md:hidden p-2">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <ContactList 
                    onSelect={(c) => setSelectedContact({ uid: c.uid, displayName: c.displayName })} 
                    selectedId={selectedContact?.uid} 
                  />
                </div>
              </div>

              <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950/50">
                {selectedContact ? (
                  <>
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center">
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white">{selectedContact.displayName}</h4>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Active Chat</p>
                      </div>
                      <button onClick={() => setActiveModal(null)} className="hidden md:block p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <X className="w-6 h-6 text-slate-400" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <Chat receiverId={selectedContact.uid} receiverName={selectedContact.displayName} />
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                    <div className="w-16 h-16 bg-white dark:bg-slate-900 rounded-3xl shadow-sm flex items-center justify-center mb-4">
                      <MessageSquare className="w-8 h-8 text-slate-200" />
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white mb-2">Select a Contact</h4>
                    <p className="text-sm text-slate-500 max-w-xs">Choose a teacher or administrator from the list to start messaging.</p>
                  </div>
                )}
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

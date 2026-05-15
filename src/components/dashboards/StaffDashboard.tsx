import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';
import { Announcement, Student } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, MessageSquare, Clock, Users, AlertTriangle, Calendar, Info, Search, Megaphone, Plus, Trash2, FileText, X } from 'lucide-react';
import { PrivateMessaging } from '../PrivateMessaging';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { toast } from 'sonner';

export const StaffDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'announcements' | 'messenger' | 'incidents' | 'meetings'>('announcements');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [globalAnnouncements, setGlobalAnnouncements] = useState<any[]>([]);
  const [meetingRequests, setMeetingRequests] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [isAddingIncident, setIsAddingIncident] = useState(false);
  const [newIncident, setNewIncident] = useState({ studentId: '', type: 'behavior', content: '' });
  const [unreadTotal, setUnreadTotal] = useState(0);

  // Announcement state
  const [isAddingAnn, setIsAddingAnn] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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

    const annQ = query(collection(db, 'announcements'), where('schoolId', '==', profile.schoolId));
    const unsubscribeAnn = onSnapshot(annQ, (snapshot) => {
      setAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement)));
    });

    const globalQ = query(collection(db, 'global_announcements'), orderBy('createdAt', 'desc'));
    const unsubscribeGlobal = onSnapshot(globalQ, (snapshot) => {
      setGlobalAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isGlobal: true })));
    });

    const meetQ = query(collection(db, 'meeting_requests'), where('schoolId', '==', profile.schoolId));
    const unsubscribeMeet = onSnapshot(meetQ, (snapshot) => {
      setMeetingRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const incQ = query(collection(db, 'incidents'), where('schoolId', '==', profile.schoolId));
    const unsubscribeInc = onSnapshot(incQ, (snapshot) => {
      setIncidents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const studQ = query(collection(db, 'students'), where('schoolId', '==', profile.schoolId));
    const unsubscribeStud = onSnapshot(studQ, (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    });

    const fileQ = query(collection(db, 'files'));
    const unsubscribeFile = onSnapshot(fileQ, (snapshot) => {
      setFiles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeAnn();
      unsubscribeGlobal();
      unsubscribeMeet();
      unsubscribeInc();
      unsubscribeStud();
      unsubscribeFile();
    };
  }, [profile?.schoolId]);

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.schoolId || !newTitle || !newContent) return;

    const toastId = toast.loading("Posting announcement...");
    setIsUploading(true);

    try {
      let fileUrl = "";
      let fileName = "";

      if (selectedFile) {
        const fileRef = ref(storage, `announcements/${Date.now()}_${selectedFile.name}`);
        const uploadTask = uploadBytesResumable(fileRef, selectedFile);

        fileUrl = await new Promise((resolve, reject) => {
          uploadTask.on('state_changed', null, reject, async () => {
             const url = await getDownloadURL(uploadTask.snapshot.ref);
             resolve(url);
          });
        });
        fileName = selectedFile.name;
      }

      const annRef = await addDoc(collection(db, 'announcements'), {
        schoolId: profile.schoolId,
        title: newTitle,
        content: newContent,
        authorId: profile.uid,
        createdAt: serverTimestamp()
      });

      if (fileUrl) {
        await addDoc(collection(db, 'files'), {
          announcementId: annRef.id,
          title: fileName,
          url: fileUrl,
          createdAt: serverTimestamp()
        });
      }

      setNewTitle('');
      setNewContent('');
      setSelectedFile(null);
      setIsAddingAnn(false);
      toast.success("Announcement posted!", { id: toastId });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'announcements', user || undefined);
      toast.error("Failed to post", { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.schoolId || !newIncident.studentId || !newIncident.content) return;

    try {
      await addDoc(collection(db, 'incidents'), {
        ...newIncident,
        schoolId: profile.schoolId,
        staffId: profile.uid,
        staffName: profile.displayName || 'Staff',
        status: 'reported',
        createdAt: serverTimestamp()
      });
      setIsAddingIncident(false);
      setNewIncident({ studentId: '', type: 'behavior', content: '' });
      toast.success("Incident reported");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'incidents', user || undefined);
    }
  };

  const allAnnouncements = [...globalAnnouncements, ...announcements].sort((a,b) => {
    const timeA = a.createdAt?.toMillis() || 0;
    const timeB = b.createdAt?.toMillis() || 0;
    return timeB - timeA;
  });

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Staff Dashboard</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Internal coordination and school monitoring</p>
        </div>
        <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-2xl">
          <Users className="w-6 h-6 text-blue-600" />
        </div>
      </header>

      <div className="flex gap-8 border-b border-slate-100 dark:border-slate-800 mb-8 overflow-x-auto whitespace-nowrap pb-px scrollbar-hide">
        {[
          { id: 'announcements', label: 'Announcements' },
          { id: 'messenger', label: 'Messenger', badge: unreadTotal },
          { id: 'meetings', label: 'Meetings' },
          { id: 'incidents', label: 'Incidents' },
          { id: 'files', label: 'Files' },
        ].map((tab: any) => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-4 px-1 text-sm font-black transition-all relative shrink-0 flex items-center gap-2 ${
              activeTab === tab.id ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                {tab.badge}
              </span>
            )}
            {activeTab === tab.id && (
              <motion.div layoutId="tab-staff" className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-full" />
            )}
          </button>
        ))}
      </div>

      <div className="min-h-[60vh]">
        {activeTab === 'announcements' ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
               <h3 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">School Activity</h3>
               <button 
                 onClick={() => setIsAddingAnn(!isAddingAnn)}
                 className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2"
               >
                 {isAddingAnn ? 'Cancel' : <><Plus className="w-4 h-4" /> Post Announcement</>}
               </button>
            </div>

            <AnimatePresence>
              {isAddingAnn && (
                <motion.form 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleCreateAnnouncement}
                  className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-blue-100 dark:border-blue-900/30 shadow-xl space-y-4 overflow-hidden"
                >
                  <input 
                    type="text" 
                    placeholder="Announcement Title"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold dark:text-white"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    required
                  />
                  <textarea 
                    placeholder="Content details..."
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px] dark:text-white"
                    value={newContent}
                    onChange={e => setNewContent(e.target.value)}
                    required
                  />
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                      <FileText className="w-4 h-4 text-slate-500" />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                        {selectedFile ? selectedFile.name : 'Attach File'}
                      </span>
                      <input 
                        type="file" 
                        className="hidden" 
                        onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    {selectedFile && (
                      <button type="button" onClick={() => setSelectedFile(null)} className="text-red-500">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <button 
                      type="submit" 
                      disabled={isUploading}
                      className="px-8 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-200 disabled:opacity-50"
                    >
                      {isUploading ? 'Uploading...' : 'Publish Announcement'}
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {allAnnouncements.map((ann) => (
                <div key={ann.id} className={`bg-white dark:bg-slate-900 p-6 rounded-[2rem] border shadow-sm relative group ${ann.isGlobal ? 'border-amber-100 dark:border-amber-900/30 shadow-amber-50' : 'border-slate-100 dark:border-slate-800'}`}>
                  {ann.isGlobal && (
                    <div className="absolute top-4 right-4 bg-amber-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">System Wide</div>
                  )}
                  <div className="flex items-center gap-4 mb-4">
                    <div className={`p-3 rounded-2xl ${ann.isGlobal ? 'bg-amber-100 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                       {ann.isGlobal ? <Bell className="w-5 h-5 shadow-sm" /> : <Megaphone className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 dark:text-white leading-tight uppercase tracking-tight">{ann.title}</h4>
                      <p className="text-[10px] text-slate-400 font-mono italic">{ann.createdAt?.toDate().toLocaleDateString()}</p>
                    </div>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed line-clamp-3 mb-4">{ann.content}</p>
                  <div className="flex justify-between items-center mt-auto pt-4">
                    <div className="flex flex-col gap-2 w-full">
                       {files.filter(f => f.announcementId === ann.id).map(f => (
                         <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-600 font-bold text-[10px] group/file">
                           <FileText className="w-3 h-3" />
                           <span className="truncate flex-1">{f.title}</span>
                         </a>
                       ))}
                       <div className="flex justify-end pt-2">
                        {ann.authorId === profile?.uid && !ann.isGlobal && (
                          <button 
                            onClick={async () => {
                              if(!window.confirm('Delete this announcement?')) return;
                              await deleteDoc(doc(db, 'announcements', ann.id));
                              toast.success("Announcement deleted");
                            }}
                            className="p-2 text-red-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                       </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === 'messenger' ? (
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden h-[70vh]">
            <PrivateMessaging />
          </div>
        ) : activeTab === 'meetings' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {meetingRequests.map(req => (
              <div key={req.id} className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                    req.status === 'scheduled' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                  }`}>
                    {req.status}
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest">{req.createdAt?.toDate().toLocaleDateString()}</span>
                </div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2">{req.reason}</h4>
                {req.date && (
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-600 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
                    <Clock className="w-4 h-4" />
                    {req.date.toDate().toLocaleString()}
                  </div>
                )}
              </div>
            ))}
            {meetingRequests.length === 0 && <p className="col-span-full py-20 text-center text-slate-400 italic">No meeting requests for your school.</p>}
          </div>
        ) : activeTab === 'files' ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">School Documents</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Shared across announcements</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
               {files.length > 0 ? files.map(f => (
                 <a 
                  key={f.id} 
                  href={f.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center text-center gap-4 group hover:border-blue-200 transition-all"
                 >
                   <div className="p-4 bg-blue-50 dark:bg-blue-900/40 rounded-2xl group-hover:bg-blue-100 transition-colors">
                     <FileText className="w-8 h-8 text-blue-600" />
                   </div>
                   <div className="flex-1 min-w-0 w-full px-2">
                     <div className="font-black text-slate-900 dark:text-white text-xs uppercase tracking-tight truncate w-full">{f.title || 'Untitled Document'}</div>
                     <div className="text-[10px] text-slate-400 font-bold mt-1">
                       {f.createdAt?.toDate().toLocaleDateString()}
                     </div>
                   </div>
                 </a>
               )) : (
                 <div className="col-span-full py-20 text-center text-slate-400 italic">No documents shared in the school system yet.</div>
               )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">School Incident Logs</h3>
              <button 
                onClick={() => setIsAddingIncident(!isAddingIncident)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-2"
              >
                {isAddingIncident ? 'Cancel' : <><Plus className="w-4 h-4" /> Report New Incident</>}
              </button>
            </div>

            <AnimatePresence>
              {isAddingIncident && (
                <motion.form 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleAddIncident}
                  className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-blue-100 dark:border-slate-800 shadow-lg space-y-4 overflow-hidden"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      value={newIncident.studentId}
                      onChange={e => setNewIncident({...newIncident, studentId: e.target.value})}
                      required
                    >
                      <option value="">Select Student</option>
                      {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                      value={newIncident.type}
                      onChange={e => setNewIncident({...newIncident, type: e.target.value})}
                      required
                    >
                      <option value="behavior">Behavioral</option>
                      <option value="safety">Safety/Injury</option>
                      <option value="academic">Academic Concern</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <textarea 
                    placeholder="Provide a detailed description of the incident..." 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px] dark:text-white"
                    value={newIncident.content}
                    onChange={e => setNewIncident({...newIncident, content: e.target.value})}
                    required
                  />
                  <div className="flex justify-end pt-2">
                    <button type="submit" className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg">Submit Report</button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {incidents.map(inc => (
                <div key={inc.id} className="bg-red-50 dark:bg-red-950/20 p-6 rounded-[2.5rem] border border-red-100 dark:border-red-900/30 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-red-100 p-2 rounded-xl text-red-600">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-black uppercase text-red-600 tracking-widest">{inc.type}</span>
                    </div>
                    <span className="text-[10px] text-red-400 font-bold">{inc.createdAt?.toDate().toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 font-medium mb-2">"{inc.content}"</p>
                  {inc.staffName && (
                    <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">Reported by: {inc.staffName}</div>
                  )}
                </div>
              ))}
              {incidents.length === 0 && <p className="col-span-full py-20 text-center text-slate-400 italic font-medium">No safety incidents reported.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


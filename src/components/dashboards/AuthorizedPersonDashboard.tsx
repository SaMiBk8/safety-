import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Student } from '../../types';
import { motion } from 'motion/react';
import { Shield, MapPin, Clock, Phone, UserCheck, Calendar, Info } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';

export const AuthorizedPersonDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const [authorizedChildren, setAuthorizedChildren] = useState<Student[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<any>(null);

  useEffect(() => {
    if (!profile?.uid) return;
    
    // In this system, an authorized person is linked to a parent or specific students
    // For now, we'll fetch students where this person is listed as an authorized person
    // Or students belonging to the parent who authorized them
    const q = query(collection(db, 'students'), where('authorizedPickups', 'array-contains', profile.uid));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const children = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setAuthorizedChildren(children);
      
      if (children.length > 0 && children[0].schoolId) {
        getDoc(doc(db, 'schools', children[0].schoolId)).then(d => {
          if (d.exists()) setSchoolInfo(d.data());
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students', user || undefined);
    });
    
    return () => unsubscribe();
  }, [profile?.uid]);

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Authorized Person Portal</h2>
          <p className="text-slate-500 dark:text-slate-400">Secure pickup and authorization management</p>
        </div>
        <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-2xl">
          <Shield className="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <section className="space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-600" />
              Active Authorizations
            </h3>
            <div className="grid grid-cols-1 gap-4">
              {authorizedChildren.map(child => (
                <div key={child.id} className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center text-slate-400 font-bold text-xl">
                      {child.name[0]}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-tight">{child.name}</h4>
                      <p className="text-xs text-slate-500">Authorized by Parent</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 text-[10px] font-bold rounded-lg uppercase">Verified</span>
                        <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 text-[10px] font-bold rounded-lg uppercase">Pickup Allowed</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <button className="px-6 py-2 bg-slate-900 dark:bg-slate-950 text-white rounded-xl font-bold text-xs">Generate QR Code</button>
                  </div>
                </div>
              ))}
              {authorizedChildren.length === 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/50 p-12 rounded-[2.5rem] border border-dashed border-slate-200 dark:border-slate-800 text-center">
                  <Info className="w-8 h-8 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-400 italic text-sm">No active pickup authorizations found.</p>
                  <p className="text-xs text-slate-400 mt-2">Please contact the parent to add you as an authorized person.</p>
                </div>
              )}
            </div>
          </section>

          <section className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Pickup History
            </h3>
            <div className="space-y-4">
              {[
                { date: '2026-04-05', time: '15:30', child: 'Ahmed Sami', status: 'Completed' },
                { date: '2026-04-03', time: '15:45', child: 'Ahmed Sami', status: 'Completed' },
              ].map((log, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{log.child}</div>
                      <div className="text-[10px] text-slate-400">{log.date} at {log.time}</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-emerald-600 uppercase">{log.status}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {schoolInfo && (
            <div className="bg-slate-900 dark:bg-slate-950 p-8 rounded-[2.5rem] text-white shadow-xl">
              <h3 className="font-black uppercase tracking-widest text-blue-400 mb-4">School Information</h3>
              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-lg">{schoolInfo.name}</h4>
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" />
                    {schoolInfo.address}
                  </p>
                </div>
                <div className="pt-6 border-t border-white/10 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Pickup Window</span>
                    <span className="font-bold">15:00 - 16:30</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Security Level</span>
                    <span className="font-bold text-emerald-400 uppercase">High</span>
                  </div>
                </div>
                <button className="w-full py-4 bg-blue-600 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all">
                  <Phone className="w-4 h-4" />
                  Contact School Office
                </button>
              </div>
            </div>
          )}
          
          <div className="bg-amber-50 dark:bg-amber-900/10 p-6 rounded-3xl border border-amber-100 dark:border-amber-900/20">
            <h4 className="font-bold text-amber-900 dark:text-amber-100 flex items-center gap-2 mb-2">
              <Info className="w-4 h-4" />
              Security Notice
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              Always have your digital ID or QR code ready when arriving at the school gate. Pickups are only allowed during designated windows.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

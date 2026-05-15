import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSchoolAdmin: boolean;
  isTeacher: boolean;
  isQuranTeacher: boolean;
  isSportsCoach: boolean;
  isParent: boolean;
  isChild: boolean;
  isAuthorizedPerson: boolean;
  isStaff: boolean;
  isVisitor: boolean;
  isPending: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PRIMARY_ADMIN_EMAILS = ["bsami0004bsami@gmail.com", "bsami04bsami@gmail.com", "www.samibook43@gmail.com", "sbou91752@gmail.com", "mycat00101@gmail.com", "sami.boukheche.etu@centre-univ-mila.dz", "samiboo8324@gmail.com"];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const refreshProfile = async () => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      const profileRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(profileRef);
      const userEmail = user.email?.toLowerCase();
      const isPrimaryAdmin = userEmail && PRIMARY_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(userEmail);
      
      if (isPrimaryAdmin) {
        if (!docSnap.exists()) {
          await setDoc(profileRef, {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || '',
            status: 'active',
            role: 'visitor',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      }
    } catch (error) {
      console.error('Manual refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (firebaseUser) {
        const profileRef = doc(db, 'users', firebaseUser.uid);
        
        // Initial check and creation if needed
        try {
          const docSnap = await getDoc(profileRef);
          const userEmail = firebaseUser.email?.toLowerCase();
          const isPrimaryAdmin = userEmail && PRIMARY_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(userEmail);
          
          console.log('Auth Check:', { email: userEmail, isPrimaryAdmin });

          if (!docSnap.exists()) {
            const newProfile: any = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || '',
              status: 'active',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              role: 'visitor'
            };
            
            console.log('Creating new profile:', newProfile);
            await setDoc(profileRef, newProfile);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`, firebaseUser);
        }

        // Listen to profile changes in real-time
        unsubProfile = onSnapshot(profileRef, (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            setProfile(null);
          }
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`, firebaseUser);
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'system_admin',
    isSchoolAdmin: profile?.role === 'school_admin',
    isTeacher: profile?.role === 'teacher',
    isQuranTeacher: profile?.role === 'quran_teacher',
    isSportsCoach: profile?.role === 'sports_coach',
    isParent: profile?.role === 'parent',
    isChild: profile?.role === 'child',
    isAuthorizedPerson: profile?.role === 'authorized_person',
    isStaff: profile?.role === 'staff',
    isVisitor: profile?.role === 'visitor' || !profile?.role,
    isPending: profile?.status === 'pending',
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

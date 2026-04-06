export type UserRole = 'system_admin' | 'school_admin' | 'teacher' | 'parent' | 'child' | 'visitor';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role?: UserRole;
  schoolId?: string;
  status: 'active' | 'blocked';
  createdAt: any; // Firestore Timestamp
  requestedRole?: UserRole;
  requestMessage?: string;
  parentId?: string; // For children
  childIds?: string[]; // For parents
}

export interface School {
  id: string;
  name: string;
  address: string;
  adminId: string;
}

export interface Student {
  id: string;
  childUid: string;
  parentUid: string;
  schoolId: string;
  teacherId?: string;
  name: string;
  grade: string;
  location?: {
    lat: number;
    lng: number;
    lastUpdated: any; // Firestore Timestamp
  };
}

export interface Announcement {
  id: string;
  schoolId: string;
  title: string;
  content: string;
  createdAt: any; // Firestore Timestamp
}

export interface SOSAlert {
  id: string;
  childUid: string;
  parentUid: string;
  location: {
    lat: number;
    lng: number;
  };
  status: 'active' | 'resolved';
  createdAt: any; // Firestore Timestamp
}

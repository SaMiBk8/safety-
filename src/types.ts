export type UserRole = 
  | 'system_admin' 
  | 'school_admin' 
  | 'teacher' 
  | 'quran_teacher' 
  | 'sports_coach' 
  | 'parent' 
  | 'child' 
  | 'authorized_person' 
  | 'visitor';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role?: UserRole;
  schoolId?: string;
  status: 'active' | 'blocked' | 'pending';
  createdAt: any; // Firestore Timestamp
  requestedRole?: UserRole;
  requestMessage?: string;
  parentId?: string; // For children
  childIds?: string[]; // For parents
  authorizedBy?: string; // For authorized persons (parent UID)
  isDarkMode?: boolean;
  updatedAt?: any;
  photoUrl?: string;
  subject?: string; // For teachers
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
  teacherIds?: string[];
  name: string;
  grade: string;
  subject?: string;
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
  fileName?: string;
  fileUrl?: string;
  createdAt: any; // Firestore Timestamp
}

export interface Grade {
  id: string;
  studentId: string;
  teacherId: string;
  grade: string;
  comment?: string;
  behavior?: 'excellent' | 'good' | 'average' | 'poor';
  createdAt: any; // Firestore Timestamp
}

export interface Assignment {
  id: string;
  schoolId: string;
  teacherId: string;
  teacherName: string;
  teacherRole: UserRole;
  title: string;
  description: string;
  dueDate?: any; // Firestore Timestamp
  createdAt: any; // Firestore Timestamp
}

export interface SOSAlert {
  id: string;
  childUid: string;
  childName?: string;
  parentUid: string;
  location: {
    lat: number;
    lng: number;
  };
  status: 'active' | 'resolved';
  createdAt: any; // Firestore Timestamp
}

export interface QuranProgress {
  id: string;
  studentId: string;
  teacherId: string;
  surah: string;
  ayat?: string;
  rating: number;
  status: 'memorized' | 'reviewing' | 'improving';
  notes?: string;
  createdAt: any;
}

export interface HomeworkSubmission {
  id: string;
  studentId: string;
  studentName: string;
  schoolId: string;
  childUid: string;
  teacherId: string;
  title: string;
  description?: string;
  fileName?: string;
  fileUrl?: string;
  submittedAt: any; // Firestore Timestamp
  status: 'pending' | 'reviewed';
}

export interface SportsTraining {
  id: string;
  studentId: string;
  teacherId: string;
  exercise: string;
  duration: string;
  intensity: 'low' | 'medium' | 'high';
  notes?: string;
  createdAt: any;
}

import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, updateDoc, doc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Send, User, Paperclip, FileText, X, Loader2 } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { toast } from 'sonner';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  text: string;
  fileUrl?: string;
  fileName?: string;
  createdAt: any;
  isRead?: boolean;
}

interface ChatProps {
  receiverId: string;
  receiverName: string;
  roomId?: string; // Optional, can be derived from sender/receiver
}

export const Chat: React.FC<ChatProps> = ({ receiverId, receiverName, roomId }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.uid || !receiverId) return;

    // Room ID logic: sort IDs to ensure same room for both users
    const actualRoomId = roomId || [user.uid, receiverId].sort().join('_');

    const q = query(
      collection(db, 'messages'),
      where('roomId', '==', actualRoomId),
      where('participants', 'array-contains', user.uid),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(newMessages);

      // Mark unread messages as read
      snapshot.docs.forEach(async (docSnap) => {
        const data = docSnap.data();
        if (data.receiverId === user.uid && !data.isRead) {
          try {
            await updateDoc(doc(db, 'messages', docSnap.id), { isRead: true });
          } catch (e) {
            console.error("Error marking message as read:", e);
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages', user);
    });

    return () => unsubscribe();
  }, [user?.uid, receiverId, roomId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File is too large. Max 10MB.");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !user?.uid) return;

    const actualRoomId = roomId || [user.uid, receiverId].sort().join('_');
    setUploading(true);

    try {
      let fileUrl = '';
      let fileName = '';

      if (selectedFile) {
        // Optimization: For small files (< 400KB), use data URL to bypass Storage
        if (selectedFile.size < 400 * 1024) {
          const reader = new FileReader();
          fileUrl = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(selectedFile);
          });
        } else {
          const storagePath = `chat_files/${actualRoomId}/${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
          const storageRef = ref(storage, storagePath);
          const uploadTask = uploadBytesResumable(storageRef, selectedFile);

          fileUrl = await new Promise((resolve, reject) => {
            let lastBytesTransferred = 0;
            let stallTimeout = setTimeout(() => {
              uploadTask.cancel();
              reject(new Error("Upload stalled. Please check your connection."));
            }, 120000); // 2 minute stall timeout

            uploadTask.on('state_changed', 
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(progress);

                if (snapshot.bytesTransferred > lastBytesTransferred) {
                  lastBytesTransferred = snapshot.bytesTransferred;
                  clearTimeout(stallTimeout);
                  stallTimeout = setTimeout(() => {
                    uploadTask.cancel();
                    reject(new Error("Upload stalled. Please check your connection."));
                  }, 120000);
                }
              }, 
              (error: any) => {
                clearTimeout(stallTimeout);
                if (error.code === 'storage/retry-limit-exceeded') {
                  reject(new Error("Connection lost. Please check your internet."));
                } else {
                  reject(error);
                }
              }, 
              async () => {
                clearTimeout(stallTimeout);
                try {
                  const url = await getDownloadURL(uploadTask.snapshot.ref);
                  resolve(url);
                } catch (err) {
                  reject(err);
                }
              }
            );
          });
        }
        fileName = selectedFile.name;
      }

      await addDoc(collection(db, 'messages'), {
        roomId: actualRoomId,
        participants: [user.uid, receiverId],
        senderId: user.uid,
        senderName: user.displayName || 'User',
        receiverId,
        text: newMessage,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        createdAt: serverTimestamp(),
        isRead: false,
      });

      setNewMessage('');
      setSelectedFile(null);
      setUploadProgress(null);
    } catch (error: any) {
      console.error('Send Error:', error);
      toast.error(error.message || 'Failed to send message');
      handleFirestoreError(error, OperationType.CREATE, 'messages');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.senderId === user?.uid ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-slate-400">{msg.senderName}</span>
              <span className="text-[10px] text-slate-300">
                {msg.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div
              className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-sm space-y-2 ${
                msg.senderId === user?.uid
                  ? 'bg-blue-600 text-white rounded-tr-none'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'
              }`}
            >
              {msg.text && <p>{msg.text}</p>}
              {msg.fileUrl && (
                <a 
                  href={msg.fileUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold transition-all ${
                    msg.senderId === user?.uid
                      ? 'bg-white/10 hover:bg-white/20 text-white'
                      : 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span className="truncate max-w-[150px]">{msg.fileName || 'View File'}</span>
                </a>
              )}
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
        {selectedFile && (
          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
              <FileText className="w-4 h-4 text-blue-500" />
              <span className="truncate max-w-[200px]">{selectedFile.name}</span>
            </div>
            <button 
              type="button" 
              onClick={() => setSelectedFile(null)}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white text-sm"
          />
          <button
            type="submit"
            disabled={uploading || (!newMessage.trim() && !selectedFile)}
            className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center min-w-[48px]"
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        
        {uploadProgress !== null && uploadProgress < 100 && (
          <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-600 transition-all duration-300" 
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </form>
    </div>
  );
};

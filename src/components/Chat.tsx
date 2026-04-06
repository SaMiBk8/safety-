import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Send, User } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  text: string;
  createdAt: any;
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
  const scrollRef = useRef<HTMLDivElement>(null);

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
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages', user);
    });

    return () => unsubscribe();
  }, [user?.uid, receiverId, roomId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user?.uid) return;

    const actualRoomId = roomId || [user.uid, receiverId].sort().join('_');

    try {
      await addDoc(collection(db, 'messages'), {
        roomId: actualRoomId,
        participants: [user.uid, receiverId],
        senderId: user.uid,
        senderName: user.displayName || 'User',
        receiverId,
        text: newMessage,
        createdAt: serverTimestamp(),
      });
      setNewMessage('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'messages');
    }
  };

  return (
    <div className="flex flex-col h-full">
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
              className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-sm ${
                msg.senderId === user?.uid
                  ? 'bg-blue-600 text-white rounded-tr-none'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white text-sm"
        />
        <button
          type="submit"
          disabled={!newMessage.trim()}
          className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
};

import React, { useState } from 'react';
import { ContactList } from './ContactList';
import { Chat } from './Chat';
import { MessageSquare, User, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const PrivateMessaging: React.FC = () => {
  const [selectedContact, setSelectedContact] = useState<{ uid: string; displayName: string } | null>(null);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden flex flex-col md:flex-row h-[600px]">
      {/* Sidebar / Contact List */}
      <div className={`w-full md:w-80 border-r border-slate-100 dark:border-slate-800 flex flex-col ${selectedContact ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            Messages
          </h3>
        </div>
        <div className="flex-1 overflow-hidden">
          <ContactList 
            onSelect={(contact) => setSelectedContact(contact)} 
            selectedId={selectedContact?.uid} 
          />
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col bg-slate-50/30 dark:bg-slate-950/30 ${!selectedContact ? 'hidden md:flex' : 'flex'}`}>
        <AnimatePresence mode="wait">
          {selectedContact ? (
            <motion.div 
              key={selectedContact.uid}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col h-full"
            >
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setSelectedContact(null)}
                    className="md:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5 text-slate-600" />
                  </button>
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center font-bold text-blue-600">
                    {selectedContact.displayName[0].toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">{selectedContact.displayName}</h4>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Online</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-hidden">
                <Chat 
                  receiverId={selectedContact.uid} 
                  receiverName={selectedContact.displayName} 
                />
              </div>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4"
            >
              <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-[2rem] flex items-center justify-center">
                <MessageSquare className="w-10 h-10 text-slate-300" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Your Inbox</h3>
                <p className="text-slate-400 text-sm max-w-[250px] mx-auto">
                  Select a contact from the list to start a secure conversation and share files.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

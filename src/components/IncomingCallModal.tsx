import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneOff, Video } from 'lucide-react';

interface IncomingCallModalProps {
  isOpen: boolean;
  callerName: string;
  onAccept: () => void;
  onReject: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({ isOpen, callerName, onAccept, onReject }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
          />
          <motion.div 
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            className="relative bg-white dark:bg-slate-900 w-full max-w-sm rounded-[3rem] shadow-2xl overflow-hidden p-8 text-center"
          >
            <div className="w-24 h-24 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
              <Video className="w-12 h-12 text-blue-600" />
            </div>
            
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Incoming Call</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium">{callerName} is calling you...</p>

            <div className="flex gap-4">
              <button
                onClick={onReject}
                className="flex-1 py-4 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-200 transition-all"
              >
                <PhoneOff className="w-5 h-5" />
                Decline
              </button>
              <button
                onClick={onAccept}
                className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 dark:shadow-none"
              >
                <Phone className="w-5 h-5" />
                Accept
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

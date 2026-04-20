import React, { useEffect, useRef, useState } from 'react';
import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { X, Mic, MicOff, Video, VideoOff, PhoneOff, Maximize2, Minimize2 } from 'lucide-react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface VideoCallProps {
  appId: string;
  channel: string;
  callId?: string;
  token?: string;
  uid?: string | number;
  onClose: () => void;
}

export const VideoCall: React.FC<VideoCallProps> = ({ appId, channel, callId, token, uid, onClose }) => {
  const [client, setClient] = useState<IAgoraRTCClient | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<ICameraVideoTrack | null>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<IMicrophoneAudioTrack | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<any[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLDivElement>(null);
  const isInitializing = useRef(false);
  const [isFullScreen, setIsFullScreen] = useState(true);

  // Sync Call Status
  useEffect(() => {
    if (!callId || callId.startsWith('standalone_')) return;

    const unsubscribe = onSnapshot(doc(db, 'calls', callId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.status === 'ended' || data.status === 'rejected') {
          onClose();
        }
      } else {
        // If document was deleted, end call
        onClose();
      }
    });

    return () => unsubscribe();
  }, [callId, onClose]);

  const endCall = async () => {
    if (callId && !callId.startsWith('standalone_')) {
      try {
        await updateDoc(doc(db, 'calls', callId), { status: 'ended' });
      } catch (e) {
        console.error('Error ending call:', e);
      }
    }
    onClose();
  };

  useEffect(() => {
    let mounted = true;
    let agoraClient: IAgoraRTCClient | null = null;
    let audioTrack: IMicrophoneAudioTrack | null = null;
    let videoTrack: ICameraVideoTrack | null = null;

    const init = async () => {
      try {
        agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        if (!mounted) return;
        setClient(agoraClient);

        const trimmedAppId = appId?.trim();
        if (!trimmedAppId || trimmedAppId === 'YOUR_AGORA_APP_ID') {
          throw new Error('Agora App ID is missing or invalid. Please set VITE_AGORA_APP_ID in the Secrets panel.');
        }

        agoraClient.on('user-published', async (user, mediaType) => {
          if (!mounted) return;
          try {
            await agoraClient!.subscribe(user, mediaType);
            if (mediaType === 'video') {
              setRemoteUsers((prev) => {
                if (prev.find(u => u.uid === user.uid)) return prev;
                return [...prev, user];
              });
            }
            if (mediaType === 'audio') user.audioTrack?.play();
          } catch (e) {
            console.error('Subscription failed:', e);
          }
        });

        agoraClient.on('user-unpublished', (user, mediaType) => {
          if (mediaType === 'video') {
            setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
          }
        });

        agoraClient.on('user-left', (user) => {
          setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
        });

        let activeToken = token;
        const isInvalidToken = !activeToken || 
                              activeToken === 'MY_AGORA_TOKEN' || 
                              activeToken === 'undefined' || 
                              activeToken === 'null' ||
                              activeToken.length < 20;

        if (isInvalidToken) activeToken = undefined;
        
        if (!activeToken) {
          try {
            // Add timestamp to prevent caching
            const response = await fetch(`/api/agora/token?channelName=${encodeURIComponent(channel)}&t=${Date.now()}`);
            if (response.ok) {
              const data = await response.json();
              activeToken = data.token || undefined;
            }
          } catch (e) {
            console.error('Token fetch failed:', e);
          }
        }

        if (!mounted) return;

        // Join with a timeout to prevent hanging
        try {
          console.log(`Joining Agora channel: ${channel} with AppID: ${trimmedAppId.substring(0, 5)}...`);
          const joinPromise = agoraClient.join(trimmedAppId, channel, activeToken || null, 0);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout. Please check your internet or Agora configuration.')), 15000)
          );

          await Promise.race([joinPromise, timeoutPromise]);
        } catch (joinErr: any) {
          if (joinErr.message === 'OPERATION_ABORTED' || !mounted) return;
          
          // If we used a pre-set token from VITE_AGORA_TOKEN and it failed with timeout/key error,
          // it is likely expired. We should try to clear it and force a server token fetch.
          const isTokenTimeout = joinErr.message?.includes('timeout') || 
                                 joinErr.message?.includes('key') ||
                                 joinErr.code === 'CAN_NOT_GET_GATEWAY_SERVER';

          if (isTokenTimeout && token && activeToken === token) {
            console.warn('Environment token likely expired, retrying with server token...');
            // In a real app we might update state, but here we can just try one immediate retry with server fetch
            try {
              const resp = await fetch(`/api/agora/token?channelName=${encodeURIComponent(channel)}&t=${Date.now()}`);
              if (resp.ok) {
                const data = await resp.json();
                if (data.token) {
                   await agoraClient.join(trimmedAppId, channel, data.token, 0);
                   console.log('Retry join with server token successful');
                   // Fall through to track setup
                } else {
                   throw joinErr;
                }
              } else {
                throw joinErr;
              }
            } catch (retryErr) {
               console.error('Retry with server token failed:', retryErr);
               throw joinErr;
            }
          } else if (isTokenTimeout && activeToken) {
            console.warn('Join with token failed, attempting fallback join without token...');
            try {
              await agoraClient.join(trimmedAppId, channel, null, 0);
              console.log('Fallback join successful!');
            } catch (fallbackErr: any) {
              console.error('Fallback join also failed:', fallbackErr);
              throw joinErr; // Throw original error if fallback also fails
            }
          } else {
            throw joinErr;
          }
        }
        
        if (!mounted) {
          agoraClient.leave();
          return;
        }

        audioTrack = await AgoraRTC.createMicrophoneAudioTrack().catch(e => {
          console.warn('Microphone access denied:', e);
          return null;
        });
        
        videoTrack = await AgoraRTC.createCameraVideoTrack().catch(e => {
          console.warn('Camera access denied:', e);
          return null;
        });
        
        if (!mounted) {
          audioTrack?.close();
          videoTrack?.close();
          agoraClient.leave();
          return;
        }

        if (audioTrack) setLocalAudioTrack(audioTrack);
        if (videoTrack) {
          setLocalVideoTrack(videoTrack);
          if (localVideoRef.current) videoTrack.play(localVideoRef.current);
        }

        const tracksToPublish = [audioTrack, videoTrack].filter(t => t !== null) as any[];
        if (tracksToPublish.length > 0 && mounted) {
          await agoraClient.publish(tracksToPublish);
        }
      } catch (err: any) {
        if (!mounted || err.message === 'OPERATION_ABORTED') return;
        console.error('Agora init failed:', err);
        
        let msg = err.message || 'Failed to initialize video call';
        if (msg.includes('CAN_NOT_GET_GATEWAY_SERVER') || msg.includes('token') || msg.includes('dynamic key')) {
          msg = 'Security token error. This usually happens if the Agora App ID or Certificate is incorrect, or if the token has expired. Please check your Secrets panel.';
        } else if (msg.includes('timeout')) {
          msg = 'Connection timed out. Your network might be blocking the video stream (common on some public Wi-Fi).';
        } else if (msg.includes('Permission denied')) {
          msg = 'Camera or Microphone access was denied. Please check your browser permissions.';
        }
        
        setError(msg);
      }
    };

    init();

    return () => {
      mounted = false;
      audioTrack?.stop();
      audioTrack?.close();
      videoTrack?.stop();
      videoTrack?.close();
      if (agoraClient) {
        agoraClient.leave().catch(e => console.warn('Error leaving channel:', e));
        agoraClient.removeAllListeners();
      }
    };
  }, [appId, channel, token]);

  const toggleMute = () => {
    localAudioTrack?.setMuted(!isMuted);
    setIsMuted(!isMuted);
  };

  const toggleVideo = () => {
    localVideoTrack?.setMuted(!isVideoOff);
    setIsVideoOff(!isVideoOff);
  };

  return (
    <div className={`fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center ${isFullScreen ? 'p-0 overflow-hidden' : 'p-4'}`}>
      <div className={`relative w-full h-full bg-black overflow-hidden shadow-2xl ${isFullScreen ? 'w-screen h-[100dvh]' : 'max-w-4xl aspect-video rounded-3xl border border-white/10'} flex items-center justify-center`}>
        {error ? (
          <div className="p-8 text-center space-y-4 max-w-sm bg-slate-900 rounded-[2.5rem] shadow-2xl">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
              <PhoneOff className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-white uppercase tracking-tight">Call Failed</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              {error}
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all"
              >
                Retry
              </button>
              <button 
                onClick={endCall}
                className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Remote Videos */}
            <div className="absolute inset-0 z-0">
              {remoteUsers.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 bg-slate-950">
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 animate-pulse">
                    <Video className="w-10 h-10 text-slate-700" />
                  </div>
                  <p className="font-bold text-slate-400 tracking-wide uppercase text-xs">Waiting for participant...</p>
                  <p className="text-xs opacity-40 mt-2">Connecting to secure stream</p>
                </div>
              ) : remoteUsers.length === 1 ? (
                <div className="w-full h-full relative">
                  <RemoteVideoPlayer user={remoteUsers[0]} />
                  <div className="absolute top-safe mt-6 left-6 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] text-white font-bold uppercase tracking-widest">Live</span>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full grid grid-cols-2 gap-px bg-slate-900">
                  {remoteUsers.map((user) => (
                    <div key={user.uid} className="relative bg-slate-800">
                      <RemoteVideoPlayer user={user} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Local Video (Floating) */}
            <div 
              ref={localVideoRef}
              className="absolute top-safe mt-6 right-6 w-24 sm:w-32 md:w-48 aspect-[3/4] sm:aspect-video bg-slate-800 rounded-2xl overflow-hidden border-2 border-white/30 shadow-2xl z-10"
            />

            {/* Controls Overlay */}
            <div className="absolute bottom-safe mb-8 left-1/2 -translate-x-1/2 flex items-center gap-3 sm:gap-6 px-4 sm:px-8 py-3 sm:py-5 bg-black/20 backdrop-blur-3xl rounded-full border border-white/10 z-20 transition-all hover:bg-black/40">
              <button 
                onClick={toggleMute}
                className={`p-3 sm:p-4 rounded-full transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >
                {isMuted ? <MicOff className="w-5 h-5 sm:w-6 h-6" /> : <Mic className="w-5 h-5 sm:w-6 h-6" />}
              </button>
              
              <button 
                onClick={endCall}
                className="p-4 sm:p-5 bg-red-600 text-white rounded-full hover:bg-red-700 transition-all shadow-2xl shadow-red-600/40 active:scale-90"
              >
                <PhoneOff className="w-7 h-7 sm:w-9 h-9" />
              </button>

              <button 
                onClick={toggleVideo}
                className={`p-3 sm:p-4 rounded-full transition-all ${isVideoOff ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >
                {isVideoOff ? <VideoOff className="w-5 h-5 sm:w-6 h-6" /> : <Video className="w-5 h-5 sm:w-6 h-6" />}
              </button>
            </div>

            {/* Desktop Switcher */}
            <div className="absolute bottom-10 right-10 hidden sm:flex z-20">
              <button 
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="p-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all backdrop-blur-md"
              >
                {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const RemoteVideoPlayer: React.FC<{ user: any }> = ({ user }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      user.videoTrack?.play(ref.current);
    }
  }, [user]);

  return <div ref={ref} className="w-full h-full" />;
};

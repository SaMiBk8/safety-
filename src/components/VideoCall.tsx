import React, { useEffect, useRef, useState } from 'react';
import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { X, Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';

interface VideoCallProps {
  appId: string;
  channel: string;
  token?: string;
  uid?: string | number;
  onClose: () => void;
}

export const VideoCall: React.FC<VideoCallProps> = ({ appId, channel, token, uid, onClose }) => {
  const [client, setClient] = useState<IAgoraRTCClient | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<ICameraVideoTrack | null>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<IMicrophoneAudioTrack | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<any[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLDivElement>(null);
  const isInitializing = useRef(false);

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
          
          // Smart Fallback: If join with token fails with a timeout or certificate error, 
          // try joining WITHOUT a token (in case App Certificate is disabled)
          const isTokenError = joinErr.message?.includes('token') || 
                               joinErr.message?.includes('timeout') || 
                               joinErr.code === 'CAN_NOT_GET_GATEWAY_SERVER';
          
          if (isTokenError && activeToken) {
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
    <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="relative w-full max-w-4xl aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center">
        {error ? (
          <div className="p-8 text-center space-y-4 max-w-md">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
              <PhoneOff className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-white">Call Failed</h3>
            <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-line">
              {error}
            </p>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all"
              >
                Retry
              </button>
              <button 
                onClick={onClose}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Remote Videos */}
            <div className="absolute inset-0">
              {remoteUsers.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 bg-slate-900/50 backdrop-blur-sm">
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4 animate-pulse">
                    <Video className="w-10 h-10 text-slate-700" />
                  </div>
                  <p className="font-medium">Waiting for other participant...</p>
                  <p className="text-xs opacity-50 mt-1">They will appear here once they join</p>
                </div>
              ) : remoteUsers.length === 1 ? (
                <div className="w-full h-full relative bg-slate-800">
                  <RemoteVideoPlayer user={remoteUsers[0]} />
                  <div className="absolute bottom-4 left-4 bg-black/40 backdrop-blur-md px-4 py-2 rounded-2xl text-white text-xs font-bold border border-white/10 flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    Live Connection
                  </div>
                </div>
              ) : (
                <div className="w-full h-full grid grid-cols-2 gap-2 p-2 bg-slate-900">
                  {remoteUsers.map((user) => (
                    <div key={user.uid} className="relative bg-slate-800 rounded-2xl overflow-hidden border border-white/5">
                      <RemoteVideoPlayer user={user} />
                      <div className="absolute bottom-4 left-4 bg-black/50 px-3 py-1 rounded-lg text-white text-[10px] font-bold">
                        Remote User
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Local Video (Picture-in-Picture) */}
            <div 
              ref={localVideoRef}
              className="absolute bottom-6 right-6 w-32 md:w-48 aspect-video bg-slate-800 rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl z-10"
            />

            {/* Controls Overlay */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-4 bg-black/40 backdrop-blur-xl rounded-full border border-white/10 z-20">
              <button 
                onClick={toggleMute}
                className={`p-4 rounded-full transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              
              <button 
                onClick={onClose}
                className="p-4 bg-red-600 text-white rounded-full hover:bg-red-700 transition-all shadow-lg shadow-red-500/20"
              >
                <PhoneOff className="w-8 h-8" />
              </button>

              <button 
                onClick={toggleVideo}
                className={`p-4 rounded-full transition-all ${isVideoOff ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >
                {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
              </button>
            </div>
          </>
        )}
      </div>
      
      <div className="mt-6 text-white/50 text-sm font-medium flex items-center gap-2">
        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
        Secure Encrypted Channel: {channel}
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

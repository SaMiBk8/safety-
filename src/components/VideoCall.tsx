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

  const localVideoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      setClient(agoraClient);

      agoraClient.on('user-published', async (user, mediaType) => {
        await agoraClient.subscribe(user, mediaType);
        if (mediaType === 'video') {
          setRemoteUsers((prev) => [...prev, user]);
        }
        if (mediaType === 'audio') {
          user.audioTrack?.play();
        }
      });

      agoraClient.on('user-unpublished', (user) => {
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      });

      try {
        await agoraClient.join(appId, channel, token || null, uid || null);
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        const videoTrack = await AgoraRTC.createCameraVideoTrack();
        
        setLocalAudioTrack(audioTrack);
        setLocalVideoTrack(videoTrack);

        if (localVideoRef.current) {
          videoTrack.play(localVideoRef.current);
        }

        await agoraClient.publish([audioTrack, videoTrack]);
      } catch (error) {
        console.error('Agora init failed:', error);
      }
    };

    init();

    return () => {
      localAudioTrack?.close();
      localVideoTrack?.close();
      client?.leave();
    };
  }, [appId, channel, token, uid]);

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
      <div className="relative w-full max-w-4xl aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10">
        {/* Remote Videos */}
        <div className="absolute inset-0 grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
          {remoteUsers.map((user) => (
            <div key={user.uid} className="relative bg-slate-800 rounded-2xl overflow-hidden">
              <RemoteVideoPlayer user={user} />
              <div className="absolute bottom-4 left-4 bg-black/50 px-3 py-1 rounded-lg text-white text-xs font-bold">
                Remote User
              </div>
            </div>
          ))}
          {remoteUsers.length === 0 && (
            <div className="flex items-center justify-center text-slate-500 italic">
              Waiting for other participant...
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

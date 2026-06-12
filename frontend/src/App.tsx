import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatRoom } from './components/ChatRoom';
import { StatusFeed } from './components/StatusFeed';
import type { User, Message, DirectMessage, UserStatus, Room } from './types';
import { socket, BACKEND_URL } from './socket';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { CallAudioEffects } from './utils/audioSynth';

const AVATAR_OPTIONS = ['🦊', '🐯', '🐼', '🐨', '🐙', '🦄', '🦖', '👽', '👻', '👾', '🦁', '🦉'];

function App() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_OPTIONS[0]);
  const [authError, setAuthError] = useState<string | null>(null);

  // Layout & Channels State
  const [activeTab, setActiveTab] = useState<'chats' | 'groups' | 'spaces' | 'activity' | 'profile'>('chats');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeDirectUser, setActiveDirectUser] = useState<User | null>(null);
  
  // Spaces State
  const [spaces, setSpaces] = useState<string[]>([]);
  const [spaceAssignments, setSpaceAssignments] = useState<{ [chatId: string]: string[] }>({});
  const [mainWallPins, setMainWallPins] = useState<string[]>([]);
  const [spacePins, setSpacePins] = useState<{ [spaceName: string]: string[] }>({});
  const [keepOnWall, setKeepOnWall] = useState<string[]>([]);
  const [timerDurationHours, setTimerDurationHours] = useState<number>(24);
  const [warnOnMultiSpace, setWarnOnMultiSpace] = useState<boolean>(true);

  useEffect(() => {
    if (!currentUser) {
      setSpaces([]);
      setSpaceAssignments({});
      setMainWallPins([]);
      setSpacePins({});
      setKeepOnWall([]);
      setTimerDurationHours(24);
      setWarnOnMultiSpace(true);
      return;
    }

    const tag = currentUser.tag;
    
    // Load spaces
    const cachedSpaces = localStorage.getItem(`${tag}_spaces`);
    if (cachedSpaces) {
      setSpaces(JSON.parse(cachedSpaces));
    } else {
      const defaults = ['Work', 'Family', 'Friends'];
      setSpaces(defaults);
      localStorage.setItem(`${tag}_spaces`, JSON.stringify(defaults));
    }

    // Load space assignments
    const cachedAssignments = localStorage.getItem(`${tag}_space_assignments`);
    if (cachedAssignments) {
      setSpaceAssignments(JSON.parse(cachedAssignments));
    } else {
      setSpaceAssignments({});
    }

    // Load main wall pins
    const cachedMainWallPins = localStorage.getItem(`${tag}_main_wall_pins`);
    if (cachedMainWallPins) {
      setMainWallPins(JSON.parse(cachedMainWallPins));
    } else {
      setMainWallPins([]);
    }

    // Load space pins
    const cachedSpacePins = localStorage.getItem(`${tag}_space_pins`);
    if (cachedSpacePins) {
      setSpacePins(JSON.parse(cachedSpacePins));
    } else {
      setSpacePins({});
    }

    // Load keep on wall
    const cachedKeepOnWall = localStorage.getItem(`${tag}_keep_on_wall`);
    if (cachedKeepOnWall) {
      setKeepOnWall(JSON.parse(cachedKeepOnWall));
    } else {
      setKeepOnWall([]);
    }

    // Load timer setting
    const cachedTimer = localStorage.getItem(`${tag}_timer_hours`);
    if (cachedTimer) {
      setTimerDurationHours(Number(cachedTimer));
    } else {
      setTimerDurationHours(24);
    }

    // Load warn settings
    const cachedWarn = localStorage.getItem(`${tag}_warn_on_multi_space`);
    if (cachedWarn !== null) {
      setWarnOnMultiSpace(cachedWarn === 'true');
    } else {
      setWarnOnMultiSpace(true);
    }
  }, [currentUser]);

  const saveSpaces = (newSpaces: string[]) => {
    if (!currentUser) return;
    setSpaces(newSpaces);
    localStorage.setItem(`${currentUser.tag}_spaces`, JSON.stringify(newSpaces));
  };

  const saveSpaceAssignments = (newAssignments: { [chatId: string]: string[] }) => {
    if (!currentUser) return;
    setSpaceAssignments(newAssignments);
    localStorage.setItem(`${currentUser.tag}_space_assignments`, JSON.stringify(newAssignments));
  };

  const saveMainWallPins = (newPins: string[]) => {
    if (!currentUser) return;
    setMainWallPins(newPins);
    localStorage.setItem(`${currentUser.tag}_main_wall_pins`, JSON.stringify(newPins));
  };

  const saveSpacePins = (newSpacePins: { [spaceName: string]: string[] }) => {
    if (!currentUser) return;
    setSpacePins(newSpacePins);
    localStorage.setItem(`${currentUser.tag}_space_pins`, JSON.stringify(newSpacePins));
  };

  const saveKeepOnWall = (newKeep: string[]) => {
    if (!currentUser) return;
    setKeepOnWall(newKeep);
    localStorage.setItem(`${currentUser.tag}_keep_on_wall`, JSON.stringify(newKeep));
  };

  const saveTimerDurationHours = (hours: number) => {
    if (!currentUser) return;
    setTimerDurationHours(hours);
    localStorage.setItem(`${currentUser.tag}_timer_hours`, String(hours));
  };

  const saveWarnOnMultiSpace = (warn: boolean) => {
    if (!currentUser) return;
    setWarnOnMultiSpace(warn);
    localStorage.setItem(`${currentUser.tag}_warn_on_multi_space`, String(warn));
  };
  
  // Messages & Social Feeds
  const [messages, setMessages] = useState<Message[]>([]);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [statuses, setStatuses] = useState<UserStatus[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [chattedUserTags, setChattedUserTags] = useState<string[]>([]);

  // PWA Notification & Sorting State
  const [unreadRooms, setUnreadRooms] = useState<{ [roomTag: string]: number }>({});
  const [unreadDirects, setUnreadDirects] = useState<{ [userTag: string]: number }>({});
  const [roomLastMessage, setRoomLastMessage] = useState<{ [roomTag: string]: number }>({});
  const [directLastMessage, setDirectLastMessage] = useState<{ [userTag: string]: number }>({});

  const allUsersRef = useRef<User[]>([]);
  useEffect(() => {
    allUsersRef.current = allUsers;
    if (chattedUserTags.length < 0) {
      console.log(chattedUserTags);
    }
  }, [allUsers, chattedUserTags]);

  const statusUpdatesRef = useRef<Record<string, 'sent' | 'delivered' | 'seen'>>({});

  const triggerNotification = (title: string, body: string, tag?: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const options = {
        body,
        icon: '/icons/icon-192.png',
        badge: '/favicon.svg',
        tag: tag || 'antigravity-message',
        renotify: true,
      };
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, options).catch((err) => {
            console.error('ServiceWorker showNotification failed:', err);
            new Notification(title, options);
          });
        });
      } else {
        new Notification(title, options);
      }
    }
  };

  // Modals & Stories Player
  const [showPostStatusModal, setShowPostStatusModal] = useState(false);
  const [activeStoryUserId, setActiveStoryUserId] = useState<string | null>(null);
  const [initialStoryIndex, setInitialStoryIndex] = useState<number>(0);

  // Voice Call States
  type CallState = 'idle' | 'calling' | 'ringing' | 'connected';
  const [callState, _setCallState] = useState<CallState>('idle');
  const [callUserTag, setCallUserTag] = useState<string | null>(null);
  const [callUserName, setCallUserName] = useState<string | null>(null);
  const [callUserAvatar, setCallUserAvatar] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  // Voice Call Refs
  const callStateRef = useRef<CallState>('idle');
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioIntervalRef = useRef<any>(null);
  const audioEffectsRef = useRef<CallAudioEffects | null>(null);
  const incomingOfferRef = useRef<any>(null);

  const setCallState = (state: CallState) => {
    callStateRef.current = state;
    _setCallState(state);
  };

  const cleanupCall = () => {
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = null;
    }
    if (audioEffectsRef.current) {
      audioEffectsRef.current.stop();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setCallState('idle');
    setCallUserTag(null);
    setCallUserName(null);
    setCallUserAvatar(null);
    setCallDuration(0);
    setIsMuted(false);
    incomingOfferRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    audioEffectsRef.current = new CallAudioEffects();
    return () => {
      cleanupCall();
    };
  }, []);

  const startDurationTimer = () => {
    if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    setCallDuration(0);
    audioIntervalRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  };

  const initiateCall = async (target: User) => {
    if (!currentUser) return;
    cleanupCall();

    setCallState('calling');
    setCallUserTag(target.tag);
    setCallUserName(target.username);
    setCallUserAvatar(target.avatar);

    if (audioEffectsRef.current) {
      audioEffectsRef.current.playDialTone();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice_candidate', {
            target_tag: target.tag,
            sender_tag: currentUser.tag,
            candidate: event.candidate,
          });
        }
      };

      pc.ontrack = (event) => {
        if (remoteAudioRef.current && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('call_user', {
        receiver_tag: target.tag,
        caller_tag: currentUser.tag,
        caller_name: currentUser.username,
        caller_avatar: currentUser.avatar,
        offer: offer,
      });
    } catch (err) {
      console.error('Failed to initiate call:', err);
      cleanupCall();
    }
  };

  const acceptCall = async (overrideCallerTag?: any) => {
    const callerTag = typeof overrideCallerTag === 'string' ? overrideCallerTag : callUserTag;
    if (!currentUser || !callerTag || !incomingOfferRef.current) return;
    const offer = incomingOfferRef.current;

    if (audioEffectsRef.current) {
      audioEffectsRef.current.stop();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice_candidate', {
            target_tag: callerTag,
            sender_tag: currentUser.tag,
            candidate: event.candidate,
          });
        }
      };

      pc.ontrack = (event) => {
        if (remoteAudioRef.current && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('accept_call', {
        caller_tag: callerTag,
        receiver_tag: currentUser.tag,
        answer: answer,
      });

      setCallState('connected');
      startDurationTimer();
    } catch (err) {
      console.error('Failed to accept call:', err);
      cleanupCall();
    }
  };

  const rejectCall = () => {
    if (callUserTag) {
      socket.emit('reject_call', { caller_tag: callUserTag });
    }
    cleanupCall();
  };

  const endCall = () => {
    if (callUserTag) {
      socket.emit('end_call', { target_tag: callUserTag });
    }
    cleanupCall();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const cached = localStorage.getItem('chat_user_profile');
    if (cached) {
      const parsedUser = JSON.parse(cached);
      if (parsedUser && parsedUser.tag) {
        setCurrentUser(parsedUser);
        initializeSocket(parsedUser);
        fetchUsers();
        fetchChattedUsers(parsedUser.tag);
      } else {
        localStorage.removeItem('chat_user_profile');
      }
    }
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/tags`);
      if (res.ok) {
        const data: Room[] = await res.json();
        const defaultNames = ['general', 'tech', 'music', 'gaming'];
        const defaultRooms: Room[] = defaultNames.map(name => ({ name }));
        
        const seen = new Set<string>();
        const merged: Room[] = [];
        [...defaultRooms, ...data].forEach(r => {
          if (!seen.has(r.name)) {
            seen.add(r.name);
            merged.push(r);
          }
        });
        setRooms(merged);
      }
    } catch (err) {
      console.error('Failed to fetch rooms', err);
      setRooms(['general', 'tech', 'music', 'gaming'].map(name => ({ name })));
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/users`);
      if (res.ok) {
        const data = await res.json();
        setAllUsers(data);
      }
    } catch (err) {
      console.error('Failed to fetch registered users', err);
    }
  };

  const fetchChattedUsers = async (userTag: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/chatted?user_tag=${userTag}`);
      if (res.ok) {
        const data = await res.json();
        setChattedUserTags(data);
      }
    } catch (err) {
      console.error('Failed to fetch chatted users', err);
    }
  };

  const fetchChatSummary = async (userTag: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/chats/summary?user_tag=${userTag}`);
      if (res.ok) {
        const data = await res.json();
        if (data.direct_last_message) setDirectLastMessage(data.direct_last_message);
        if (data.direct_unread) setUnreadDirects(data.direct_unread);
        if (data.room_last_message) setRoomLastMessage(data.room_last_message);
      }
    } catch (err) {
      console.error('Failed to fetch chat summary', err);
    }
  };

  const initializeSocket = (user: User) => {
    socket.auth = { userTag: user.tag, username: user.username };
    socket.connect();
  };

  const subscribeToPushNotifications = async (userTag: string) => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported on this browser.');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        const res = await fetch(`${BACKEND_URL.replace(/\/$/, '')}/api/push/public-key`);
        const { publicKey } = await res.json();
        
        const base64 = publicKey.replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: outputArray
        });
      }
      
      await fetch(`${BACKEND_URL.replace(/\/$/, '')}/api/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_tag: userTag,
          subscription: subscription.toJSON()
        })
      });
      
      console.log('Push subscription registered successfully!');
    } catch (err) {
      console.error('Failed to subscribe to push notifications:', err);
    }
  };

  // Check URL parameters for call action on startup
  useEffect(() => {
    if (currentUser) {
      const params = new URLSearchParams(window.location.search);
      const action = params.get('action');
      const caller = params.get('caller');
      const offerStr = params.get('offer');
      if ((action === 'answer' || action === 'ringing') && caller && offerStr) {
        window.history.replaceState({}, document.title, window.location.pathname);
        
        try {
          const offer = JSON.parse(decodeURIComponent(offerStr));
          
          setTimeout(() => {
            setCallUserTag(caller);
            incomingOfferRef.current = offer;
            
            const callerUser = allUsersRef.current.find(u => u.tag === caller);
            if (callerUser) {
              setCallUserName(callerUser.username);
              setCallUserAvatar(callerUser.avatar);
            } else {
              setCallUserName(caller);
              setCallUserAvatar('🦊');
            }
            
            setCallState('ringing');
            
            if (action === 'answer') {
              acceptCall(caller);
            } else {
              if (audioEffectsRef.current) {
                audioEffectsRef.current.playRingTone();
              }
            }
          }, 1500);
        } catch (e) {
          console.error('Error parsing offer from query params:', e);
        }
      }
    }
  }, [currentUser]);

  // Socket event handlers
  useEffect(() => {
    if (!currentUser) return;

    fetchChattedUsers(currentUser.tag);
    fetchChatSummary(currentUser.tag);
    subscribeToPushNotifications(currentUser.tag);

    const handleConnect = () => {
      console.log('Socket connected, registering user tag:', currentUser.tag);
      socket.emit('register_socket', { user_tag: currentUser.tag });
    };

    if (socket.connected) {
      handleConnect();
    }

    socket.on('connect', handleConnect);

    // A. Online Presence Handlers
    socket.on('user_online', (data: { tag: string }) => {
      setAllUsers((prev) =>
        prev.map((u) => (u.tag === data.tag ? { ...u, online: true } : u))
      );
    });

    socket.on('user_offline', (data: { tag: string }) => {
      setAllUsers((prev) =>
        prev.map((u) => (u.tag === data.tag ? { ...u, online: false } : u))
      );
    });

    // B. Group Chats Handlers
    socket.on('room_history', (history: Message[]) => {
      setMessages(history);
      history.forEach((msg) => {
        if (msg.sender_id !== currentUser.tag && msg.status !== 'seen') {
          socket.emit('msg_seen', {
            message_id: msg.id,
            room_tag: msg.room_tag,
            user_id: currentUser.tag,
          });
        }
      });
    });

    socket.on('new_msg', (msg: Message) => {
      setRoomLastMessage((prev) => ({
        ...prev,
        [msg.room_tag]: msg.timestamp,
      }));

      const isCurrentActiveRoom = msg.room_tag === activeTag;

      if (isCurrentActiveRoom) {
        setMessages((prev) => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });

        if (msg.sender_id !== currentUser.tag) {
          socket.emit('msg_seen', {
            message_id: msg.id,
            room_tag: activeTag,
            user_id: currentUser.tag,
          });
        }
      } else if (msg.sender_id !== currentUser.tag) {
        setUnreadRooms((prev) => ({
          ...prev,
          [msg.room_tag]: (prev[msg.room_tag] || 0) + 1,
        }));

        socket.emit('msg_delivered', {
          message_id: msg.id,
          room_tag: msg.room_tag,
        });
      }

      if (msg.sender_id !== currentUser.tag && (!isCurrentActiveRoom || !document.hasFocus())) {
        triggerNotification(
          `#${msg.room_tag} | ${msg.sender_name}`,
          msg.msg_type === 'text' ? msg.content : `[Shared ${msg.msg_type}]`,
          `room-${msg.room_tag}`
        );
      }
    });

    socket.on('msg_status_update', (data: { id: string; status: 'delivered' | 'seen' }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === data.id ? { ...msg, status: data.status } : msg))
      );
    });

    socket.on('messages_seen', (data: { room_tag: string; user_id: string; message_ids: string[] }) => {
      if (data.room_tag === activeTag) {
        setMessages((prev) =>
          prev.map((msg) =>
            data.message_ids.includes(msg.id) ? { ...msg, status: 'seen' as const } : msg
          )
        );
      }
    });

    // C. Direct Chats Handlers
    socket.on('direct_history', (history: DirectMessage[]) => {
      setDirectMessages(history);
      
      // Mark received DMs as seen
      if (activeDirectUser) {
        socket.emit('direct_msg_seen', {
          sender_tag: activeDirectUser.tag,
          receiver_tag: currentUser.tag,
        });
      }
    });

    socket.on('new_direct_msg', (msg: DirectMessage) => {
      if (!allUsersRef.current.some(u => u.tag === msg.sender_tag)) {
        fetchUsers();
      }

      setDirectLastMessage((prev) => ({
        ...prev,
        [msg.sender_tag]: msg.timestamp,
      }));

      const isCurrentActiveDM = activeDirectUser && msg.sender_tag === activeDirectUser.tag;

      if (isCurrentActiveDM) {
        setDirectMessages((prev) => {
          if (prev.some(d => d.id === msg.id)) return prev;
          return [...prev, msg];
        });

        socket.emit('direct_msg_seen', {
          message_id: msg.id,
          sender_tag: msg.sender_tag,
          receiver_tag: currentUser.tag,
        });
      } else {
        setUnreadDirects((prev) => ({
          ...prev,
          [msg.sender_tag]: (prev[msg.sender_tag] || 0) + 1,
        }));
      }

      if (msg.sender_tag !== currentUser.tag && (!isCurrentActiveDM || !document.hasFocus())) {
        const senderUser = allUsersRef.current.find(u => u.tag === msg.sender_tag);
        const senderName = senderUser ? senderUser.username : `@${msg.sender_tag}`;
        triggerNotification(
          `Message from ${senderName}`,
          msg.msg_type === 'text' ? msg.content : `[Shared ${msg.msg_type}]`,
          `dm-${msg.sender_tag}`
        );
      }

      setChattedUserTags((prev) => {
        if (prev.includes(msg.sender_tag)) return prev;
        return [...prev, msg.sender_tag];
      });
    });

    socket.on('direct_msg_sent', (msg: DirectMessage) => {
      setDirectLastMessage((prev) => ({
        ...prev,
        [msg.receiver_tag]: msg.timestamp,
      }));

      const finalStatus = statusUpdatesRef.current[msg.id] || msg.status;
      const finalMsg = { ...msg, status: finalStatus };

      if (activeDirectUser && msg.receiver_tag === activeDirectUser.tag) {
        setDirectMessages((prev) => {
          if (prev.some(d => d.id === msg.id)) return prev;
          return [...prev, finalMsg];
        });
      }

      setChattedUserTags((prev) => {
        if (prev.includes(msg.receiver_tag)) return prev;
        return [...prev, msg.receiver_tag];
      });
    });

    socket.on('direct_msg_status_update', (data: { id: string; status: 'delivered' | 'seen'; sender_tag: string }) => {
      statusUpdatesRef.current[data.id] = data.status;

      setDirectMessages((prev) =>
        prev.map((msg) => (msg.id === data.id ? { ...msg, status: data.status } : msg))
      );
    });

    socket.on('direct_messages_seen', (data: { sender_tag: string; receiver_tag: string; message_ids: string[] }) => {
      data.message_ids.forEach((id) => {
        statusUpdatesRef.current[id] = 'seen';
      });

      if (activeDirectUser && data.sender_tag === currentUser.tag && data.receiver_tag === activeDirectUser.tag) {
        setDirectMessages((prev) =>
          prev.map((msg) =>
            data.message_ids.includes(msg.id) ? { ...msg, status: 'seen' as const } : msg
          )
        );
      }
    });

    // D. Social Feeds Handlers
    socket.on('statuses_list', (list: UserStatus[]) => {
      setStatuses(list);
    });

    socket.on('new_status', (status: UserStatus) => {
      setStatuses((prev) => {
        if (prev.some(s => s.id === status.id)) return prev;
        return [...prev, status];
      });
    });

    socket.on('status_posted', (status: UserStatus) => {
      setStatuses((prev) => {
        if (prev.some(s => s.id === status.id)) return prev;
        return [...prev, status];
      });
    });

    // E. Voice Call Signaling Listeners
    socket.on('incoming_call', (data: { caller_tag: string; caller_name: string; caller_avatar: string; offer: any }) => {
      if (callStateRef.current !== 'idle') {
        socket.emit('reject_call', { caller_tag: data.caller_tag });
        return;
      }
      setCallState('ringing');
      setCallUserTag(data.caller_tag);
      setCallUserName(data.caller_name);
      setCallUserAvatar(data.caller_avatar);
      incomingOfferRef.current = data.offer;

      if (audioEffectsRef.current) {
        audioEffectsRef.current.playRingTone();
      }

      triggerNotification(
        `📞 Incoming Call from ${data.caller_name}`,
        `@${data.caller_tag} is calling you...`,
        'antigravity-call'
      );
    });

    socket.on('call_accepted', async (data: { receiver_tag: string; answer: any }) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          setCallState('connected');
          startDurationTimer();
          if (audioEffectsRef.current) {
            audioEffectsRef.current.stop();
          }
        } catch (e) {
          console.error('Error setting remote answer:', e);
          cleanupCall();
        }
      }
    });

    socket.on('call_rejected', () => {
      cleanupCall();
      alert('Call declined');
    });

    socket.on('call_ended', () => {
      cleanupCall();
    });

    socket.on('ice_candidate', async (data: { sender_tag: string; candidate: any }) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error('Error adding ICE candidate:', e);
        }
      }
    });

    socket.emit('get_statuses');

    const statusInterval = setInterval(() => {
      socket.emit('get_statuses');
      fetchUsers(); // Refresh presence and new registered users periodically
      if (currentUser) {
        fetchChattedUsers(currentUser.tag);
        fetchChatSummary(currentUser.tag);
      }
    }, 20000);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('user_online');
      socket.off('user_offline');
      socket.off('room_history');
      socket.off('new_msg');
      socket.off('msg_status_update');
      socket.off('messages_seen');
      socket.off('direct_history');
      socket.off('new_direct_msg');
      socket.off('direct_msg_sent');
      socket.off('direct_msg_status_update');
      socket.off('direct_messages_seen');
      socket.off('statuses_list');
      socket.off('new_status');
      socket.off('status_posted');
      socket.off('incoming_call');
      socket.off('call_accepted');
      socket.off('call_rejected');
      socket.off('call_ended');
      socket.off('ice_candidate');
      clearInterval(statusInterval);
    };
  }, [currentUser, activeTag, activeDirectUser]);

  // Join Group Channel Room when active tag changes
  useEffect(() => {
    if (activeTag && currentUser) {
      setUnreadRooms((prev) => ({ ...prev, [activeTag]: 0 }));
      setMessages([]);
      setActiveDirectUser(null);
      setDirectMessages([]);
      socket.emit('join_room', {
        room_tag: activeTag,
        user_id: currentUser.tag,
        username: currentUser.username,
      });
    }
  }, [activeTag, currentUser]);

  // Load DM history when active recipient changes
  useEffect(() => {
    if (activeDirectUser && currentUser) {
      setUnreadDirects((prev) => ({ ...prev, [activeDirectUser.tag]: 0 }));
      setDirectMessages([]);
      setActiveTag(null);
      setMessages([]);
      socket.emit('get_direct_history', {
        sender_tag: currentUser.tag,
        receiver_tag: activeDirectUser.tag,
      });
    }
  }, [activeDirectUser, currentUser]);

  // ----------------------------------------------------
  // Authentication Forms Submissions
  // ----------------------------------------------------
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const cleanTag = tagInput.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!cleanTag) {
      setAuthError('Tag can only contain alphanumeric characters, dashes, and underscores.');
      return;
    }

    if (isSignUp) {
      // 1. Sign Up Route
      if (!usernameInput.trim()) return;
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tag: cleanTag,
            name: usernameInput.trim(),
            avatar: selectedAvatar,
            password: passwordInput,
          }),
        });

        if (res.status === 409) {
          setAuthError('Unique user tag is already taken! Try another one.');
          return;
        }

        if (res.ok) {
          // Success: Auto login
          const user: User = {
            tag: cleanTag,
            username: usernameInput.trim(),
            avatar: selectedAvatar,
          };
          setCurrentUser(user);
          localStorage.setItem('chat_user_profile', JSON.stringify(user));
          initializeSocket(user);
          fetchUsers();
        } else {
          setAuthError('Signup failed. Please try again.');
        }
      } catch (err) {
        setAuthError('Network error. Is the server running?');
      }
    } else {
      // 2. Log In Route
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tag: cleanTag,
            password: passwordInput,
          }),
        });

        if (res.status === 401) {
          setAuthError('Invalid user tag or password.');
          return;
        }

        if (res.ok) {
          const userProfile = await res.json();
          const user: User = {
            tag: userProfile.tag,
            username: userProfile.name,
            avatar: userProfile.avatar,
          };
          setCurrentUser(user);
          localStorage.setItem('chat_user_profile', JSON.stringify(user));
          initializeSocket(user);
          fetchUsers();
        } else {
          setAuthError('Login failed. Please try again.');
        }
      } catch (err) {
        setAuthError('Network error. Is the server running?');
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('chat_user_profile');
    setCurrentUser(null);
    socket.disconnect();
    setChattedUserTags([]);
  };

  const handleAddTag = async (tag: string) => {
    const cleanName = tag.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!cleanName) return;

    if (!rooms.some(r => r.name === cleanName)) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/rooms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: cleanName,
            creator_tag: currentUser?.tag
          })
        });
        if (res.ok) {
          const newRoom: Room = { name: cleanName, creator_tag: currentUser?.tag };
          setRooms((prev) => [...prev, newRoom]);
        }
      } catch (err) {
        console.error('Failed to create room', err);
      }
    }
    setActiveTag(cleanName);
    setActiveDirectUser(null);
  };

  // ----------------------------------------------------
  // Render Auth Setup Screen (Login / SignUp Tabs)
  // ----------------------------------------------------
  if (!currentUser) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-logo">Antigravity</div>
          <div className="auth-subtitle">Secure, Realtime Tags & Messaging</div>
          
          <div className="auth-tabs" style={{ display: 'flex', marginBottom: '24px', borderBottom: '1px solid var(--border-color)' }}>
            <button
              className={`nav-tab ${!isSignUp ? 'active' : ''}`}
              style={{ flex: 1, padding: '12px', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => { setIsSignUp(false); setAuthError(null); }}
            >
              Log In
            </button>
            <button
              className={`nav-tab ${isSignUp ? 'active' : ''}`}
              style={{ flex: 1, padding: '12px', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => { setIsSignUp(true); setAuthError(null); }}
            >
              Sign Up
            </button>
          </div>

          {authError && (
            <div style={{ color: '#ff5c5c', fontSize: '0.85rem', marginBottom: '16px', textAlign: 'center' }}>
              ⚠️ {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit}>
            {isSignUp && (
              <>
                <div className="form-group">
                  <label className="form-label">Choose Avatar</label>
                  <div className="avatar-selector">
                    {AVATAR_OPTIONS.map((avatar) => (
                      <div
                        key={avatar}
                        className={`avatar-option ${selectedAvatar === avatar ? 'selected' : ''}`}
                        onClick={() => setSelectedAvatar(avatar)}
                      >
                        {avatar}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Display Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Satoshi Nakamoto"
                    className="form-input"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    maxLength={30}
                    required
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">Unique User Tag (Username)</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '14px', top: '12px', color: 'var(--text-muted)' }}>@</span>
                <input
                  type="text"
                  placeholder="satoshi"
                  className="form-input"
                  style={{ paddingLeft: '32px' }}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  maxLength={20}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="form-input"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn-primary">
              {isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // Render Dashboard
  // ----------------------------------------------------
  return (
    <div className={`app-layout ${(activeTag || activeDirectUser) ? 'chat-active' : ''}`}>
      <Sidebar
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        rooms={rooms}
        activeTag={activeTag}
        setActiveTag={(tag) => { setActiveTag(tag); setActiveDirectUser(null); }}
        onAddTag={handleAddTag}
        statuses={statuses}
        onOpenStatusModal={() => setShowPostStatusModal(true)}
        onSelectUserStatus={(userId, initialIndex) => {
          setActiveStoryUserId(userId);
          setInitialStoryIndex(initialIndex ?? 0);
        }}
        allUsers={allUsers}
        activeDirectUser={activeDirectUser}
        setActiveDirectUser={(user) => { setActiveDirectUser(user); setActiveTag(null); }}
        onLogout={handleLogout}
        fetchRooms={fetchTags}
        unreadRooms={unreadRooms}
        unreadDirects={unreadDirects}
        roomLastMessage={roomLastMessage}
        directLastMessage={directLastMessage}
        spaces={spaces}
        saveSpaces={saveSpaces}
        spaceAssignments={spaceAssignments}
        saveSpaceAssignments={saveSpaceAssignments}
        mainWallPins={mainWallPins}
        saveMainWallPins={saveMainWallPins}
        spacePins={spacePins}
        saveSpacePins={saveSpacePins}
        keepOnWall={keepOnWall}
        saveKeepOnWall={saveKeepOnWall}
        timerDurationHours={timerDurationHours}
        saveTimerDurationHours={saveTimerDurationHours}
        warnOnMultiSpace={warnOnMultiSpace}
        saveWarnOnMultiSpace={saveWarnOnMultiSpace}
      />

      {(activeTag || activeDirectUser) ? (
        <ChatRoom
          currentUser={currentUser}
          activeTag={activeTag}
          activeDirectUser={activeDirectUser}
          messages={messages}
          directMessages={directMessages}
          onBackToSidebar={() => { setActiveTag(null); setActiveDirectUser(null); }}
          onStartCall={initiateCall}
        />
      ) : (
        <div className="chat-pane">
          <div className="chat-empty">
            <div className="chat-empty-logo">💬</div>
            <h2 style={{ marginBottom: '8px' }}>Welcome, {currentUser.username}!</h2>
            <p style={{ maxWidth: '350px', color: 'var(--text-muted)' }}>
              Select a group tag room or choose a user on the left to start a direct message, or share status updates.
            </p>
          </div>
        </div>
      )}

      {/* Stories Modals (Create / Player) */}
      <StatusFeed
        currentUser={currentUser}
        statuses={statuses}
        showPostModal={showPostStatusModal}
        onClosePostModal={() => setShowPostStatusModal(false)}
        activeStoryUserId={activeStoryUserId}
        initialStoryIndex={initialStoryIndex}
        onCloseStoryPlayer={() => setActiveStoryUserId(null)}
      />

      {/* Voice Call Overlay Screen */}
      {callState !== 'idle' && (
        <div className="call-overlay">
          <div className="call-container">
            <div className="call-avatar-container">
              <div className={`call-avatar-pulse ${callState === 'connected' ? 'connected' : ''}`}></div>
              <div className="call-avatar">{callUserAvatar || '🦊'}</div>
            </div>
            
            <h2 className="call-peer-name">{callUserName}</h2>
            <p className="call-peer-tag">@{callUserTag}</p>
            
            <div className="call-status-label">
              {callState === 'calling' && 'Calling...'}
              {callState === 'ringing' && 'Incoming Call...'}
              {callState === 'connected' && `Connected: ${(() => {
                const mins = Math.floor(callDuration / 60);
                const secs = callDuration % 60;
                return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
              })()}`}
            </div>
            
            <div className="call-actions">
              {callState === 'ringing' ? (
                <>
                  <button className="call-btn accept" onClick={acceptCall} title="Accept Call">
                    <Phone size={24} />
                  </button>
                  <button className="call-btn decline" onClick={rejectCall} title="Decline Call">
                    <PhoneOff size={24} />
                  </button>
                </>
              ) : (
                <>
                  <button 
                    className={`call-btn mute ${isMuted ? 'active' : ''}`} 
                    onClick={toggleMute}
                    title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
                  >
                    {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                  </button>
                  <button className="call-btn decline" onClick={endCall} title="End Call">
                    <PhoneOff size={24} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
    </div>
  );
}

export default App;

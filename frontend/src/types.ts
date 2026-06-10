export interface User {
  tag: string; // Unique user tag/handle (e.g. satoshi)
  username: string; // Display name
  avatar: string; // Avatar emoji
  online?: boolean;
}

export interface Message {
  id: string;
  room_tag: string;
  sender_id: string;
  sender_name: string;
  msg_type: 'text' | 'photo' | 'audio' | 'file';
  content: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  timestamp: number;
  status: 'sent' | 'delivered' | 'seen';
}

export interface DirectMessage {
  id: string;
  sender_tag: string;
  receiver_tag: string;
  msg_type: 'text' | 'photo' | 'audio' | 'file';
  content: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  timestamp: number;
  status: 'sent' | 'delivered' | 'seen';
}

export interface UserStatus {
  id: string;
  creator_id: string;
  creator_name: string;
  creator_avatar: string;
  media_type: 'photo' | 'video' | 'music';
  media_url: string;
  text_content: string;
  timestamp: number;
}

export interface Room {
  name: string;
  creator_tag?: string;
}

export interface StatusPermission {
  viewer_tag: string;
  username: string;
  avatar: string;
  allowed: boolean;
}

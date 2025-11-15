
export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnailUrl: string;
  viewCount: string;
  likeCount: string;
  commentCount: string;
  publishedAt: string;
  duration: string; // ISO 8601 format
  definition: 'hd' | 'sd';
  isForKids: boolean;
  topicCategories?: string[];
  description: string;
  tags: string[];
}

export interface YouTubeComment {
  author: string;
  text: string;
  publishedAt: string;
  likeCount: number;
}

export interface ApiSettings {
  keys: string[];
  activeKey: string | null;
}

export interface Channel {
  id: string;
  url: string;
  name: string;
  thumbnailUrl: string;
  uploadsPlaylistId: string;
  videos: YouTubeVideo[];
  subscriberCount?: string;
  videoCount?: string;
  tags?: string[];
  error?: string | null;
}
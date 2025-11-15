
import type { YouTubeVideo, YouTubeComment } from '../types';

const API_BASE_URL = 'https://www.googleapis.com/youtube/v3';

export interface ChannelInfo {
  id: string;
  name: string;
  thumbnailUrl: string;
  uploadsPlaylistId: string;
  subscriberCount?: string;
  videoCount?: string;
  tags?: string[];
}

const handleApiError = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json();
    const message = errorData.error?.message || `API request failed with status ${response.status}`;
    throw new Error(message);
  }
  return response.json();
};

const extractChannelId = (url: string): { type: 'id' | 'username' | 'custom' | 'handle' | null, value: string } => {
  const channelIdRegex = /youtube\.com\/channel\/([\w-]+)/;
  const handleRegex = /youtube\.com\/@([\w-.]+)/;
  const customUrlRegex = /youtube\.com\/c\/([\w-]+)/;
  const usernameRegex = /youtube\.com\/user\/([\w-]+)/;

  let match = url.match(channelIdRegex);
  if (match) return { type: 'id', value: match[1] };
  
  match = url.match(handleRegex);
  if (match) return { type: 'handle', value: match[1] };

  match = url.match(customUrlRegex);
  if (match) return { type: 'custom', value: match[1] };
  
  match = url.match(usernameRegex);
  if (match) return { type: 'username', value: match[1] };


  return { type: null, value: '' };
};

export const fetchChannelInfo = async (
  channelUrl: string,
  apiKey: string
): Promise<ChannelInfo> => {
  const { type, value } = extractChannelId(channelUrl);
  if (!type) {
    throw new Error(`Invalid YouTube channel URL format: ${channelUrl}`);
  }

  let queryParam = '';
  if (type === 'id') {
    queryParam = `id=${value}`;
  } else if (type === 'username') {
    queryParam = `forUsername=${value}`;
  } else if (type === 'handle') {
    // The 'forHandle' parameter is not officially documented for the channels endpoint,
    // so we use the search endpoint as a reliable fallback for handles.
    const searchUrl = new URL(`${API_BASE_URL}/search`);
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('q', value);
    searchUrl.searchParams.set('type', 'channel');
    searchUrl.searchParams.set('key', apiKey);
    const searchResponse = await fetch(searchUrl.toString()).then(handleApiError);
    if (!searchResponse.items || searchResponse.items.length === 0) {
      throw new Error(`Could not find a channel with handle: @${value}`);
    }
    const foundChannel = searchResponse.items[0];
    queryParam = `id=${foundChannel.id.channelId}`;
  } else if (type === 'custom') {
    // For legacy custom URLs (/c/...), we must use the search API as a fallback.
    const searchUrl = new URL(`${API_BASE_URL}/search`);
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('q', value);
    searchUrl.searchParams.set('type', 'channel');
    searchUrl.searchParams.set('key', apiKey);
    const searchResponse = await fetch(searchUrl.toString()).then(handleApiError);
    
    // This is not foolproof, but it's the best option for these legacy URLs.
    // We try to find a channel where the title matches the custom URL value.
    const foundChannel = searchResponse.items?.find((item: any) => 
        item.snippet.channelTitle.toLowerCase() === value.toLowerCase()
    );

    if (!foundChannel) {
      throw new Error(`Could not resolve legacy custom URL: /c/${value}. Please try a different URL format.`);
    }
    queryParam = `id=${foundChannel.id.channelId}`;
  }

  const channelUrlApi = new URL(`${API_BASE_URL}/channels`);
  channelUrlApi.search = new URLSearchParams(queryParam).toString();
  channelUrlApi.searchParams.set('part', 'contentDetails,snippet,statistics,brandingSettings');
  channelUrlApi.searchParams.set('key', apiKey);

  const channelResponse = await fetch(channelUrlApi.toString()).then(handleApiError);

  if (!channelResponse.items || channelResponse.items.length === 0) {
    throw new Error('YouTube channel not found.');
  }
  const channelItem = channelResponse.items[0];

  const tagsString = channelItem.brandingSettings?.channel?.keywords || '';
  const tags = tagsString.split(/\s+/).filter(Boolean);

  return {
      id: channelItem.id,
      name: channelItem.snippet.title,
      thumbnailUrl: channelItem.snippet.thumbnails.medium.url,
      uploadsPlaylistId: channelItem.contentDetails.relatedPlaylists.uploads,
      subscriberCount: channelItem.statistics.hiddenSubscriberCount ? undefined : channelItem.statistics.subscriberCount,
      videoCount: channelItem.statistics.videoCount,
      tags: tags,
  };
};

export const fetchChannelVideos = async (
  uploadsPlaylistId: string,
  apiKey: string,
  updateLoadingMessage: (message: string) => void
): Promise<YouTubeVideo[]> => {
  updateLoadingMessage(`Fetching video list...`);
  let videoIds: string[] = [];
  let nextPageToken: string | undefined = undefined;
  do {
    const playlistUrl = new URL(`${API_BASE_URL}/playlistItems`);
    playlistUrl.searchParams.set('part', 'snippet');
    playlistUrl.searchParams.set('playlistId', uploadsPlaylistId);
    playlistUrl.searchParams.set('maxResults', '50');
    playlistUrl.searchParams.set('key', apiKey);
    if (nextPageToken) {
      playlistUrl.searchParams.set('pageToken', nextPageToken);
    }

    const playlistResponse = await fetch(playlistUrl.toString()).then(handleApiError);
    const ids = playlistResponse.items.map((item: any) => item.snippet.resourceId.videoId);
    videoIds = videoIds.concat(ids);
    nextPageToken = playlistResponse.nextPageToken;
    updateLoadingMessage(`Found ${videoIds.length} videos...`);
  } while (nextPageToken);

  updateLoadingMessage(`Fetching details for ${videoIds.length} videos...`);
  const allVideos: YouTubeVideo[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const videoIdBatch = videoIds.slice(i, i + 50);
    const videosUrl = new URL(`${API_BASE_URL}/videos`);
    videosUrl.searchParams.set('part', 'snippet,statistics,contentDetails,status,topicDetails');
    videosUrl.searchParams.set('id', videoIdBatch.join(','));
    videosUrl.searchParams.set('key', apiKey);

    const videosResponse = await fetch(videosUrl.toString()).then(handleApiError);
    const videosData = videosResponse.items.map((item: any): YouTubeVideo => ({
      id: item.id,
      title: item.snippet.title,
      thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default.url,
      viewCount: item.statistics.viewCount || '0',
      likeCount: item.statistics.likeCount || '0',
      commentCount: item.statistics.commentCount || '0',
      publishedAt: item.snippet.publishedAt,
      duration: item.contentDetails.duration,
      definition: item.contentDetails.definition,
      isForKids: item.status.madeForKids,
      topicCategories: item.topicDetails?.topicCategories
        ?.map((url: string) => decodeURIComponent(url.split('/').pop()?.replace(/_/g, ' ') || ''))
        .filter(Boolean),
      description: item.snippet.description,
      tags: item.snippet.tags || [],
    }));
    allVideos.push(...videosData);
    updateLoadingMessage(`Fetched details for ${allVideos.length}/${videoIds.length} videos...`);
  }

  return allVideos;
};


export const getVideoComments = async (
  videoId: string,
  apiKey: string,
  updateProgress: (progress: number) => void
): Promise<YouTubeComment[]> => {
  let allComments: YouTubeComment[] = [];
  let nextPageToken: string | undefined = undefined;
  let totalFetched = 0;
  
  const videoDetailsResp = await fetch(`${API_BASE_URL}/videos?part=statistics&id=${videoId}&key=${apiKey}`).then(handleApiError);
  const totalComments = parseInt(videoDetailsResp.items[0]?.statistics?.commentCount || '0', 10);
  
  if (totalComments === 0) return [];
  
  try {
    do {
      const commentsUrl = new URL(`${API_BASE_URL}/commentThreads`);
      commentsUrl.searchParams.set('part', 'snippet');
      commentsUrl.searchParams.set('videoId', videoId);
      commentsUrl.searchParams.set('maxResults', '100');
      commentsUrl.searchParams.set('key', apiKey);
      if (nextPageToken) {
        commentsUrl.searchParams.set('pageToken', nextPageToken);
      }
      
      const response = await fetch(commentsUrl.toString()).then(handleApiError);
      
      const commentsData = response.items.map((item: any): YouTubeComment => {
        const snippet = item.snippet.topLevelComment.snippet;
        return {
          author: snippet.authorDisplayName,
          text: snippet.textDisplay,
          publishedAt: snippet.publishedAt,
          likeCount: snippet.likeCount,
        };
      });
      allComments.push(...commentsData);
      totalFetched += commentsData.length;
      
      if(totalComments > 0) {
        updateProgress(Math.min(100, (totalFetched / totalComments) * 100));
      }

      nextPageToken = response.nextPageToken;
    } while (nextPageToken);
  } catch(err: any) {
     if (err.message && err.message.includes('disabled comments')) {
        throw new Error('Comments are disabled for this video.');
     }
     throw err;
  }
  
  updateProgress(100);
  return allComments;
};

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { SettingsModal } from './components/SettingsModal';
import { VideoCard } from './components/VideoCard';
import { LoginScreen } from './components/LoginScreen';
import { SettingsIcon, TrashIcon, AddIcon, ArrowLeftIcon, RefreshIcon, SubscriberIcon, VideoCountIcon, DownloadIcon, ZipIcon, CloseIcon } from './components/Icons';
import { fetchChannelInfo, fetchChannelVideos, getVideoComments, saveVideosToCache, getVideosFromCache, deleteVideosFromCache, extractVideoId, fetchSingleVideoInfo } from './services/youtubeService';
import type { Channel, ApiSettings, YouTubeVideo, YouTubeComment } from './types';

declare var JSZip: any;

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('yt-analyzer-authenticated') === 'true';
  });

  const [apiSettings, setApiSettings] = useState<ApiSettings>(() => {
    try {
      const saved = localStorage.getItem('yt-analyzer-api');
      return saved ? JSON.parse(saved) : { keys: [], activeKey: null };
    } catch {
      return { keys: [], activeKey: null };
    }
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(!apiSettings.activeKey);

  const [channels, setChannels] = useState<Channel[]>(() => {
    try {
      const saved = localStorage.getItem('yt-analyzer-channels');
      if (saved) {
        const loadedChannels = JSON.parse(saved) as Omit<Channel, 'videos'>[];
        return loadedChannels.map(channel => ({
          ...channel,
          videos: [],
        }));
      }
      return [];
    } catch {
      return [];
    }
  });

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [newChannelUrl, setNewChannelUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [refreshingChannelId, setRefreshingChannelId] = useState<string | null>(null);

  const [isFetchingAllComments, setIsFetchingAllComments] = useState<boolean>(false);
  const [allCommentsProgress, setAllCommentsProgress] = useState<{ current: number; total: number; videoTitle: string } | null>(null);
  const [isDownloadOptionsOpen, setIsDownloadOptionsOpen] = useState<boolean>(false);
  const [channelForCommentDownload, setChannelForCommentDownload] = useState<Channel | null>(null);

  // Single Video Mode
  type DashboardMode = 'channel' | 'single-video';
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>('channel');
  const [singleVideoUrl, setSingleVideoUrl] = useState<string>('');
  const [singleVideo, setSingleVideo] = useState<YouTubeVideo | null>(null);
  const [singleVideoComments, setSingleVideoComments] = useState<YouTubeComment[]>([]);
  const [isFetchingSingleVideo, setIsFetchingSingleVideo] = useState<boolean>(false);
  const [singleVideoCommentProgress, setSingleVideoCommentProgress] = useState<number>(0);
  const [singleVideoError, setSingleVideoError] = useState<string | null>(null);
  const [isFetchingSingleComments, setIsFetchingSingleComments] = useState<boolean>(false);


  useEffect(() => {
    localStorage.setItem('yt-analyzer-api', JSON.stringify(apiSettings));
  }, [apiSettings]);

  useEffect(() => {
    const channelsToSave = channels.map(({ videos, ...rest }) => rest);
    localStorage.setItem('yt-analyzer-channels', JSON.stringify(channelsToSave));
  }, [channels]);

  const handleLogin = (user: string, pass: string): boolean => {
    if (user === 'admin' && pass === 'Youtube@2025') {
      localStorage.setItem('yt-analyzer-authenticated', 'true');
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const addChannel = useCallback(async () => {
    if (!newChannelUrl) return;
    if (channels.some(c => c.url === newChannelUrl)) {
      setError('This channel has already been added.');
      return;
    }
    if (!apiSettings.activeKey) {
      setError('Please set an active API key in settings.');
      setIsSettingsOpen(true);
      return;
    }

    setIsLoading(true);
    setError(null);
    setLoadingMessage(`Fetching info for ${newChannelUrl}...`);

    try {
      const channelInfo = await fetchChannelInfo(newChannelUrl, apiSettings.activeKey);
      const newChannel: Channel = {
        ...channelInfo,
        url: newChannelUrl,
        videos: [],
        error: null,
      };
      setChannels(prev => [...prev, newChannel]);
      setNewChannelUrl('');
    } catch (err: any) {
      setError(err.message || 'Failed to add channel.');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [newChannelUrl, apiSettings.activeKey, channels]);

  const removeChannel = (channelIdToRemove: string) => {
    deleteVideosFromCache(channelIdToRemove).catch(err => {
      console.error(`Failed to remove cached videos for channel ${channelIdToRemove}:`, err);
    });
    setChannels(prev => prev.filter(c => c.id !== channelIdToRemove));
  };

  const handleFetchVideos = useCallback(async (channelId: string) => {
    const channel = channels.find(c => c.id === channelId);
    if (!channel || !apiSettings.activeKey) return;

    setIsLoading(true);
    setError(null);
    setLoadingMessage(`Fetching videos for ${channel.name}...`);
    try {
      const videos = await fetchChannelVideos(
        channel.uploadsPlaylistId,
        apiSettings.activeKey,
        (msg) => setLoadingMessage(msg)
      );
      await saveVideosToCache(channelId, videos);
      setChannels(prev => prev.map(c =>
        c.id === channelId ? { ...c, videos: videos, error: null } : c
      ));
    } catch (err: any) {
      setChannels(prev => prev.map(c =>
        c.id === channelId ? { ...c, error: err.message || 'Could not fetch videos' } : c
      ));
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [channels, apiSettings.activeKey]);

  const handleSelectChannel = async (channelId: string) => {
    const channel = channels.find(c => c.id === channelId);
    if (!channel) return;

    setSelectedChannelId(channelId);

    if (channel.videos.length === 0) {
      setIsLoading(true);
      setLoadingMessage(`Checking for saved videos for ${channel.name}...`);
      try {
        const cachedVideos = await getVideosFromCache(channelId);
        if (cachedVideos && cachedVideos.length > 0) {
          setChannels(prev => prev.map(c =>
            c.id === channelId ? { ...c, videos: cachedVideos } : c
          ));
        }
      } catch (err) {
        console.error("Failed to load videos from cache:", err);
        setError("Could not load saved videos. You may need to fetch them again.");
      } finally {
        setIsLoading(false);
        setLoadingMessage('');
      }
    }
  };

  const handleRefreshChannel = useCallback(async (channelIdToRefresh: string) => {
    const channelToRefresh = channels.find(c => c.id === channelIdToRefresh);
    if (!channelToRefresh || !apiSettings.activeKey) return;

    setRefreshingChannelId(channelIdToRefresh);
    setError(null);
    try {
      const updatedChannelInfo = await fetchChannelInfo(channelToRefresh.url, apiSettings.activeKey);
      setChannels(prev => prev.map(c =>
        c.id === channelIdToRefresh ? { ...c, ...updatedChannelInfo } : c
      ));
    } catch (err: any) {
      setError(`Failed to refresh ${channelToRefresh.name}: ${err.message}`);
    } finally {
      setRefreshingChannelId(null);
    }
  }, [channels, apiSettings.activeKey]);

  const escapeCsvField = (field: any): string => {
    if (field === null || field === undefined) {
      return '';
    }
    const stringField = String(field);
    if (stringField.search(/("|,|\n)/g) >= 0) {
      return `"${stringField.replace(/"/g, '""')}"`;
    }
    return stringField;
  };

  const createVideoCommentsCsvString = (comments: YouTubeComment[], video: YouTubeVideo): string => {
    const headers = ['Video Description', 'Video Tags', 'Author', 'Published At', 'Like Count', 'Comment Text'];
    const sortedComments = [...comments].sort((a, b) => b.likeCount - a.likeCount);

    const csvRows = sortedComments.map((c, index) => {
      if (index === 0) {
        return [
          escapeCsvField(video.description),
          escapeCsvField(video.tags.join(' | ')),
          escapeCsvField(c.author),
          escapeCsvField(c.publishedAt),
          escapeCsvField(c.likeCount.toString()),
          escapeCsvField(c.text),
        ].join(',');
      } else {
        return [
          '',
          '',
          escapeCsvField(c.author),
          escapeCsvField(c.publishedAt),
          escapeCsvField(c.likeCount.toString()),
          escapeCsvField(c.text),
        ].join(',');
      }
    });

    return [
      headers.join(','),
      ...csvRows,
    ].join('\n');
  };

  const createChannelMetadataCsvString = (videos: YouTubeVideo[]): string => {
    const headers = [
      'Video Title',
      'Video URL',
      'Published At',
      'View Count',
      'Like Count',
      'Comment Count',
      'Duration',
      'Definition',
      'For Kids',
      'Topic Categories',
      'Description',
      'Tags',
    ];
    const csvRows = videos.map((video) => [
      escapeCsvField(video.title),
      escapeCsvField(`https://www.youtube.com/watch?v=${video.id}`),
      escapeCsvField(video.publishedAt),
      escapeCsvField(video.viewCount),
      escapeCsvField(video.likeCount),
      escapeCsvField(video.commentCount),
      escapeCsvField(video.duration),
      escapeCsvField(video.definition),
      escapeCsvField(video.isForKids ? 'Yes' : 'No'),
      escapeCsvField(video.topicCategories?.join(' | ') || ''),
      escapeCsvField(video.description),
      escapeCsvField(video.tags.join(' | ')),
    ].join(','));

    return [headers.join(','), ...csvRows].join('\n');
  };

  const downloadFile = (blob: Blob, filename: string) => {
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const handleExportChannelMetadata = (channel: Channel) => {
    if (!channel.videos.length) {
      setError('Please fetch videos for this channel before exporting metadata.');
      return;
    }

    const csvContent = createChannelMetadataCsvString(channel.videos);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadFile(blob, `${channel.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_metadata.csv`);
  };

  const handleFetchAllChannelComments = useCallback(async (channel: Channel, format: 'single' | 'zip') => {
    if (!apiSettings.activeKey || !channel.videos.length) return;

    setIsDownloadOptionsOpen(false);
    setIsFetchingAllComments(true);
    setAllCommentsProgress({ current: 0, total: channel.videos.length, videoTitle: '' });
    setError(null);

    const videosWithComments = channel.videos.filter(v => parseInt(v.commentCount, 10) > 0);
    const totalVideosToFetch = videosWithComments.length;

    if (totalVideosToFetch === 0) {
      setError("No videos with comments found in this channel.");
      setIsFetchingAllComments(false);
      setAllCommentsProgress(null);
      return;
    }

    if (format === 'single') {
      const csvRows: string[] = [];
      for (let i = 0; i < totalVideosToFetch; i++) {
        const video = videosWithComments[i];
        setAllCommentsProgress({ current: i + 1, total: totalVideosToFetch, videoTitle: video.title });
        try {
          const comments = await getVideoComments(video.id, apiSettings.activeKey, () => { });
          if (comments.length > 0) {
            const sortedComments = [...comments].sort((a, b) => b.likeCount - a.likeCount);
            const videoCommentRows = sortedComments.map((c, index) => {
              if (index === 0) {
                return [
                  escapeCsvField(video.title),
                  escapeCsvField(video.description),
                  escapeCsvField(video.tags.join(' | ')),
                  escapeCsvField(c.author),
                  escapeCsvField(c.publishedAt),
                  escapeCsvField(c.likeCount.toString()),
                  escapeCsvField(c.text),
                ].join(',');
              } else {
                return [
                  escapeCsvField(video.title),
                  '',
                  '',
                  escapeCsvField(c.author),
                  escapeCsvField(c.publishedAt),
                  escapeCsvField(c.likeCount.toString()),
                  escapeCsvField(c.text),
                ].join(',');
              }
            });
            csvRows.push(...videoCommentRows);
          }
        } catch (err: any) {
          console.warn(`Could not fetch comments for "${video.title}": ${err.message}`);
        }
      }
      if (csvRows.length > 0) {
        const headers = ['Video Title', 'Video Description', 'Video Tags', 'Author', 'Published At', 'Like Count', 'Comment Text'];
        const csvContent = [
          headers.join(','),
          ...csvRows
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        downloadFile(blob, `${channel.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_all_comments.csv`);
      } else {
        setError("Could not fetch any comments from the videos in this channel.");
      }
    } else { // 'zip' format
      const zip = new JSZip();
      const folderName = channel.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const commentsFolder = zip.folder(folderName);
      let filesAdded = 0;

      for (let i = 0; i < totalVideosToFetch; i++) {
        const video = videosWithComments[i];
        setAllCommentsProgress({ current: i + 1, total: totalVideosToFetch, videoTitle: video.title });
        try {
          const comments = await getVideoComments(video.id, apiSettings.activeKey, () => { });
          if (comments.length > 0) {
            const csvContent = createVideoCommentsCsvString(comments, video);
            const fileName = `${video.title.replace(/[^a-z0-9]/gi, '_').slice(0, 100)}.csv`;
            commentsFolder.file(fileName, csvContent);
            filesAdded++;
          }
        } catch (err: any) {
          console.warn(`Could not fetch comments for "${video.title}": ${err.message}`);
        }
      }

      if (filesAdded > 0) {
        setLoadingMessage('Generating ZIP file...');
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadFile(zipBlob, `${folderName}_comments.zip`);
        setLoadingMessage('');
      } else {
        setError("Could not fetch any comments to generate a ZIP file.");
      }
    }

    setIsFetchingAllComments(false);
    setAllCommentsProgress(null);
    setChannelForCommentDownload(null);
  }, [apiSettings.activeKey]);


  const formatNumber = (numStr: string | undefined): string => {
    if (!numStr) return 'N/A';
    const num = parseInt(numStr, 10);
    if (isNaN(num)) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(num);
  };

  const renderDownloadOptionsModal = () => {
    if (!isDownloadOptionsOpen || !channelForCommentDownload) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 border border-gray-700 w-full max-w-md rounded-lg shadow-xl p-6 relative animate-fade-in-up">
          <button onClick={() => setIsDownloadOptionsOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
          <h2 className="text-xl font-bold mb-4 text-white text-center">Download Comments</h2>
          <p className="text-center text-gray-400 mb-6">Choose the format for the comments from <strong className="text-white">{channelForCommentDownload.name}</strong>.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => handleFetchAllChannelComments(channelForCommentDownload, 'single')}
              className="p-4 bg-gray-800 hover:bg-gray-700/80 border border-gray-700 rounded-lg flex flex-col items-center justify-center gap-3 transition-colors"
            >
              <DownloadIcon className="w-8 h-8" />
              <span className="font-semibold">Single CSV File</span>
              <span className="text-xs text-gray-400 text-center">All comments in one file.</span>
            </button>
            <button
              onClick={() => handleFetchAllChannelComments(channelForCommentDownload, 'zip')}
              className="p-4 bg-gray-800 hover:bg-gray-700/80 border border-gray-700 rounded-lg flex flex-col items-center justify-center gap-3 transition-colors"
            >
              <ZipIcon className="w-8 h-8" />
              <span className="font-semibold">Zipped CSVs</span>
              <span className="text-xs text-gray-400 text-center">One CSV file per video.</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleFetchSingleVideo = useCallback(async () => {
    if (!singleVideoUrl) return;
    if (!apiSettings.activeKey) {
      setSingleVideoError('Please set an active API key in settings.');
      setIsSettingsOpen(true);
      return;
    }

    const videoId = extractVideoId(singleVideoUrl);
    if (!videoId) {
      setSingleVideoError('Invalid YouTube video URL. Supported formats: youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/...');
      return;
    }

    setIsFetchingSingleVideo(true);
    setSingleVideoError(null);
    setSingleVideo(null);
    setSingleVideoComments([]);
    setSingleVideoCommentProgress(0);

    try {
      const video = await fetchSingleVideoInfo(videoId, apiSettings.activeKey);
      setSingleVideo(video);

      // Auto-fetch comments
      if (parseInt(video.commentCount, 10) > 0) {
        setIsFetchingSingleComments(true);
        try {
          const comments = await getVideoComments(videoId, apiSettings.activeKey, (p) => setSingleVideoCommentProgress(p));
          setSingleVideoComments(comments);
        } catch (commentErr: any) {
          console.warn('Could not fetch comments:', commentErr.message);
        } finally {
          setIsFetchingSingleComments(false);
          setSingleVideoCommentProgress(0);
        }
      }
    } catch (err: any) {
      setSingleVideoError(err.message || 'Failed to fetch video info.');
    } finally {
      setIsFetchingSingleVideo(false);
    }
  }, [singleVideoUrl, apiSettings.activeKey]);

  const handleDownloadSingleVideoCsv = useCallback(() => {
    if (!singleVideo || singleVideoComments.length === 0) return;
    const csvContent = createVideoCommentsCsvString(singleVideoComments, singleVideo);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadFile(blob, `${singleVideo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_comments.csv`);
  }, [singleVideo, singleVideoComments]);

  const parseISODuration = (isoDuration: string): string => {
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = isoDuration.match(regex);
    if (!matches) return '0:00';
    const hours = matches[1] ? parseInt(matches[1], 10) : 0;
    const minutes = matches[2] ? parseInt(matches[2], 10) : 0;
    const seconds = matches[3] ? parseInt(matches[3], 10) : 0;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const renderSingleVideoResult = () => {
    if (isFetchingSingleVideo) {
      return (
        <div className="text-center my-10">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-400"></div>
          <p className="mt-4 text-lg">Fetching video info...</p>
        </div>
      );
    }

    if (singleVideoError) {
      return (
        <div className="bg-red-900/50 border border-red-700 text-red-200 p-4 rounded-lg text-center mt-6">
          <p><strong>Error:</strong> {singleVideoError}</p>
        </div>
      );
    }

    if (!singleVideo) return null;

    const v = singleVideo;
    return (
      <div className="mt-6 bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
        {/* Video Header */}
        <div className="flex flex-col md:flex-row gap-6 p-6">
          <div className="relative flex-shrink-0">
            <img src={v.thumbnailUrl} alt={v.title} className="w-full md:w-80 rounded-lg object-cover" />
            <span className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs font-semibold px-2 py-1 rounded-md">
              {parseISODuration(v.duration)}
            </span>
          </div>
          <div className="flex-grow">
            <h3 className="text-xl font-bold text-white mb-2">{v.title}</h3>
            <p className="text-sm text-gray-500 mb-4">Published on {new Date(v.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400 mb-4">
              <span className="flex items-center gap-1.5" title="Views">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                {formatNumber(v.viewCount)}
              </span>
              <span className="flex items-center gap-1.5" title="Likes">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" /></svg>
                {formatNumber(v.likeCount)}
              </span>
              <span className="flex items-center gap-1.5" title="Comments">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                {formatNumber(v.commentCount)}
              </span>
              <span className="bg-gray-700 px-2 py-0.5 rounded-full font-bold uppercase text-xs">{v.definition}</span>
              {v.isForKids && <span className="bg-yellow-800/50 text-yellow-300 px-2 py-0.5 rounded-full font-semibold text-xs">For Kids</span>}
            </div>
            {v.topicCategories && v.topicCategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {v.topicCategories.map(topic => (
                  <span key={topic} className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded-full">{topic}</span>
                ))}
              </div>
            )}
            {v.tags && v.tags.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-gray-400 mb-1.5">Tags</h4>
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                  {v.tags.map(tag => (
                    <span key={tag} className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="px-6 pb-4 border-t border-gray-800 pt-4">
          <h4 className="font-bold text-gray-200 mb-2 text-sm">Description</h4>
          <p className="text-gray-400 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto pr-2">{v.description || 'No description provided.'}</p>
        </div>

        {/* Comments Section */}
        <div className="px-6 pb-6 border-t border-gray-800 pt-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-gray-200 text-sm">Comments ({singleVideoComments.length})</h4>
            {singleVideoComments.length > 0 && (
              <button
                onClick={handleDownloadSingleVideoCsv}
                className="bg-white text-black font-bold py-1.5 px-4 rounded-md hover:bg-gray-300 transition-colors flex items-center gap-2 text-sm"
              >
                <DownloadIcon className="w-4 h-4" /> Download CSV
              </button>
            )}
          </div>

          {isFetchingSingleComments && (
            <div className="w-full bg-gray-700 rounded-full h-2.5 mb-4">
              <div className="bg-white h-2.5 rounded-full transition-all" style={{ width: `${singleVideoCommentProgress}%` }}></div>
              <p className="text-xs text-center mt-1 text-gray-300">Fetching comments... {singleVideoCommentProgress.toFixed(0)}%</p>
            </div>
          )}

          {!isFetchingSingleComments && singleVideoComments.length > 0 && (
            <div className="max-h-96 overflow-y-auto space-y-4 pr-2">
              {singleVideoComments.map((comment, index) => (
                <div key={index} className="text-sm text-gray-300 border-b border-gray-800 pb-3">
                  <p className="font-bold text-gray-100">{comment.author}</p>
                  <p className="whitespace-pre-wrap my-1 text-gray-300 text-xs" dangerouslySetInnerHTML={{ __html: comment.text }}></p>
                  <div className="flex items-center gap-3 text-gray-500 text-xs mt-1">
                    <span>{new Date(comment.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" /></svg>
                      {comment.likeCount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isFetchingSingleComments && singleVideoComments.length === 0 && parseInt(v.commentCount, 10) === 0 && (
            <p className="text-gray-500 text-sm text-center">No comments on this video.</p>
          )}

          {!isFetchingSingleComments && singleVideoComments.length === 0 && parseInt(v.commentCount, 10) > 0 && (
            <p className="text-gray-500 text-sm text-center">Comments could not be loaded (they may be disabled or restricted).</p>
          )}
        </div>
      </div>
    );
  };


  const renderDashboard = () => (
    <>
      {/* Mode Switcher */}
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center gap-1 rounded-full bg-gray-900/50 border border-gray-800 p-1 text-sm font-medium">
          <button
            onClick={() => setDashboardMode('channel')}
            className={`px-6 py-2 rounded-full transition-colors flex items-center gap-2 ${dashboardMode === 'channel' ? 'bg-white text-black' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            Channel Analysis
          </button>
          <button
            onClick={() => setDashboardMode('single-video')}
            className={`px-6 py-2 rounded-full transition-colors flex items-center gap-2 ${dashboardMode === 'single-video' ? 'bg-white text-black' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Single Video
          </button>
        </div>
      </div>

      {dashboardMode === 'channel' ? (
        <>
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4">Add YouTube Channel</h2>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <input
                type="text"
                value={newChannelUrl}
                onChange={(e) => setNewChannelUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addChannel()}
                placeholder="e.g., https://www.youtube.com/@MrBeast"
                className="w-full bg-gray-900 border border-gray-700 text-white rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-shadow"
              />
              <button
                onClick={addChannel}
                disabled={isLoading}
                className="w-full sm:w-auto bg-white text-black font-bold py-3 px-6 rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <AddIcon className="w-5 h-5" /> Add
              </button>
            </div>
          </div>

          {channels.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {channels.map(channel => (
                <div key={channel.id} onClick={() => handleSelectChannel(channel.id)} className="relative group bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col items-center text-center cursor-pointer hover:bg-gray-800/60 transition-colors">
                  <button
                    onClick={(e) => { e.stopPropagation(); removeChannel(channel.id); }}
                    className="absolute top-2 right-2 p-1.5 bg-black/30 rounded-full text-gray-400 hover:text-white hover:bg-red-800/70 transition-colors"
                    aria-label={`Remove ${channel.name}`}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRefreshChannel(channel.id); }}
                    disabled={refreshingChannelId === channel.id}
                    className="absolute top-2 left-2 p-1.5 bg-black/30 rounded-full text-gray-400 hover:text-white hover:bg-gray-700/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Refresh ${channel.name}`}
                  >
                    <RefreshIcon className={`w-4 h-4 ${refreshingChannelId === channel.id ? 'animate-spin' : ''}`} />
                  </button>
                  <img src={channel.thumbnailUrl} alt={channel.name} className="w-24 h-24 rounded-full mb-3 border-2 border-gray-700 group-hover:border-gray-500 transition-colors" />
                  <h3 className="font-semibold text-white text-md mb-2 flex-grow">{channel.name}</h3>
                  <div className="flex justify-around w-full mt-auto text-xs text-gray-400 gap-2">
                    <span className="flex items-center gap-1.5" title="Subscribers">
                      <SubscriberIcon className="w-4 h-4" />
                      {formatNumber(channel.subscriberCount)}
                    </span>
                    <span className="flex items-center gap-1.5" title="Videos">
                      <VideoCountIcon className="w-4 h-4" />
                      {formatNumber(channel.videoCount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-20">
              <p className="text-lg">No channels added yet.</p>
              <p>Add a channel URL above to get started.</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4">Analyze Single Video</h2>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <input
                type="text"
                value={singleVideoUrl}
                onChange={(e) => setSingleVideoUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetchSingleVideo()}
                placeholder="e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                className="w-full bg-gray-900 border border-gray-700 text-white rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-shadow"
              />
              <button
                onClick={handleFetchSingleVideo}
                disabled={isFetchingSingleVideo}
                className="w-full sm:w-auto bg-white text-black font-bold py-3 px-6 rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                Analyze
              </button>
            </div>
          </div>
          {renderSingleVideoResult()}
        </>
      )}
    </>
  );

  const ChannelDetailView = ({ channel }: { channel: Channel }) => {
    type SortOrder = 'latest' | 'popular' | 'oldest';
    const [sortOrder, setSortOrder] = useState<SortOrder>('latest');

    const sortedVideos = useMemo(() => {
      if (!channel.videos) return [];
      const videosCopy: YouTubeVideo[] = [...channel.videos];
      switch (sortOrder) {
        case 'popular':
          return videosCopy.sort((a, b) => parseInt(b.viewCount, 10) - parseInt(a.viewCount, 10));
        case 'oldest':
          return videosCopy.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
        case 'latest':
        default:
          return videosCopy.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      }
    }, [channel.videos, sortOrder]);

    const sortOptions: { id: SortOrder, label: string }[] = [
      { id: 'latest', label: 'Latest' },
      { id: 'popular', label: 'Popular' },
      { id: 'oldest', label: 'Oldest' },
    ];

    return (
      <section aria-labelledby={`channel-title-${channel.id}`}>
        <div className="flex items-center justify-between gap-4 mb-6">
          <button onClick={() => setSelectedChannelId(null)} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors p-2 rounded-md bg-gray-900/50 border border-gray-800">
            <ArrowLeftIcon className="w-5 h-5" /> Back
          </button>
          {channel.videos.length > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-gray-900/50 border border-gray-800 p-1 text-sm font-medium">
              {sortOptions.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setSortOrder(opt.id)}
                  className={`px-4 py-1 rounded-full transition-colors ${sortOrder === opt.id ? 'bg-white text-black' : 'text-gray-400 hover:bg-gray-800'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-6 p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
          <img src={channel.thumbnailUrl} alt={`${channel.name} thumbnail`} className="w-16 h-16 rounded-full border-2 border-gray-700" />
          <div className="flex-grow text-center sm:text-left">
            <h2 id={`channel-title-${channel.id}`} className="text-2xl font-bold text-white">{channel.name}</h2>
            {channel.tags && channel.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2 justify-center sm:justify-start">
                {channel.tags.map(tag => (
                  <span key={tag} className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded-full">{tag}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex-shrink-0 mt-4 sm:mt-0">
            {channel.videos.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => handleExportChannelMetadata(channel)}
                  disabled={isFetchingAllComments || isLoading}
                  className="bg-gray-700 text-white font-bold py-2 px-4 rounded-md hover:bg-gray-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <DownloadIcon className="w-5 h-5" />
                  Export Metadata
                </button>
                <button
                  onClick={() => { setChannelForCommentDownload(channel); setIsDownloadOptionsOpen(true); }}
                  disabled={isFetchingAllComments || isLoading}
                  className="bg-white text-black font-bold py-2 px-4 rounded-md hover:bg-gray-300 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <DownloadIcon className="w-5 h-5" />
                  Get All Channel Comments
                </button>
              </div>
            )}
          </div>
        </div>

        {channel.error && (
          <div className="bg-red-900/30 border border-red-800 text-red-300 p-3 rounded-md text-sm mb-4">
            <p>An error occurred with this channel: {channel.error}</p>
          </div>
        )}

        {isFetchingAllComments && allCommentsProgress && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-lg text-center mb-2">Fetching All Channel Comments</h3>
            <p className="text-sm text-gray-400 text-center mb-2 truncate" title={allCommentsProgress.videoTitle}>
              Processing video {allCommentsProgress.current} of {allCommentsProgress.total}: "{allCommentsProgress.videoTitle}"
            </p>
            <div className="w-full bg-gray-700 rounded-full h-2.5">
              <div className="bg-white h-2.5 rounded-full" style={{ width: `${(allCommentsProgress.current / allCommentsProgress.total) * 100}%` }}></div>
            </div>
            {loadingMessage && <p className="text-xs text-center mt-1 text-gray-300">{loadingMessage}</p>}
          </div>
        )}

        {channel.videos.length === 0 && !isLoading && !isFetchingAllComments && (
          <div className="text-center py-10">
            <button
              onClick={() => handleFetchVideos(channel.id)}
              className="bg-white text-black font-bold py-3 px-8 rounded-md hover:bg-gray-300 transition-colors"
            >
              Get All Videos
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {sortedVideos.map((video) => (
            <VideoCard key={video.id} video={video} apiKey={apiSettings.activeKey!} />
          ))}
        </div>
      </section>
    );
  }

  const renderChannelDetail = () => {
    const channel = channels.find(c => c.id === selectedChannelId);
    if (!channel) return null;
    return <ChannelDetailView channel={channel} />;
  };



  return (
    <div className="bg-black min-h-screen text-gray-200 font-sans">
      <header className="sticky top-0 z-20 bg-black/80 backdrop-blur-md border-b border-gray-800 flex justify-between items-center p-4">
        <h1 className="text-xl md:text-2xl font-bold text-white tracking-wider">
          YouTube Channel Analyzer
        </h1>
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 rounded-full hover:bg-gray-800 transition-colors"
          aria-label="Settings"
        >
          <SettingsIcon className="w-6 h-6" />
        </button>
      </header>

      <main className="container mx-auto p-4 md:p-8">
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-200 p-4 rounded-lg text-center mb-8">
            <p><strong>Error:</strong> {error}</p>
          </div>
        )}

        {isLoading && (
          <div className="text-center my-10">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-400"></div>
            <p className="mt-4 text-lg">{loadingMessage}</p>
          </div>
        )}

        {!isLoading && (selectedChannelId ? renderChannelDetail() : renderDashboard())}
      </main>

      {renderDownloadOptionsModal()}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiSettings={apiSettings}
        setApiSettings={setApiSettings}
      />
    </div>
  );
};

export default App;

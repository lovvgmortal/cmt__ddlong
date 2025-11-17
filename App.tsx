
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { SettingsModal } from './components/SettingsModal';
import { VideoCard } from './components/VideoCard';
import { LoginScreen } from './components/LoginScreen';
import { SettingsIcon, TrashIcon, AddIcon, ArrowLeftIcon, RefreshIcon, SubscriberIcon, VideoCountIcon, DownloadIcon, ZipIcon, CloseIcon } from './components/Icons';
import { fetchChannelInfo, fetchChannelVideos, getVideoComments, saveVideosToCache, getVideosFromCache, deleteVideosFromCache } from './services/youtubeService';
import type { Channel, ApiSettings, YouTubeVideo, YouTubeComment } from './types';

declare var JSZip: any;

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('yt-analyzer-authenticated') === 'true';
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

  
  useEffect(() => {
    localStorage.setItem('yt-analyzer-api', JSON.stringify(apiSettings));
  }, [apiSettings]);

  useEffect(() => {
    const channelsToSave = channels.map(({ videos, ...rest }) => rest);
    localStorage.setItem('yt-analyzer-channels', JSON.stringify(channelsToSave));
  }, [channels]);

  const handleLogin = (user: string, pass: string): boolean => {
    if (user === 'admin' && pass === 'Youtube@2025') {
        sessionStorage.setItem('yt-analyzer-authenticated', 'true');
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
                const comments = await getVideoComments(video.id, apiSettings.activeKey, () => {});
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
                const comments = await getVideoComments(video.id, apiSettings.activeKey, () => {});
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


  const renderDashboard = () => (
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
            <AddIcon className="w-5 h-5"/> Add
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
              <img src={channel.thumbnailUrl} alt={channel.name} className="w-24 h-24 rounded-full mb-3 border-2 border-gray-700 group-hover:border-gray-500 transition-colors"/>
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
                <ArrowLeftIcon className="w-5 h-5"/> Back
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
          <img src={channel.thumbnailUrl} alt={`${channel.name} thumbnail`} className="w-16 h-16 rounded-full border-2 border-gray-700"/>
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
              <button
                onClick={() => { setChannelForCommentDownload(channel); setIsDownloadOptionsOpen(true); }}
                disabled={isFetchingAllComments || isLoading}
                className="bg-white text-black font-bold py-2 px-4 rounded-md hover:bg-gray-300 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <DownloadIcon className="w-5 h-5" />
                Get All Channel Comments
              </button>
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

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

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

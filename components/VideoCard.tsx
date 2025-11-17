
import React, { useState, useCallback } from 'react';
import type { YouTubeVideo, YouTubeComment } from '../types';
import { getVideoComments } from '../services/youtubeService';
import { ViewIcon, LikeIcon, CommentIcon, DownloadIcon, ChevronDownIcon } from './Icons';

interface VideoCardProps {
  video: YouTubeVideo;
  apiKey: string;
}

const formatNumber = (numStr: string): string => {
  const num = parseInt(numStr, 10);
  if (isNaN(num)) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(num);
};

const parseISODuration = (isoDuration: string): string => {
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = isoDuration.match(regex);
    if (!matches) return '0:00';

    const hours = matches[1] ? parseInt(matches[1], 10) : 0;
    const minutes = matches[2] ? parseInt(matches[2], 10) : 0;
    const seconds = matches[3] ? parseInt(matches[3], 10) : 0;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
};


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

export const VideoCard: React.FC<VideoCardProps> = ({ video, apiKey }) => {
  const [comments, setComments] = useState<YouTubeComment[]>([]);
  const [isFetchingComments, setIsFetchingComments] = useState<boolean>(false);
  const [commentsFetched, setCommentsFetched] = useState<boolean>(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [showComments, setShowComments] = useState<boolean>(false);
  const [isDetailsVisible, setIsDetailsVisible] = useState(false);

  const handleFetchComments = useCallback(async () => {
    setIsFetchingComments(true);
    setCommentError(null);
    setProgress(0);
    try {
      const fetchedComments = await getVideoComments(video.id, apiKey, (p) => setProgress(p));
      setComments(fetchedComments);
      setCommentsFetched(true);
      setShowComments(true); // Automatically show comments after fetching
    } catch (err: any) {
      setCommentError(err.message || 'Could not fetch comments.');
    } finally {
      setIsFetchingComments(false);
      setProgress(0);
    }
  }, [video.id, apiKey]);

  const handleDownloadCsv = () => {
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

    const csvContent = [
      headers.join(','),
      ...csvRows
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${video.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_comments.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-lg flex flex-col h-full transition-all duration-300">
      <div className="relative">
        <img src={video.thumbnailUrl} alt={video.title} className="w-full h-48 object-cover" />
        <span className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs font-semibold px-2 py-1 rounded-md">
          {parseISODuration(video.duration)}
        </span>
      </div>
      <div className="p-4 flex flex-col flex-grow">
        <h3 className="font-bold text-md text-white mb-2 h-12 overflow-hidden" title={video.title}>{video.title}</h3>
        <p className="text-xs text-gray-500 mb-2">
            Published on {new Date(video.publishedAt).toLocaleDateString()}
        </p>
        <div className="flex items-center justify-around text-sm text-gray-400 my-2">
          <span className="flex items-center gap-1.5" title="Views"><ViewIcon className="w-4 h-4" /> {formatNumber(video.viewCount)}</span>
          <span className="flex items-center gap-1.5" title="Likes"><LikeIcon className="w-4 h-4" /> {formatNumber(video.likeCount)}</span>
          <span className="flex items-center gap-1.5" title="Comments"><CommentIcon className="w-4 h-4" /> {formatNumber(video.commentCount)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mt-2 mb-2">
            <span className="bg-gray-700 px-2 py-0.5 rounded-full font-bold uppercase">{video.definition}</span>
            {video.isForKids && <span className="bg-yellow-800/50 text-yellow-300 px-2 py-0.5 rounded-full font-semibold">For Kids</span>}
        </div>
        {video.topicCategories && video.topicCategories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1 text-xs">
                {video.topicCategories.slice(0, 3).map(topic => (
                    <span key={topic} className="bg-gray-800 text-gray-300 px-2 py-1 rounded-full">{topic}</span>
                ))}
            </div>
        )}
        
        <div className="mt-auto pt-4">
            <button
                onClick={() => setIsDetailsVisible(!isDetailsVisible)}
                className="w-full flex justify-between items-center text-left text-sm text-gray-400 hover:text-white py-2 border-t border-b border-gray-800"
            >
                <span>Show Details</span>
                <ChevronDownIcon className={`w-5 h-5 transition-transform ${isDetailsVisible ? 'rotate-180' : ''}`} />
            </button>
        </div>


        <div className="pt-4 border-t border-gray-800">
          {commentError && <p className="text-red-400 text-xs text-center mb-2">{commentError}</p>}
          {isFetchingComments && (
            <div className="w-full bg-gray-700 rounded-full h-2.5">
              <div className="bg-white h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
              <p className="text-xs text-center mt-1 text-gray-300">Fetching comments... {progress.toFixed(0)}%</p>
            </div>
          )}
          {!isFetchingComments && !commentsFetched && parseInt(video.commentCount) > 0 && (
            <button
              onClick={handleFetchComments}
              className="w-full bg-gray-700 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-600 transition-colors text-sm"
            >
              Get All Comments
            </button>
          )}
          {!isFetchingComments && !commentsFetched && parseInt(video.commentCount) === 0 && (
             <p className="text-xs text-center text-gray-500">No comments to fetch.</p>
          )}
          {!isFetchingComments && commentsFetched && (
             <div className="flex gap-2">
                <button
                    onClick={() => setShowComments(!showComments)}
                    className="flex-grow bg-gray-700 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-600 transition-colors text-sm"
                >
                    {showComments ? 'Hide' : 'Show'} Comments ({comments.length})
                </button>
                <button
                    onClick={handleDownloadCsv}
                    className="bg-white text-black font-bold p-2 rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center text-sm"
                    aria-label="Download CSV"
                >
                    <DownloadIcon className="w-5 h-5" />
                </button>
            </div>
          )}
        </div>
      </div>
      {isDetailsVisible && (
        <div className="p-4 border-t border-gray-800 bg-gray-900/50 text-xs">
            <h4 className="font-bold text-gray-200 mb-2">Description</h4>
            <p className="text-gray-400 whitespace-pre-wrap max-h-32 overflow-y-auto pr-2 mb-4">{video.description || 'No description provided.'}</p>
            <h4 className="font-bold text-gray-200 mb-2">Tags</h4>
            {video.tags && video.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                    {video.tags.map(tag => (
                         <span key={tag} className="bg-gray-700 text-gray-300 px-2 py-1 rounded-full">{tag}</span>
                    ))}
                </div>
            ) : (
                <p className="text-gray-500">No tags for this video.</p>
            )}
        </div>
      )}
      {commentsFetched && showComments && (
        <div className="p-4 border-t border-gray-800 bg-gray-900/50">
          <div className="max-h-60 overflow-y-auto space-y-4 pr-2">
            {comments.length > 0 ? comments.map((comment, index) => (
              <div key={index} className="text-sm text-gray-300">
                <p className="font-bold text-gray-100">{comment.author}</p>
                <p className="whitespace-pre-wrap my-1 text-gray-300 text-xs" dangerouslySetInnerHTML={{ __html: comment.text }}></p>
                <div className="flex items-center gap-3 text-gray-500 text-xs mt-1">
                  <span>{new Date(comment.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  <span className="flex items-center gap-1"><LikeIcon className="w-3 h-3"/> {comment.likeCount}</span>
                </div>
              </div>
            )) : <p className="text-gray-500 text-sm">No comments were found for this video.</p>}
          </div>
        </div>
      )}
    </div>
  );
};

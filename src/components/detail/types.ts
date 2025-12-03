import { ViewStyle } from 'react-native';

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

export interface WatchProviders {
  flatrate?: WatchProvider[];
  rent?: WatchProvider[];
  buy?: WatchProvider[];
}

export interface SimilarMediaItem {
  id: number;
  title?: string; // For movies
  name?: string; // For TV shows
  poster_path: string | null;
  release_date?: string; // For movies
  first_air_date?: string; // For TV shows
  vote_average: number;
}

export interface BackdropImage {
  file_path: string;
}

export interface ReviewAuthorDetails {
  avatar_path: string | null;
  rating: number | null;
}

export interface Review {
  id: string;
  author: string;
  author_details: ReviewAuthorDetails;
  content: string;
  created_at: string;
  updated_at: string;
}

// Component Props Interfaces
export interface WatchProvidersSectionProps {
  watchProviders: WatchProviders | null | undefined;
  link?: string;
  style?: ViewStyle;
}

export interface CastSectionProps {
  cast: Array<{
    id: number;
    name: string;
    character: string;
    profile_path: string | null;
    order: number;
  }>;
  onCastPress: (personId: number) => void;
  onViewAll: () => void;
  style?: ViewStyle;
}

export interface SimilarMediaSectionProps {
  mediaType: 'movie' | 'tv';
  items: SimilarMediaItem[];
  onMediaPress: (id: number) => void;
  title: string;
  style?: ViewStyle;
}

export interface PhotosSectionProps {
  images: BackdropImage[];
  onPhotoPress: (index: number) => void;
  style?: ViewStyle;
}

export interface VideosSectionProps {
  videos: Array<{
    id: string;
    key: string;
    name: string;
    site: string;
    type: string;
    official?: boolean;
  }>;
  onVideoPress: (video: {
    id: string;
    key: string;
    name: string;
    site: string;
    type: string;
    official?: boolean;
  }) => void;
  style?: ViewStyle;
}

export interface ReviewsSectionProps {
  isLoading: boolean;
  isError: boolean;
  reviews: Review[];
  shouldLoad: boolean;
  onReviewPress: (review: Review) => void;
  onLayout?: () => void;
  style?: ViewStyle;
}

export interface RecommendationsSectionProps {
  mediaType: 'movie' | 'tv';
  items: SimilarMediaItem[];
  isLoading: boolean;
  isError: boolean;
  shouldLoad: boolean;
  onMediaPress: (id: number) => void;
  onLayout?: () => void;
  style?: ViewStyle;
}

export interface CollectionSectionProps {
  collection: {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
  };
  shouldLoad: boolean;
  onCollectionPress: (collectionId: number) => void;
  onLayout?: () => void;
  style?: ViewStyle;
}

export interface CrewSectionProps {
  crew: Array<{
    id: number;
    name: string;
    job: string;
    department: string;
    profile_path: string | null;
  }>;
  onCrewPress: (personId: number) => void;
  style?: ViewStyle;
}

export interface RelatedEpisodesSectionProps {
  episodes: Array<{
    id: number;
    name: string;
    episode_number: number;
    season_number: number;
    air_date: string | null;
    overview: string;
    still_path: string | null;
    runtime: number | null;
    vote_average: number;
  }>;
  currentEpisodeNumber: number;
  seasonNumber: number;
  tvId: number;
  watchedEpisodes: Record<string, boolean>;
  onEpisodePress: (episodeNumber: number) => void;
  style?: ViewStyle;
}
